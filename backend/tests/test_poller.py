import pytest
import pytest_asyncio
import json
from unittest.mock import AsyncMock
from backend.app import config
from backend.app.services.poller import extract_response_content, poll_single_batch
from backend.app.database import get_db, get_batch_by_id, utc_now_iso

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

def test_extract_response_content():
    # Nested body format
    item1 = {
        "custom_id": "row-1",
        "response": {
            "body": {
                "choices": [
                    {"message": {"role": "assistant", "content": "Hello World!"}}
                ]
            }
        }
    }
    content, err = extract_response_content(item1)
    assert content == "Hello World!"
    assert err is None

    # Error format
    item2 = {
        "custom_id": "row-2",
        "error": {"message": "Rate limit exceeded"}
    }
    content, err = extract_response_content(item2)
    assert content is None
    assert "Rate limit exceeded" in err

@pytest.mark.asyncio
async def test_poll_completed_batch(monkeypatch, tmp_path):
    from backend.app.services.openrouter import openrouter_client

    batch_id = "test-poll-batch-1"
    now = utc_now_iso()

    async with get_db() as conn:
        await conn.execute("""
            INSERT INTO batches (
                id, openrouter_batch_id, name, model, endpoint, status, prompt_template,
                total_requests, completed_requests, failed_requests,
                is_unread, temperature, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            batch_id, "or-batch-123", "Test Poller Batch", "openai/gpt-4o",
            "/v1/chat/completions", "in_progress", "Template", 1, 0, 0, 0, 1.0, now, now
        ))
        await conn.execute("""
            INSERT INTO batch_items (
                batch_id, custom_id, row_index, input_data, rendered_prompt, status
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            batch_id, "row-1", 1, '{"key": "val"}', "Rendered prompt", "pending"
        ))
        await conn.commit()

    # Mock OpenRouter returning completed status
    mock_or_resp = {
        "id": "or-batch-123",
        "status": "completed",
        "request_counts": {
            "total": 1,
            "completed": 1,
            "failed": 0
        },
        "results": [
            {
                "custom_id": "row-1",
                "response": {
                    "body": {
                        "choices": [
                            {"message": {"content": "Generated completion text"}}
                        ]
                    }
                },
                "error": None
            }
        ]
    }
    monkeypatch.setattr(openrouter_client, "get_batch", AsyncMock(return_value=mock_or_resp))

    # Run poller on batch
    batch_record = await get_batch_by_id(batch_id)
    await poll_single_batch(batch_record)

    # Verify batch is completed and is_unread is 1
    updated = await get_batch_by_id(batch_id)
    assert updated["status"] == "completed"
    assert updated["is_unread"] == 1
    assert updated["completed_requests"] == 1
    assert updated["items"][0]["status"] == "completed"
    assert updated["items"][0]["response_text"] == "Generated completion text"

    # Verify results file persisted
    results_file = tmp_path / "results" / f"batch_{batch_id}_results.json"
    assert results_file.exists()
