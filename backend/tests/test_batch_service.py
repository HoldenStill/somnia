import pytest
import pytest_asyncio
import json
from unittest.mock import AsyncMock
from backend.app import config
from backend.app.services.batch_service import render_prompt_template, batch_service
from backend.app.models import BatchCreateRequest

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

def test_template_rendering():
    template = "Write a description for {{ product_name }} with {{color}} at ${{ price }}."
    row = {"product_name": "Leather Jacket", "color": "Black", "price": 199.99}
    
    rendered = render_prompt_template(template, row)
    assert rendered == "Write a description for Leather Jacket with Black at $199.99."

    # Test case insensitivity and extra spaces
    template2 = "Hello {{ USER_NAME }}!"
    row2 = {"user_name": "Holden"}
    assert render_prompt_template(template2, row2) == "Hello Holden!"

    # Test missing variable preserved
    template3 = "Item: {{ item }}, Tag: {{ missing_tag }}"
    row3 = {"item": "Desk"}
    assert render_prompt_template(template3, row3) == "Item: Desk, Tag: {{ missing_tag }}"

@pytest.mark.asyncio
async def test_batch_creation_and_export(monkeypatch):
    from backend.app.services.openrouter import openrouter_client

    # Mock OpenRouter submission
    mock_submit = AsyncMock(return_value={"id": "or-batch-999", "object": "batch"})
    monkeypatch.setattr(openrouter_client, "submit_batch", mock_submit)

    req = BatchCreateRequest(
        name="Product Description Batch",
        model="openai/gpt-4o",
        prompt_template="Describe {{product}} in category {{category}}",
        csv_rows=[
            {"product": "Running Shoes", "category": "Footwear"},
            {"product": "Coffee Mug", "category": "Kitchenware"}
        ],
        temperature=0.8,
        reasoning_effort=None
    )

    batch_id = await batch_service.create_batch(req)
    assert batch_id is not None
    assert mock_submit.call_count == 1
    
    call_args = mock_submit.call_args[1]
    assert call_args["model"] == "openai/gpt-4o:batch"
    assert len(call_args["requests"]) == 2
    assert call_args["requests"][0]["custom_id"] == "row-1"
    assert call_args["requests"][0]["body"]["messages"][0]["content"] == "Describe Running Shoes in category Footwear"

    # Test export JSON
    json_export = await batch_service.export_batch(batch_id, fmt="json")
    assert json_export["filename"].endswith(".json")
    parsed = json.loads(json_export["content"])
    assert parsed["batch_id"] == batch_id
    assert len(parsed["items"]) == 2

    # Test export CSV
    csv_export = await batch_service.export_batch(batch_id, fmt="csv")
    assert csv_export["filename"].endswith(".csv")
    assert "row_index" in csv_export["content"]
    assert "Running Shoes" in csv_export["content"]

@pytest.mark.asyncio
async def test_batch_model_validation_and_normalization(monkeypatch):
    from backend.app.services.openrouter import openrouter_client

    mock_submit = AsyncMock(return_value={"id": "or-batch-101", "object": "batch"})
    monkeypatch.setattr(openrouter_client, "submit_batch", mock_submit)

    # 1. Direct :batch model is accepted
    req_direct = BatchCreateRequest(
        name="Direct Batch Model",
        model="deepseek/deepseek-v4.1-flash:batch",
        prompt_template="Test prompt {{x}}",
        csv_rows=[{"x": "1"}],
        temperature=1.0
    )
    b_id = await batch_service.create_batch(req_direct)
    assert b_id is not None
    assert mock_submit.call_args[1]["model"] == "deepseek/deepseek-v4.1-flash:batch"

    # 2. Base model with known :batch variant is auto-normalized
    req_normalize = BatchCreateRequest(
        name="Normalize Model",
        model="anthropic/claude-haiku-5.5",
        prompt_template="Test prompt {{x}}",
        csv_rows=[{"x": "2"}],
        temperature=1.0
    )
    b_id2 = await batch_service.create_batch(req_normalize)
    assert b_id2 is not None
    assert mock_submit.call_args[1]["model"] == "anthropic/claude-haiku-5.5:batch"

    # 3. Model without :batch endpoint raises ValueError
    req_invalid = BatchCreateRequest(
        name="Unsupported Model",
        model="deepseek/deepseek-v4-pro-0813",
        prompt_template="Test prompt {{x}}",
        csv_rows=[{"x": "3"}],
        temperature=1.0
    )
    with pytest.raises(ValueError) as excinfo:
        await batch_service.create_batch(req_invalid)
    assert "does not have an OpenRouter :batch endpoint" in str(excinfo.value)

