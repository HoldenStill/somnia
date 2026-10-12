import aiosqlite
import json
from datetime import datetime, timezone
from typing import Any, Optional, Dict, List
from . import config
from contextlib import asynccontextmanager

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

@asynccontextmanager
async def get_db():
    conn = await aiosqlite.connect(config.DB_PATH)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL;")
    await conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
    finally:
        await conn.close()

async def init_db() -> None:
    async with get_db() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS batches (
                id TEXT PRIMARY KEY,
                openrouter_batch_id TEXT,
                name TEXT NOT NULL,
                model TEXT NOT NULL,
                endpoint TEXT NOT NULL DEFAULT '/v1/chat/completions',
                status TEXT NOT NULL DEFAULT 'submitted',
                prompt_template TEXT NOT NULL,
                total_requests INTEGER NOT NULL DEFAULT 0,
                completed_requests INTEGER NOT NULL DEFAULT 0,
                failed_requests INTEGER NOT NULL DEFAULT 0,
                is_unread INTEGER NOT NULL DEFAULT 0,
                temperature REAL NOT NULL DEFAULT 1.0,
                reasoning_effort TEXT,
                system_prompt TEXT,
                response_format_json INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                error_message TEXT
            );
        """)

        # Migration checks for existing databases
        async with conn.execute("PRAGMA table_info(batches);") as cursor:
            cols = [row["name"] for row in await cursor.fetchall()]
            if "system_prompt" not in cols:
                await conn.execute("ALTER TABLE batches ADD COLUMN system_prompt TEXT;")
            if "response_format_json" not in cols:
                await conn.execute("ALTER TABLE batches ADD COLUMN response_format_json INTEGER NOT NULL DEFAULT 0;")
            if "total_cost" not in cols:
                await conn.execute("ALTER TABLE batches ADD COLUMN total_cost REAL;")
            if "total_tokens" not in cols:
                await conn.execute("ALTER TABLE batches ADD COLUMN total_tokens INTEGER;")
            if "total_prompt_tokens" not in cols:
                await conn.execute("ALTER TABLE batches ADD COLUMN total_prompt_tokens INTEGER;")
            if "total_completion_tokens" not in cols:
                await conn.execute("ALTER TABLE batches ADD COLUMN total_completion_tokens INTEGER;")
            if "estimated_cost" not in cols:
                await conn.execute("ALTER TABLE batches ADD COLUMN estimated_cost REAL;")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS batch_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
                custom_id TEXT NOT NULL,
                row_index INTEGER NOT NULL,
                input_data TEXT NOT NULL,
                rendered_prompt TEXT NOT NULL,
                response_text TEXT,
                raw_response TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                error TEXT,
                cost REAL,
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_tokens INTEGER
            );
        """)

        async with conn.execute("PRAGMA table_info(batch_items);") as cursor:
            item_cols = [row["name"] for row in await cursor.fetchall()]
            if "cost" not in item_cols:
                await conn.execute("ALTER TABLE batch_items ADD COLUMN cost REAL;")
            if "prompt_tokens" not in item_cols:
                await conn.execute("ALTER TABLE batch_items ADD COLUMN prompt_tokens INTEGER;")
            if "completion_tokens" not in item_cols:
                await conn.execute("ALTER TABLE batch_items ADD COLUMN completion_tokens INTEGER;")
            if "total_tokens" not in item_cols:
                await conn.execute("ALTER TABLE batch_items ADD COLUMN total_tokens INTEGER;")

        # Indexes
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_batches_created ON batches(created_at DESC);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id ON batch_items(batch_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_batch_items_custom_id ON batch_items(batch_id, custom_id);")

        await conn.commit()

async def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    async with get_db() as conn:
        async with conn.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return row["value"]
            return default

async def set_setting(key: str, value: str) -> None:
    now = utc_now_iso()
    async with get_db() as conn:
        await conn.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        """, (key, value, now))
        await conn.commit()

FALLBACK_MODEL_RATES = {
    "openai/gpt-4o:batch": (0.00000125, 0.000005),
    "openai/gpt-4o-mini:batch": (0.000000075, 0.0000003),
    "openai/o3-mini:batch": (0.00000055, 0.0000022),
    "anthropic/claude-sonnet-5.5:batch": (0.0000015, 0.0000075),
    "anthropic/claude-haiku-5.5:batch": (0.0000004, 0.000002),
    "deepseek/deepseek-v4.1-flash:batch": (0.00000007, 0.00000028),
    "google/gemini-2.5-flash:batch": (0.00000005, 0.0000002),
    "google/gemini-2.5-pro:batch": (0.000000625, 0.0000025),
}

def get_fallback_rates(model_id: str) -> tuple[float, float]:
    low = (model_id or "").lower().strip()
    if low in FALLBACK_MODEL_RATES:
        return FALLBACK_MODEL_RATES[low]
    base = low.replace(":batch", "")
    for k, v in FALLBACK_MODEL_RATES.items():
        if base in k:
            return v
    return (0.00000125, 0.000005)

def resolve_item_cost_and_tokens(item: Dict[str, Any], model_id: str) -> Dict[str, Any]:
    cost = item.get("cost")
    p_tok = item.get("prompt_tokens")
    c_tok = item.get("completion_tokens")
    t_tok = item.get("total_tokens")

    raw_str = item.get("raw_response")
    if raw_str and (cost is None or t_tok is None):
        try:
            raw = json.loads(raw_str)
            resp = raw.get("response", {})
            body = resp.get("body", resp) if isinstance(resp, dict) else {}
            usage = body.get("usage") or resp.get("usage") or raw.get("usage") or {}
            if isinstance(usage, dict):
                if cost is None and "cost" in usage and usage["cost"] is not None:
                    cost = float(usage["cost"])
                if p_tok is None and "prompt_tokens" in usage and usage["prompt_tokens"] is not None:
                    p_tok = int(usage["prompt_tokens"])
                if c_tok is None and "completion_tokens" in usage and usage["completion_tokens"] is not None:
                    c_tok = int(usage["completion_tokens"])
                if t_tok is None and "total_tokens" in usage and usage["total_tokens"] is not None:
                    t_tok = int(usage["total_tokens"])
        except Exception:
            pass

    # Fallback estimation for completed items if tokens or cost are still missing
    if item.get("status") == "completed" and (cost is None or t_tok is None):
        prompt_text = item.get("rendered_prompt") or ""
        resp_text = item.get("response_text") or ""
        if p_tok is None:
            p_tok = max(1, len(prompt_text) // 4)
        if c_tok is None:
            c_tok = max(1, len(resp_text) // 4)
        if t_tok is None:
            t_tok = p_tok + c_tok

        if cost is None:
            prompt_rate, comp_rate = get_fallback_rates(model_id)
            cost = (p_tok * prompt_rate) + (c_tok * comp_rate)

    item["cost"] = round(cost, 6) if cost is not None else None
    item["prompt_tokens"] = p_tok
    item["completion_tokens"] = c_tok
    item["total_tokens"] = t_tok
    return item

async def mark_batch_as_read(batch_id: str) -> bool:
    async with get_db() as conn:
        cursor = await conn.execute(
            "UPDATE batches SET is_unread = 0, updated_at = ? WHERE id = ?",
            (utc_now_iso(), batch_id)
        )
        await conn.commit()
        return cursor.rowcount > 0

async def list_batches(status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    async with get_db() as conn:
        query = "SELECT * FROM batches"
        params: List[Any] = []
        if status_filter == "active":
            query += " WHERE status IN ('submitted', 'in_progress', 'validating')"
        elif status_filter == "archive":
            query += " WHERE status IN ('completed', 'failed', 'cancelled', 'expired')"
        query += " ORDER BY created_at DESC"
        
        async with conn.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                if d.get("status") == "completed" and d.get("total_cost") is None:
                    async with conn.execute("SELECT cost, total_tokens, rendered_prompt, response_text, status FROM batch_items WHERE batch_id = ?", (d["id"],)) as ic:
                        irows = await ic.fetchall()
                        batch_cost = 0.0
                        batch_tokens = 0
                        has_items = False
                        for ir in irows:
                            item_d = resolve_item_cost_and_tokens(dict(ir), d.get("model", ""))
                            if item_d.get("cost") is not None:
                                batch_cost += item_d["cost"]
                                has_items = True
                            if item_d.get("total_tokens") is not None:
                                batch_tokens += item_d["total_tokens"]
                        if has_items:
                            d["total_cost"] = round(batch_cost, 6)
                            d["total_tokens"] = batch_tokens
                result.append(d)
            return result

async def get_batch_by_id(batch_id: str) -> Optional[Dict[str, Any]]:
    async with get_db() as conn:
        async with conn.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            batch = dict(row)

        async with conn.execute("SELECT * FROM batch_items WHERE batch_id = ? ORDER BY row_index ASC", (batch_id,)) as cursor:
            items = await cursor.fetchall()
            parsed_items = []
            for item in items:
                d = dict(item)
                try:
                    d["input_data"] = json.loads(d["input_data"])
                except Exception:
                    pass
                d = resolve_item_cost_and_tokens(d, batch.get("model", ""))
                parsed_items.append(d)
            batch["items"] = parsed_items

            if batch.get("total_cost") is None:
                item_costs = [i["cost"] for i in parsed_items if i.get("cost") is not None]
                if item_costs:
                    batch["total_cost"] = round(sum(item_costs), 6)

            if batch.get("total_tokens") is None:
                item_tokens = [i["total_tokens"] for i in parsed_items if i.get("total_tokens") is not None]
                if item_tokens:
                    batch["total_tokens"] = sum(item_tokens)

            return batch
