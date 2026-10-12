import httpx
import logging
from typing import Dict, Any, List, Optional
from ..config import OPENROUTER_BASE_URL, OPENROUTER_API_KEY_ENV
from ..database import get_setting

logger = logging.getLogger(__name__)

async def get_effective_api_key() -> str:
    """Gets the OpenRouter API key from DB settings or environment variable."""
    db_key = await get_setting("openrouter_api_key")
    if db_key and db_key.strip():
        return db_key.strip()
    return OPENROUTER_API_KEY_ENV.strip()

def get_headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://somnia.local",
        "X-Title": "Somnia Batch Manager",
        "Content-Type": "application/json",
    }

class OpenRouterClient:
    def __init__(self, base_url: str = OPENROUTER_BASE_URL):
        self.base_url = base_url.rstrip("/")

    async def submit_batch(
        self,
        model: str,
        requests: List[Dict[str, Any]],
        endpoint: str = "/v1/chat/completions",
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Submits an inline batch to OpenRouter API (POST /api/v1/batches).
        """
        key = api_key or await get_effective_api_key()
        if not key:
            raise ValueError("No OpenRouter API key configured. Please set OPENROUTER_API_KEY in environment or Web Settings.")

        url = f"{self.base_url}/batches"
        payload = {
            "endpoint": endpoint,
            "model": model,
            "requests": requests
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=get_headers(key), json=payload)
            if response.status_code not in (200, 201, 202):
                logger.error(f"OpenRouter batch submission failed ({response.status_code}): {response.text}")
                try:
                    err_json = response.json()
                    err_msg = err_json.get("error", {}).get("message") or err_json.get("message") or response.text
                except Exception:
                    err_msg = response.text

                if "does not have a :batch endpoint" in err_msg.lower():
                    err_msg = f"{err_msg} OpenRouter only supports models with an explicit ':batch' endpoint (e.g. 'openai/gpt-4o:batch', 'deepseek/deepseek-v4.1-flash:batch')."
                raise RuntimeError(f"OpenRouter batch submission failed ({response.status_code}): {err_msg}")
            return response.json()

    async def get_batch(
        self,
        openrouter_batch_id: str,
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Polls batch status from OpenRouter API (GET /api/v1/batches/:id).
        When completed, results are returned inlined in the response.
        """
        key = api_key or await get_effective_api_key()
        if not key:
            raise ValueError("No OpenRouter API key configured.")

        url = f"{self.base_url}/batches/{openrouter_batch_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=get_headers(key))
            if response.status_code != 200:
                logger.error(f"OpenRouter batch status failed ({response.status_code}): {response.text}")
                raise RuntimeError(f"OpenRouter batch status failed ({response.status_code}): {response.text}")
            return response.json()

    async def list_models(self, api_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Lists available models from OpenRouter (GET /api/v1/models).
        """
        url = f"{self.base_url}/models"
        key = api_key or await get_effective_api_key()
        headers = get_headers(key) if key else {
            "HTTP-Referer": "https://somnia.local",
            "X-Title": "Somnia Batch Manager"
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code != 200:
                logger.warning(f"Failed to fetch models from OpenRouter ({response.status_code}): {response.text}")
                return []
            data = response.json()
            return data.get("data", [])

openrouter_client = OpenRouterClient()
