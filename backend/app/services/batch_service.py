import re
import uuid
import json
import csv
import io
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from ..database import get_db, utc_now_iso
from ..models import BatchCreateRequest
from .openrouter import openrouter_client
from ..config import RESULTS_DIR
from ..routers.models import resolve_batch_model

logger = logging.getLogger(__name__)

def render_prompt_template(template: str, row: Dict[str, Any]) -> str:
    """
    Substitutes {{variable}} placeholders with values from row dictionary.
    Handles whitespace inside braces (e.g., {{ product_name }}).
    """
    def replacer(match: re.Match) -> str:
        var_name = match.group(1).strip()
        # Look for exact match or case-insensitive match
        if var_name in row:
            val = row[var_name]
            return "" if val is None else str(val)
        for k, v in row.items():
            if k.strip().lower() == var_name.lower():
                return "" if v is None else str(v)
        return match.group(0) # Preserve untouched if not found

    return re.sub(r"\{\{\s*([^}]+)\s*\}\}", replacer, template)

class BatchService:
    @staticmethod
    async def create_batch(req: BatchCreateRequest) -> str:
        """
        Processes CSV rows, creates SQLite records, and submits batch to OpenRouter.
        Returns the generated batch_id.
        """
        if not req.csv_rows:
            raise ValueError("CSV rows list cannot be empty.")

        # Validate and resolve the model to its :batch endpoint
        resolved_model, is_batch = await resolve_batch_model(req.model)
        if not is_batch:
            raise ValueError(
                f"Model '{req.model}' does not have an OpenRouter :batch endpoint. "
                f"Please choose a model ending in ':batch' (such as 'openai/gpt-4o:batch' or 'deepseek/deepseek-v4.1-flash:batch')."
            )

        if resolved_model != req.model:
            logger.info(f"Auto-normalized model '{req.model}' to batch endpoint '{resolved_model}'")
            req.model = resolved_model

        batch_id = str(uuid.uuid4())
        batch_name = req.name or f"Batch - {req.model.split('/')[-1]} ({len(req.csv_rows)} items)"
        now = utc_now_iso()

        # Build requests payload for OpenRouter
        openrouter_requests: List[Dict[str, Any]] = []
        batch_items_data: List[Dict[str, Any]] = []

        for idx, row in enumerate(req.csv_rows, start=1):
            custom_id = f"row-{idx}"
            rendered_prompt = render_prompt_template(req.prompt_template, row)

            messages = []
            if req.system_prompt and req.system_prompt.strip():
                messages.append({"role": "system", "content": req.system_prompt.strip()})
            messages.append({"role": "user", "content": rendered_prompt})

            body: Dict[str, Any] = {
                "messages": messages,
                "temperature": req.temperature,
            }
            if req.response_format_json:
                body["response_format"] = {"type": "json_object"}

            if req.reasoning_effort and req.reasoning_effort.lower() != "none":
                body["reasoning"] = {"effort": req.reasoning_effort.lower()}
                body["reasoning_effort"] = req.reasoning_effort.lower()

            openrouter_requests.append({
                "custom_id": custom_id,
                "body": body
            })

            batch_items_data.append({
                "batch_id": batch_id,
                "custom_id": custom_id,
                "row_index": idx,
                "input_data": json.dumps(row),
                "rendered_prompt": rendered_prompt,
                "status": "pending"
            })

        # Save to SQLite initially
        async with get_db() as conn:
            await conn.execute("""
                INSERT INTO batches (
                    id, name, model, endpoint, status, prompt_template,
                    total_requests, completed_requests, failed_requests,
                    is_unread, temperature, reasoning_effort, system_prompt,
                    response_format_json, estimated_cost, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                batch_id,
                batch_name,
                req.model,
                "/v1/chat/completions",
                "submitted",
                req.prompt_template,
                len(openrouter_requests),
                0,
                0,
                0,
                req.temperature,
                req.reasoning_effort,
                req.system_prompt,
                1 if req.response_format_json else 0,
                req.estimated_cost,
                now,
                now
            ))

            for item in batch_items_data:
                await conn.execute("""
                    INSERT INTO batch_items (
                        batch_id, custom_id, row_index, input_data, rendered_prompt, status
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    item["batch_id"],
                    item["custom_id"],
                    item["row_index"],
                    item["input_data"],
                    item["rendered_prompt"],
                    item["status"]
                ))
            await conn.commit()

        # Submit to OpenRouter
        try:
            openrouter_resp = await openrouter_client.submit_batch(
                model=req.model,
                requests=openrouter_requests,
                endpoint="/v1/chat/completions"
            )
            or_batch_id = openrouter_resp.get("id")

            async with get_db() as conn:
                await conn.execute("""
                    UPDATE batches SET
                        openrouter_batch_id = ?,
                        status = 'in_progress',
                        updated_at = ?
                    WHERE id = ?
                """, (or_batch_id, utc_now_iso(), batch_id))
                await conn.commit()

            logger.info(f"Batch {batch_id} successfully submitted to OpenRouter with ID {or_batch_id}")
            return batch_id

        except Exception as e:
            logger.error(f"Failed to submit batch {batch_id} to OpenRouter: {e}")
            async with get_db() as conn:
                await conn.execute("""
                    UPDATE batches SET
                        status = 'failed',
                        error_message = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (str(e), utc_now_iso(), batch_id))
                await conn.commit()
            raise

    @staticmethod
    async def export_batch(batch_id: str, fmt: str = "csv") -> Dict[str, Any]:
        """
        Exports completed batch items into CSV or JSON string with original input columns.
        """
        async with get_db() as conn:
            async with conn.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                batch_row = await cursor.fetchone()
                if not batch_row:
                    raise ValueError(f"Batch {batch_id} not found.")
                batch = dict(batch_row)

            async with conn.execute("SELECT * FROM batch_items WHERE batch_id = ? ORDER BY row_index ASC", (batch_id,)) as cursor:
                item_rows = await cursor.fetchall()
                items = [dict(r) for r in item_rows]

        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', batch["name"])

        if fmt == "json":
            export_data = {
                "batch_id": batch["id"],
                "openrouter_batch_id": batch["openrouter_batch_id"],
                "name": batch["name"],
                "model": batch["model"],
                "status": batch["status"],
                "created_at": batch["created_at"],
                "completed_at": batch["completed_at"],
                "items": []
            }
            for item in items:
                input_data = {}
                try:
                    input_data = json.loads(item["input_data"])
                except Exception:
                    pass
                export_data["items"].append({
                    "custom_id": item["custom_id"],
                    "row_index": item["row_index"],
                    "input": input_data,
                    "rendered_prompt": item["rendered_prompt"],
                    "response": item["response_text"],
                    "status": item["status"],
                    "error": item["error"]
                })
            content = json.dumps(export_data, indent=2)
            filename = f"{clean_name}_{batch_id[:8]}.json"
            return {"content": content, "filename": filename, "media_type": "application/json"}

        if fmt in ("markdown", "md"):
            md_lines = [
                f"# Batch Report: {batch['name']}",
                f"- **Batch ID**: `{batch['id']}`",
                f"- **Model**: `{batch['model']}`",
                f"- **Status**: `{batch['status']}`",
                f"- **Created At**: {batch['created_at']}",
                f"- **Completed At**: {batch.get('completed_at') or 'N/A'}",
                f"- **Total Rows**: {len(items)}",
                "",
                "---",
                ""
            ]
            for item in items:
                md_lines.append(f"## Row {item['row_index']} (`{item['custom_id']}`)")
                md_lines.append(f"**Status**: {item['status']}")
                if item.get("error"):
                    md_lines.append(f"**Error**: {item['error']}")
                md_lines.append("")
                md_lines.append("### Input Data")
                try:
                    in_obj = json.loads(item["input_data"])
                    md_lines.append("```json")
                    md_lines.append(json.dumps(in_obj, indent=2))
                    md_lines.append("```")
                except Exception:
                    md_lines.append(f"`{item['input_data']}`")
                md_lines.append("")
                md_lines.append("### Rendered Prompt")
                md_lines.append(f"> {item['rendered_prompt']}")
                md_lines.append("")
                md_lines.append("### Response")
                if item["response_text"]:
                    md_lines.append(item["response_text"])
                else:
                    md_lines.append("*No response content*")
                md_lines.append("")
                md_lines.append("---")
                md_lines.append("")

            content = "\n".join(md_lines)
            filename = f"{clean_name}_{batch_id[:8]}.md"
            return {"content": content, "filename": filename, "media_type": "text/markdown; charset=utf-8"}

        # CSV format
        # Determine all input keys from first few items
        input_keys = []
        for item in items:
            try:
                row_dict = json.loads(item["input_data"])
                for k in row_dict.keys():
                    if k not in input_keys:
                        input_keys.append(k)
            except Exception:
                pass

        fieldnames = ["row_index", "custom_id"] + input_keys + ["rendered_prompt", "response", "status", "error"]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        for item in items:
            row_dict = {}
            try:
                row_dict = json.loads(item["input_data"])
            except Exception:
                pass
            csv_row = {
                "row_index": item["row_index"],
                "custom_id": item["custom_id"],
                "rendered_prompt": item["rendered_prompt"],
                "response": item["response_text"] or "",
                "status": item["status"],
                "error": item["error"] or ""
            }
            for k in input_keys:
                csv_row[k] = row_dict.get(k, "")
            writer.writerow(csv_row)

        content = output.getvalue()
        filename = f"{clean_name}_{batch_id[:8]}.csv"
        return {"content": content, "filename": filename, "media_type": "text/csv"}

    @staticmethod
    async def retry_failed_batch(batch_id: str) -> str:
        """
        Creates and submits a new batch containing only the failed items of an existing batch.
        """
        async with get_db() as conn:
            async with conn.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                batch_row = await cursor.fetchone()
                if not batch_row:
                    raise ValueError(f"Batch {batch_id} not found.")
                batch = dict(batch_row)

            async with conn.execute(
                "SELECT * FROM batch_items WHERE batch_id = ? AND status = 'failed' ORDER BY row_index ASC", 
                (batch_id,)
            ) as cursor:
                failed_items = [dict(r) for r in await cursor.fetchall()]

        if not failed_items:
            raise ValueError("No failed items to retry in this batch.")

        failed_rows = []
        for item in failed_items:
            try:
                failed_rows.append(json.loads(item["input_data"]))
            except Exception:
                failed_rows.append({})

        new_req = BatchCreateRequest(
            name=f"Retry ({len(failed_items)} items) - {batch['name']}",
            model=batch["model"],
            prompt_template=batch["prompt_template"],
            csv_rows=failed_rows,
            temperature=batch["temperature"],
            reasoning_effort=batch.get("reasoning_effort"),
            system_prompt=batch.get("system_prompt"),
            response_format_json=bool(batch.get("response_format_json", 0))
        )

        return await BatchService.create_batch(new_req)

batch_service = BatchService()
