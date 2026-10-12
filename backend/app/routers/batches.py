from fastapi import APIRouter, HTTPException, Query, Response
from typing import List, Optional
from ..models import BatchCreateRequest, BatchSummary, BatchDetail
from ..database import list_batches, get_batch_by_id, mark_batch_as_read, get_db
from ..services.batch_service import batch_service
from ..services.poller import trigger_poll_now

router = APIRouter(prefix="/api/batches", tags=["batches"])

@router.post("", response_model=dict)
async def create_batch(req: BatchCreateRequest):
    try:
        batch_id = await batch_service.create_batch(req)
        return {"id": batch_id, "message": "Batch created and submitted successfully"}
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit batch: {str(e)}")

@router.get("", response_model=List[BatchSummary])
async def get_all_batches(status: Optional[str] = Query(None, description="'active' or 'archive'")):
    rows = await list_batches(status_filter=status)
    return [
        BatchSummary(
            id=r["id"],
            openrouter_batch_id=r.get("openrouter_batch_id"),
            name=r["name"],
            model=r["model"],
            endpoint=r.get("endpoint", "/v1/chat/completions"),
            status=r["status"],
            prompt_template=r["prompt_template"],
            total_requests=r["total_requests"],
            completed_requests=r["completed_requests"],
            failed_requests=r["failed_requests"],
            is_unread=bool(r["is_unread"]),
            temperature=r["temperature"],
            reasoning_effort=r.get("reasoning_effort"),
            system_prompt=r.get("system_prompt"),
            response_format_json=bool(r.get("response_format_json", 0)),
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            completed_at=r.get("completed_at"),
            error_message=r.get("error_message"),
            total_cost=r.get("total_cost"),
            total_tokens=r.get("total_tokens"),
            total_prompt_tokens=r.get("total_prompt_tokens"),
            total_completion_tokens=r.get("total_completion_tokens"),
            estimated_cost=r.get("estimated_cost")
        )
        for r in rows
    ]

@router.get("/{batch_id}", response_model=BatchDetail)
async def get_batch_detail(batch_id: str):
    batch = await get_batch_by_id(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    return BatchDetail(
        id=batch["id"],
        openrouter_batch_id=batch.get("openrouter_batch_id"),
        name=batch["name"],
        model=batch["model"],
        endpoint=batch.get("endpoint", "/v1/chat/completions"),
        status=batch["status"],
        prompt_template=batch["prompt_template"],
        total_requests=batch["total_requests"],
        completed_requests=batch["completed_requests"],
        failed_requests=batch["failed_requests"],
        is_unread=bool(batch["is_unread"]),
        temperature=batch["temperature"],
        reasoning_effort=batch.get("reasoning_effort"),
        system_prompt=batch.get("system_prompt"),
        response_format_json=bool(batch.get("response_format_json", 0)),
        created_at=batch["created_at"],
        updated_at=batch["updated_at"],
        completed_at=batch.get("completed_at"),
        error_message=batch.get("error_message"),
        total_cost=batch.get("total_cost"),
        total_tokens=batch.get("total_tokens"),
        total_prompt_tokens=batch.get("total_prompt_tokens"),
        total_completion_tokens=batch.get("total_completion_tokens"),
        estimated_cost=batch.get("estimated_cost"),
        items=batch.get("items", [])
    )

@router.post("/{batch_id}/read", response_model=dict)
async def mark_read(batch_id: str):
    success = await mark_batch_as_read(batch_id)
    if not success:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"id": batch_id, "is_unread": False}

@router.post("/{batch_id}/poll", response_model=dict)
async def poll_batch(batch_id: str):
    batch = await get_batch_by_id(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    await trigger_poll_now(batch_id)
    updated = await get_batch_by_id(batch_id)
    return {
        "id": batch_id,
        "status": updated["status"] if updated else batch["status"],
        "completed_requests": updated["completed_requests"] if updated else batch["completed_requests"],
        "is_unread": bool(updated["is_unread"]) if updated else False
    }

@router.post("/{batch_id}/retry-failed", response_model=dict)
async def retry_failed(batch_id: str):
    try:
        new_batch_id = await batch_service.retry_failed_batch(batch_id)
        return {"id": new_batch_id, "message": "Retry batch submitted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retry batch: {str(e)}")

@router.get("/{batch_id}/export")
async def export_batch(batch_id: str, format: str = Query("csv", pattern="^(csv|json|markdown|md)$")):
    try:
        res = await batch_service.export_batch(batch_id, fmt=format)
        return Response(
            content=res["content"],
            media_type=res["media_type"],
            headers={"Content-Disposition": f'attachment; filename="{res["filename"]}"'}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{batch_id}", response_model=dict)
async def delete_batch(batch_id: str):
    async with get_db() as conn:
        cursor = await conn.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
        await conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Batch not found")
    return {"id": batch_id, "message": "Batch deleted successfully"}
