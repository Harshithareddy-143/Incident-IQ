"""Live, non-persistent comparison for demonstrating Hindsight's contribution."""
import asyncio

import httpx
from fastapi import APIRouter

from app.api.incidents import incident_query
from app.schemas.incidents import IncidentCreate
from app.services.groq_service import GroqService
from app.services.hindsight_service import HindsightService

router = APIRouter(prefix="/demo", tags=["demo"])
hindsight = HindsightService()
groq = GroqService()


@router.post("/compare")
async def compare_memory(payload: IncidentCreate):
    """Compare the same incident with and without live Hindsight context.

    This endpoint does not create an incident or retain a memory. It makes two
    Groq diagnosis calls and one Hindsight recall call when configured.
    """
    incident = payload.model_dump()
    memories: list[dict] = []
    memory_available = hindsight.configured
    if memory_available:
        try:
            memories = await hindsight.recall_relevant_incidents(incident_query(incident))
        except (httpx.HTTPError, RuntimeError):
            memory_available = False

    generic, assisted = await asyncio.gather(
        groq.diagnose(incident, []),
        groq.diagnose(incident, memories),
    )
    return {
        "persisted": False,
        "hindsight_configured": hindsight.configured,
        "hindsight_available": memory_available,
        "memory_count": len(memories),
        "without_memory": generic,
        "with_memory": assisted,
        "memories": memories,
    }
