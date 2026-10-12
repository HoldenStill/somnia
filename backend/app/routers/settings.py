from fastapi import APIRouter, HTTPException
import httpx
from ..models import SettingsResponse, SettingsUpdateRequest, TestWebhookRequest
from ..services.openrouter import get_effective_api_key
from ..database import set_setting, get_setting
from .. import config

router = APIRouter(prefix="/api/settings", tags=["settings"])

def mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return "********"
    return f"{key[:6]}...{key[-4:]}"

@router.get("", response_model=SettingsResponse)
async def get_settings():
    key = await get_effective_api_key()
    has_key = bool(key and key.strip())
    masked = mask_key(key) if has_key else None
    webhook_url = await get_setting("webhook_url")

    return SettingsResponse(
        has_api_key=has_key,
        api_key_masked=masked,
        poll_interval_minutes=config.POLL_INTERVAL_MINUTES,
        data_dir=str(config.DATA_DIR),
        db_path=str(config.DB_PATH),
        webhook_url=webhook_url
    )

@router.post("", response_model=SettingsResponse)
async def update_settings(req: SettingsUpdateRequest):
    if req.api_key is not None:
        cleaned_key = req.api_key.strip()
        await set_setting("openrouter_api_key", cleaned_key)

    if req.webhook_url is not None:
        cleaned_webhook = req.webhook_url.strip()
        await set_setting("webhook_url", cleaned_webhook)

    key = await get_effective_api_key()
    has_key = bool(key and key.strip())
    masked = mask_key(key) if has_key else None
    webhook_url = await get_setting("webhook_url")

    return SettingsResponse(
        has_api_key=has_key,
        api_key_masked=masked,
        poll_interval_minutes=config.POLL_INTERVAL_MINUTES,
        data_dir=str(config.DATA_DIR),
        db_path=str(config.DB_PATH),
        webhook_url=webhook_url
    )

@router.post("/test-webhook", response_model=dict)
async def test_webhook(req: TestWebhookRequest):
    url = req.webhook_url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Webhook URL must begin with http:// or https://")

    payload = {
        "content": "🔔 **Somnia Webhook Test**: Connection successfully established!",
        "text": "Somnia Webhook Test: Connection successfully established!",
        "message": "Somnia Webhook Test: Connection successfully established!"
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code >= 400:
                raise HTTPException(status_code=400, detail=f"Webhook target returned HTTP {resp.status_code}")
            return {"status": "ok", "message": f"Webhook received response code {resp.status_code}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reach webhook URL: {str(e)}")
