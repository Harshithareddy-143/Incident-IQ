from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import httpx
from app.services.hindsight_service import HindsightService
from app.services.supabase_service import SupabaseService

router = APIRouter(prefix="/memory", tags=["memory"])
service = HindsightService()
database = SupabaseService()


class RecallRequest(BaseModel):
    query: str = Field(min_length=3, max_length=10000)


@router.post("/recall")
async def recall(payload: RecallRequest):
    try:
        return {"memories": await service.recall_relevant_incidents(payload.query)}
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(503, "Hindsight memory service is unavailable") from exc


@router.get("")
async def list_memory():
    if not service.configured:
        return {"configured": False, "memories": []}
    # Hindsight is the source of truth; its memory list is intentionally proxied without synthesizing entries.
    try:
        payload = await service.list_memories()
        counts = await database.memory_recall_counts() if database.configured else {}
        items = payload.get("items", payload.get("memories", []))
        if isinstance(items, dict):
            items = items.get("items", [])
        return {"configured": True, **payload, "items": [{**item, "times_recalled": counts.get(item.get("id"), 0)} for item in items if isinstance(item, dict)]}
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(503, "Hindsight memory service is unavailable") from exc
