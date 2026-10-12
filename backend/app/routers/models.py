import time
import logging
from fastapi import APIRouter
from typing import List, Dict, Any
from ..models import ModelOption
from ..services.openrouter import openrouter_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/models", tags=["models"])

# In-memory cache for models
_models_cache: List[Dict[str, Any]] = []
_cache_timestamp: float = 0
CACHE_DURATION_SECONDS = 3600 # 1 hour

FALLBACK_MODELS = [
    {
        "id": "openai/gpt-4o:batch",
        "name": "OpenAI: GPT-4o (Batch)",
        "context_length": 128000,
        "description": "High-intelligence flagship model with 50% batch discount.",
        "supports_reasoning": False,
        "is_batch_ready": True,
        "batch_model_id": "openai/gpt-4o:batch"
    },
    {
        "id": "openai/gpt-4o-mini:batch",
        "name": "OpenAI: GPT-4o Mini (Batch)",
        "context_length": 128000,
        "description": "Fast, cost-efficient model with 50% batch discount.",
        "supports_reasoning": False,
        "is_batch_ready": True,
        "batch_model_id": "openai/gpt-4o-mini:batch"
    },
    {
        "id": "openai/o3-mini:batch",
        "name": "OpenAI: o3-mini (Batch)",
        "context_length": 200000,
        "description": "Cost-effective, low-latency reasoning model with 50% batch discount.",
        "supports_reasoning": True,
        "is_batch_ready": True,
        "batch_model_id": "openai/o3-mini:batch"
    },
    {
        "id": "anthropic/claude-sonnet-5.5:batch",
        "name": "Anthropic: Claude Sonnet 5.5 (Batch)",
        "context_length": 200000,
        "description": "Anthropic's premier model with strong coding & reasoning and 50% batch discount.",
        "supports_reasoning": False,
        "is_batch_ready": True,
        "batch_model_id": "anthropic/claude-sonnet-5.5:batch"
    },
    {
        "id": "anthropic/claude-haiku-5.5:batch",
        "name": "Anthropic: Claude Haiku 5.5 (Batch)",
        "context_length": 200000,
        "description": "Fast and lightweight model with 50% batch discount.",
        "supports_reasoning": False,
        "is_batch_ready": True,
        "batch_model_id": "anthropic/claude-haiku-5.5:batch"
    },
    {
        "id": "deepseek/deepseek-v4.1-flash:batch",
        "name": "DeepSeek: DeepSeek V4.1 Flash (Batch)",
        "context_length": 128000,
        "description": "State-of-the-art open weights model with 50% batch discount.",
        "supports_reasoning": False,
        "is_batch_ready": True,
        "batch_model_id": "deepseek/deepseek-v4.1-flash:batch"
    },
    {
        "id": "google/gemini-2.5-flash:batch",
        "name": "Google: Gemini 2.5 Flash (Batch)",
        "context_length": 1048576,
        "description": "Next-gen multimodal workhorse model with 50% batch discount.",
        "supports_reasoning": False,
        "is_batch_ready": True,
        "batch_model_id": "google/gemini-2.5-flash:batch"
    },
    {
        "id": "google/gemini-2.5-pro:batch",
        "name": "Google: Gemini 2.5 Pro (Batch)",
        "context_length": 1048576,
        "description": "Advanced multimodal reasoning model with 50% batch discount.",
        "supports_reasoning": True,
        "is_batch_ready": True,
        "batch_model_id": "google/gemini-2.5-pro:batch"
    }
]

def check_is_batch_ready(model_id: str, model_data: Any = None) -> bool:
    """Strictly checks if a model ID represents an OpenRouter :batch endpoint."""
    low = model_id.lower()
    return low.endswith(":batch") or ":batch" in low

def check_supports_reasoning(model_id: str, model_data: Dict[str, Any]) -> bool:
    low = model_id.lower()
    if any(tag in low for tag in ["/o1", "/o3", "/o4", "-r1", "reasoning", "deepseek-r1"]):
        return True
    arch = model_data.get("architecture", {})
    if isinstance(arch, dict) and arch.get("reasoning"):
        return True
    return False

async def get_models_data() -> List[Dict[str, Any]]:
    """Loads and caches models from OpenRouter, falling back to verified batch models."""
    global _models_cache, _cache_timestamp
    now = time.time()

    if _models_cache and (now - _cache_timestamp < CACHE_DURATION_SECONDS):
        return _models_cache

    try:
        remote_models = await openrouter_client.list_models()
        if remote_models:
            # Map all available batch endpoints
            batch_model_ids = {
                m["id"] for m in remote_models 
                if m.get("id") and check_is_batch_ready(m["id"])
            }
            # Also include fallback batch models in the known set
            batch_model_ids.update(m["id"] for m in FALLBACK_MODELS if m["id"].endswith(":batch"))

            parsed = []
            for m in remote_models:
                m_id = m.get("id")
                if not m_id:
                    continue
                is_batch = check_is_batch_ready(m_id)
                # Check if this model or its :batch equivalent exists
                batch_id = m_id if is_batch else (f"{m_id}:batch" if f"{m_id}:batch" in batch_model_ids else None)

                parsed.append({
                    "id": m_id,
                    "name": m.get("name") or m_id,
                    "context_length": m.get("context_length"),
                    "pricing": m.get("pricing"),
                    "description": m.get("description"),
                    "supports_reasoning": check_supports_reasoning(m_id, m),
                    "is_batch_ready": is_batch,
                    "batch_model_id": batch_id
                })
            _models_cache = parsed
            _cache_timestamp = now
            return _models_cache
    except Exception as e:
        logger.warning(f"Could not load models from OpenRouter, using fallbacks: {e}")

    _models_cache = FALLBACK_MODELS
    _cache_timestamp = now
    return _models_cache

async def resolve_batch_model(model_id: str) -> tuple[str, bool]:
    """
    Validates or resolves a model ID into an OpenRouter batch-compatible model ID.
    Returns (resolved_model_id, is_batch_ready).
    - If model_id already ends with :batch, returns (model_id, True).
    - If base model has a known :batch counterpart, auto-appends :batch -> (f'{model_id}:batch', True).
    - If no :batch endpoint exists for this model, returns (model_id, False).
    """
    clean_id = model_id.strip()
    if not clean_id:
        return clean_id, False

    if check_is_batch_ready(clean_id):
        return clean_id, True

    # Check against known models
    models_data = await get_models_data()
    candidate = f"{clean_id}:batch"
    known_batch_ids = {
        m["id"] for m in models_data 
        if m.get("is_batch_ready") or check_is_batch_ready(m["id"])
    }
    # Also check batch_model_id mappings
    for m in models_data:
        if m.get("id") == clean_id and m.get("batch_model_id"):
            return m["batch_model_id"], True

    if candidate in known_batch_ids:
        return candidate, True

    return clean_id, False

@router.get("", response_model=List[ModelOption])
async def get_models():
    models_data = await get_models_data()
    return [ModelOption(**m) for m in models_data]

