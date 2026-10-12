import pytest
import pytest_asyncio
import tempfile
import os
from pathlib import Path
from backend.app import config

@pytest_asyncio.fixture(autouse=True)
async def setup_test_db(monkeypatch, tmp_path):
    test_db = tmp_path / "test_somnia.db"
    monkeypatch.setattr(config, "DB_PATH", test_db)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "RESULTS_DIR", tmp_path / "results")
    (tmp_path / "results").mkdir(parents=True, exist_ok=True)
    
    from backend.app.database import init_db
    await init_db()
    yield

@pytest.mark.asyncio
async def test_settings_get_and_set():
    from backend.app.database import get_setting, set_setting
    
    val = await get_setting("openrouter_api_key")
    assert val is None
    
    await set_setting("openrouter_api_key", "sk-or-v1-testkey123")
    val = await get_setting("openrouter_api_key")
    assert val == "sk-or-v1-testkey123"

@pytest.mark.asyncio
async def test_batch_crud_and_unread_flag():
    from backend.app.database import get_db, mark_batch_as_read, list_batches, get_batch_by_id, utc_now_iso
    
    batch_id = "test-batch-1"
    now = utc_now_iso()
    async with get_db() as conn:
        await conn.execute("""
            INSERT INTO batches (
                id, name, model, endpoint, status, prompt_template,
                total_requests, completed_requests, failed_requests,
                is_unread, temperature, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            batch_id, "Test Batch", "openai/gpt-4o", "/v1/chat/completions",
            "completed", "Prompt {{test}}", 1, 1, 0, 1, 1.0, now, now
        ))
        await conn.execute("""
            INSERT INTO batch_items (
                batch_id, custom_id, row_index, input_data, rendered_prompt, response_text, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            batch_id, "row-1", 1, '{"test": "val"}', "Prompt val", "Generated output", "completed"
        ))
        await conn.commit()

    # List batches
    batches = await list_batches()
    assert len(batches) == 1
    assert batches[0]["id"] == batch_id
    assert batches[0]["is_unread"] == 1

    # Get batch by ID
    batch = await get_batch_by_id(batch_id)
    assert batch is not None
    assert len(batch["items"]) == 1
    assert batch["items"][0]["response_text"] == "Generated output"
    assert batch["items"][0]["input_data"] == {"test": "val"}

    # Mark as read
    marked = await mark_batch_as_read(batch_id)
    assert marked is True

    # Verify is_unread is now 0 and cost is tracked
    updated_batch = await get_batch_by_id(batch_id)
    assert updated_batch["is_unread"] == 0
    assert updated_batch["total_cost"] is not None
    assert updated_batch["total_cost"] > 0
    assert updated_batch["items"][0]["cost"] is not None
    assert updated_batch["items"][0]["cost"] > 0
    assert updated_batch["items"][0]["total_tokens"] is not None

