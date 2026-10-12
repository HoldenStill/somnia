import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock
from backend.app import config
from backend.app.main import app

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
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["app"] == "Somnia"

@pytest.mark.asyncio
async def test_settings_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get settings initially
        resp = await client.get("/api/settings")
        assert resp.status_code == 200
        assert resp.json()["has_api_key"] is False

        # Update settings
        resp = await client.post("/api/settings", json={"api_key": "sk-or-v1-abcdef1234567890"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_api_key"] is True
        assert "sk-or-" in data["api_key_masked"]

@pytest.mark.asyncio
async def test_models_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/models")
        assert resp.status_code == 200
        models = resp.json()
        assert len(models) > 0
        model_ids = [m["id"] for m in models]
        assert "openai/gpt-4o" in model_ids
        assert any(m["supports_reasoning"] for m in models)
        assert any(m["is_batch_ready"] for m in models)

@pytest.mark.asyncio
async def test_batches_endpoints_flow(monkeypatch):
    from backend.app.services.openrouter import openrouter_client

    # Mock OpenRouter submit and get
    monkeypatch.setattr(openrouter_client, "submit_batch", AsyncMock(return_value={"id": "or-batch-555"}))
    monkeypatch.setattr(openrouter_client, "get_batch", AsyncMock(return_value={
        "id": "or-batch-555",
        "status": "completed",
        "request_counts": {"total": 1, "completed": 1, "failed": 0},
        "results": [
            {
                "custom_id": "row-1",
                "response": {"body": {"choices": [{"message": {"content": "Sample output"}}]}},
                "error": None
            }
        ]
    }))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create Batch
        payload = {
            "name": "API Flow Test",
            "model": "openai/gpt-4o",
            "prompt_template": "Summary for {{item}}",
            "csv_rows": [{"item": "Project Somnia"}],
            "temperature": 1.0
        }
        res = await client.post("/api/batches", json=payload)
        assert res.status_code == 200
        batch_id = res.json()["id"]

        # 2. List Batches
        list_res = await client.get("/api/batches")
        assert list_res.status_code == 200
        batches = list_res.json()
        assert len(batches) == 1
        assert batches[0]["id"] == batch_id

        # 3. Poll Batch (triggers completion)
        poll_res = await client.post(f"/api/batches/{batch_id}/poll")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        assert poll_data["status"] == "completed"
        assert poll_data["is_unread"] is True

        # 4. Get Batch Detail
        detail_res = await client.get(f"/api/batches/{batch_id}")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["is_unread"] is True
        assert len(detail["items"]) == 1
        assert detail["items"][0]["response_text"] == "Sample output"

        # 5. Mark as Read
        read_res = await client.post(f"/api/batches/{batch_id}/read")
        assert read_res.status_code == 200
        assert read_res.json()["is_unread"] is False

        # Verify detail now reflects is_unread = False
        detail_res2 = await client.get(f"/api/batches/{batch_id}")
        assert detail_res2.json()["is_unread"] is False

        # 6. Export CSV and Markdown
        export_csv_res = await client.get(f"/api/batches/{batch_id}/export?format=csv")
        assert export_csv_res.status_code == 200
        assert "Project Somnia" in export_csv_res.text
        assert "Sample output" in export_csv_res.text

        export_md_res = await client.get(f"/api/batches/{batch_id}/export?format=markdown")
        assert export_md_res.status_code == 200
        assert "# Batch Report" in export_md_res.text
        assert "Sample output" in export_md_res.text

        # 7. Delete Batch
        del_res = await client.delete(f"/api/batches/{batch_id}")
        assert del_res.status_code == 200

        # Verify deleted
        get_res = await client.get(f"/api/batches/{batch_id}")
        assert get_res.status_code == 404

@pytest.mark.asyncio
async def test_webhook_settings_and_batch_options(monkeypatch):
    from backend.app.services.openrouter import openrouter_client

    monkeypatch.setattr(openrouter_client, "submit_batch", AsyncMock(return_value={"id": "or-batch-opts"}))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Update webhook URL
        set_res = await client.post("/api/settings", json={"webhook_url": "https://example.com/webhook"})
        assert set_res.status_code == 200
        assert set_res.json()["webhook_url"] == "https://example.com/webhook"

        # Create batch with system prompt and JSON mode
        payload = {
            "name": "Structured Batch",
            "model": "openai/gpt-4o",
            "prompt_template": "Analyze {{component}}",
            "csv_rows": [{"component": "Op-Amp"}],
            "temperature": 0.5,
            "system_prompt": "You are an analog circuits engineer.",
            "response_format_json": True
        }
        create_res = await client.post("/api/batches", json=payload)
        assert create_res.status_code == 200
        batch_id = create_res.json()["id"]

        detail = (await client.get(f"/api/batches/{batch_id}")).json()
        assert detail["system_prompt"] == "You are an analog circuits engineer."
        assert detail["response_format_json"] is True

@pytest.mark.asyncio
async def test_unsupported_batch_model_rejection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "name": "Unsupported Model Submission",
            "model": "deepseek/deepseek-v4-pro-0813",
            "prompt_template": "Calculate {{x}}",
            "csv_rows": [{"x": "1"}],
            "temperature": 1.0
        }
        res = await client.post("/api/batches", json=payload)
        assert res.status_code == 400
        data = res.json()
        assert "does not have an OpenRouter :batch endpoint" in data["detail"]

