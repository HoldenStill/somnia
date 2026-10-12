from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class BatchCreateRequest(BaseModel):
    name: Optional[str] = None
    model: str
    prompt_template: str
    csv_rows: List[Dict[str, Any]]
    temperature: float = Field(default=1.0, ge=0.0, le=2.0)
    reasoning_effort: Optional[str] = Field(default=None, description="low, medium, high, or None")
    system_prompt: Optional[str] = None
    response_format_json: bool = False
    estimated_cost: Optional[float] = None

class BatchItemSummary(BaseModel):
    id: int
    custom_id: str
    row_index: int
    input_data: Dict[str, Any]
    rendered_prompt: str
    response_text: Optional[str] = None
    status: str
    error: Optional[str] = None
    cost: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

class BatchSummary(BaseModel):
    id: str
    openrouter_batch_id: Optional[str] = None
    name: str
    model: str
    endpoint: str = "/v1/chat/completions"
    status: str
    prompt_template: str
    total_requests: int
    completed_requests: int
    failed_requests: int
    is_unread: bool
    temperature: float
    reasoning_effort: Optional[str] = None
    system_prompt: Optional[str] = None
    response_format_json: bool = False
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    total_cost: Optional[float] = None
    total_tokens: Optional[int] = None
    total_prompt_tokens: Optional[int] = None
    total_completion_tokens: Optional[int] = None
    estimated_cost: Optional[float] = None

class BatchDetail(BatchSummary):
    items: List[BatchItemSummary] = []

class SettingsResponse(BaseModel):
    has_api_key: bool
    api_key_masked: Optional[str] = None
    poll_interval_minutes: int
    data_dir: str
    db_path: str
    webhook_url: Optional[str] = None

class SettingsUpdateRequest(BaseModel):
    api_key: Optional[str] = None
    webhook_url: Optional[str] = None

class TestWebhookRequest(BaseModel):
    webhook_url: str

class ModelOption(BaseModel):
    id: str
    name: str
    context_length: Optional[int] = None
    pricing: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    supports_reasoning: bool = False
    is_batch_ready: bool = True
    batch_model_id: Optional[str] = None
