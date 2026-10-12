import json
import logging
import httpx
from typing import Optional, Dict, Any, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from ..database import get_db, utc_now_iso, get_setting, resolve_item_cost_and_tokens
from .. import config
from .openrouter import openrouter_client

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

async def dispatch_webhook_notification(batch: Dict[str, Any], status: str, completed_count: int, failed_count: int) -> None:
    try:
        webhook_url = await get_setting("webhook_url")
        if not webhook_url:
            return

        icon = "✅" if status == "completed" else "⚠️"
        msg = (
            f"{icon} **Somnia Batch Notification**\n"
            f"Batch **{batch.get('name', 'Batch')}** ended with status: `{status}`\n"
            f"• Model: `{batch.get('model', 'unknown')}`\n"
            f"• Completed: `{completed_count}` | Failed: `{failed_count}`"
        )

        payload = {
            "content": msg,
            "text": msg,
            "message": msg,
            "batch_id": batch.get("id"),
            "status": status,
            "completed": completed_count,
            "failed": failed_count,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=payload)
            logger.info(f"Dispatched webhook notification: {resp.status_code}")
    except Exception as e:
        logger.warning(f"Failed to dispatch webhook notification: {e}")

def extract_response_content(result_item: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    """
    Safely extracts generated text and error message from an OpenRouter result item.
    Returns (response_text, error_message).
    """
    err = result_item.get("error")
    if err:
        err_msg = err if isinstance(err, str) else json.dumps(err)
        return None, err_msg

    resp = result_item.get("response")
    if not resp:
        return None, "No response object in result item"

    # Some endpoints wrap in body
    body = resp.get("body", resp)
    choices = body.get("choices", [])
    if choices and len(choices) > 0:
        first_choice = choices[0]
        msg = first_choice.get("message", {})
        content = msg.get("content")
        if content is not None:
            return str(content), None

    # Fallback for text completion shape
    if "text" in body:
        return str(body["text"]), None

    return json.dumps(body), None

async def poll_single_batch(batch: Dict[str, Any]) -> None:
    batch_id = batch["id"]
    or_batch_id = batch.get("openrouter_batch_id")
    if not or_batch_id:
        logger.warning(f"Batch {batch_id} has no OpenRouter batch ID to poll.")
        return

    logger.info(f"Polling OpenRouter batch {or_batch_id} for local batch {batch_id}...")

    try:
        remote_data = await openrouter_client.get_batch(or_batch_id)
        remote_status = remote_data.get("status", "").lower()
        request_counts = remote_data.get("request_counts", {})
        total_count = request_counts.get("total", batch["total_requests"])
        completed_count = request_counts.get("completed", 0)
        failed_count = request_counts.get("failed", 0)
        now = utc_now_iso()

        logger.info(f"Batch {batch_id} status: {remote_status} (completed: {completed_count}, failed: {failed_count})")

        if remote_status == "completed":
            results = remote_data.get("results", [])

            async with get_db() as conn:
                total_cost = 0.0
                total_tokens = 0
                total_prompt_tokens = 0
                total_completion_tokens = 0

                for item in results:
                    custom_id = item.get("custom_id")
                    if not custom_id:
                        continue
                    resp_text, err_msg = extract_response_content(item)
                    item_status = "failed" if err_msg else "completed"

                    item_dict = {
                        "status": item_status,
                        "raw_response": json.dumps(item),
                        "response_text": resp_text
                    }
                    resolved = resolve_item_cost_and_tokens(item_dict, batch.get("model", ""))
                    cost = resolved.get("cost")
                    p_tok = resolved.get("prompt_tokens")
                    c_tok = resolved.get("completion_tokens")
                    t_tok = resolved.get("total_tokens")

                    if cost is not None:
                        total_cost += cost
                    if t_tok is not None:
                        total_tokens += t_tok
                    if p_tok is not None:
                        total_prompt_tokens += p_tok
                    if c_tok is not None:
                        total_completion_tokens += c_tok

                    await conn.execute("""
                        UPDATE batch_items SET
                            response_text = ?,
                            raw_response = ?,
                            status = ?,
                            error = ?,
                            cost = ?,
                            prompt_tokens = ?,
                            completion_tokens = ?,
                            total_tokens = ?
                        WHERE batch_id = ? AND custom_id = ?
                    """, (
                        resp_text,
                        json.dumps(item),
                        item_status,
                        err_msg,
                        cost,
                        p_tok,
                        c_tok,
                        t_tok,
                        batch_id,
                        custom_id
                    ))

                # Update batch row: set is_unread = 1 and status = completed
                await conn.execute("""
                    UPDATE batches SET
                        status = 'completed',
                        total_requests = ?,
                        completed_requests = ?,
                        failed_requests = ?,
                        is_unread = 1,
                        completed_at = ?,
                        updated_at = ?,
                        total_cost = ?,
                        total_tokens = ?,
                        total_prompt_tokens = ?,
                        total_completion_tokens = ?
                    WHERE id = ?
                """, (
                    total_count,
                    completed_count,
                    failed_count,
                    now,
                    now,
                    round(total_cost, 6) if total_cost > 0 else None,
                    total_tokens if total_tokens > 0 else None,
                    total_prompt_tokens if total_prompt_tokens > 0 else None,
                    total_completion_tokens if total_completion_tokens > 0 else None,
                    batch_id
                ))
                await conn.commit()

            # Persist result log file in RESULTS_DIR
            try:
                res_file = config.RESULTS_DIR / f"batch_{batch_id}_results.json"
                with open(res_file, "w", encoding="utf-8") as f:
                    json.dump(remote_data, f, indent=2)
                logger.info(f"Saved batch results to {res_file}")
            except Exception as e:
                logger.error(f"Failed to write results file for batch {batch_id}: {e}")

            # Send webhook notification
            await dispatch_webhook_notification(batch, "completed", completed_count, failed_count)

        elif remote_status in ("failed", "cancelled", "expired"):
            err_msg = remote_data.get("error") or f"Batch ended with status: {remote_status}"
            if isinstance(err_msg, dict):
                err_msg = json.dumps(err_msg)

            async with get_db() as conn:
                await conn.execute("""
                    UPDATE batches SET
                        status = ?,
                        error_message = ?,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (remote_status, str(err_msg), now, now, batch_id))
                await conn.commit()

            # Send webhook notification
            await dispatch_webhook_notification(batch, remote_status, completed_count, failed_count)

        else:
            # Still in progress / validating
            async with get_db() as conn:
                await conn.execute("""
                    UPDATE batches SET
                        status = 'in_progress',
                        completed_requests = ?,
                        failed_requests = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (completed_count, failed_count, now, batch_id))
                await conn.commit()

    except Exception as e:
        logger.error(f"Error polling batch {batch_id} ({or_batch_id}): {e}")

async def poll_active_batches() -> None:
    """
    Main scheduled poller loop: finds all active batches in SQLite and checks OpenRouter.
    """
    logger.info("Executing scheduled batch poll cycle...")
    try:
        async with get_db() as conn:
            async with conn.execute(
                "SELECT * FROM batches WHERE status IN ('submitted', 'in_progress', 'validating') AND openrouter_batch_id IS NOT NULL"
            ) as cursor:
                rows = await cursor.fetchall()
                active_batches = [dict(r) for r in rows]

        if not active_batches:
            logger.debug("No active batches to poll.")
            return

        logger.info(f"Found {len(active_batches)} active batches to poll.")
        for batch in active_batches:
            await poll_single_batch(batch)

    except Exception as e:
        logger.error(f"Error in poll_active_batches cycle: {e}")

async def trigger_poll_now(batch_id: Optional[str] = None) -> None:
    """Manual on-demand trigger."""
    if batch_id:
        async with get_db() as conn:
            async with conn.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                row = await cursor.fetchone()
                if row:
                    await poll_single_batch(dict(row))
    else:
        await poll_active_batches()

def start_poller() -> None:
    if not scheduler.running:
        scheduler.add_job(
            poll_active_batches,
            trigger=IntervalTrigger(minutes=config.POLL_INTERVAL_MINUTES),
            id="openrouter_batch_poller",
            name="OpenRouter Batch Poller",
            replace_existing=True
        )
        scheduler.start()
        logger.info(f"APScheduler poller started (Interval: {config.POLL_INTERVAL_MINUTES} mins).")

def stop_poller() -> None:
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler poller stopped.")
