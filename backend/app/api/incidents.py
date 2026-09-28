from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
import httpx
from app.schemas.incidents import IncidentCreate, ResolutionCreate
from app.services.hindsight_service import HindsightService
from app.services.groq_service import GroqService
from app.services.supabase_service import SupabaseService

router = APIRouter(prefix="/incidents", tags=["incidents"])
hindsight = HindsightService()
groq = GroqService()
database = SupabaseService()
local_incidents: dict[str, dict] = {}


def incident_query(data: dict) -> str:
    return "\n".join(str(data.get(key, "")) for key in ("title", "service", "environment", "description", "logs", "stack_trace"))


@router.post("")
async def create_and_analyze(payload: IncidentCreate):
    record = payload.model_dump()
    record.update({"status": "Investigating", "created_at": datetime.now(timezone.utc).isoformat()})
    if database.configured:
        try:
            record = await database.insert_incident(record)
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Could not save incident to Supabase") from exc
    else:
        record["incident_number"] = f"INC-{datetime.now(timezone.utc).strftime('%H%M%S')}"
    record["id"] = record.get("incident_number", record.get("id"))
    local_incidents[record["incident_number"]] = record.copy()
    if database.configured:
        try:
            await database.add_timeline_event(record["incident_number"], "Incident created and saved")
        except httpx.HTTPError:
            pass
    memories, memory_error = [], not hindsight.configured
    if hindsight.configured:
        try:
            memories = await hindsight.recall_relevant_incidents(incident_query(record))
        except (httpx.HTTPError, RuntimeError):
            memory_error = True
    if database.configured and memories:
        try:
            await database.record_recalled_memories(record["incident_number"], memories)
        except httpx.HTTPError:
            # Diagnosis should remain available even if optional evidence tracking fails.
            pass
    analysis = await groq.diagnose(record, memories)
    analysis["memory_unavailable"] = memory_error
    if database.configured:
        try:
            await database.update_diagnosis(record["incident_number"], analysis, bool(memories))
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Diagnosis was generated but could not be saved to Supabase") from exc
    record["analysis"] = analysis
    record["related_historical_incidents"] = memories
    if database.configured:
        try:
            match_reason = str(analysis.get("reasoning_from_memory") or "").strip()
            timeline_message = "AI diagnosis completed" if not memory_error else "AI diagnosis completed; memory unavailable"
            if match_reason:
                timeline_message += f". Memory match explanation: {match_reason[:1600]}"
            await database.add_timeline_event(record["incident_number"], timeline_message)
        except httpx.HTTPError:
            pass
    return record


@router.get("")
async def list_incidents():
    try:
        return await database.list_incidents()
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not load incidents from Supabase") from exc


@router.get("/{incident_id}")
async def incident_detail(incident_id: str):
    try:
        detail = await database.incident_detail(incident_id)
        if detail is None:
            raise HTTPException(404, "Incident not found")
        return detail
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not load incident details from Supabase") from exc


@router.post("/{incident_id}/resolve")
async def resolve(incident_id: str, payload: ResolutionCreate):
    resolution = payload.model_dump()
    try:
        saved = await database.resolve_incident(incident_id, resolution)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not save resolution to Supabase") from exc
    try:
        await database.add_timeline_event(incident_id, "Resolution saved")
    except httpx.HTTPError:
        pass
    retained = False
    retain_error = None
    if hindsight.configured:
        incident = local_incidents.get(incident_id, {"incident_number": incident_id, "title": "", "service": "", "environment": "", "description": "", "severity": ""}).copy()
        try:
            if database.configured:
                # Resolution response contains the incident row when Supabase is configured.
                incident.update({key: saved[key] for key in ("title", "service", "environment", "description", "severity", "logs") if key in saved})
            await hindsight.retain_incident(incident, resolution)
            retained = True
        except (httpx.HTTPError, RuntimeError) as exc:
            retain_error = "Hindsight retain failed; resolution is saved but not yet in memory."
    local_incidents.pop(incident_id, None)
    return {"resolution": saved, "retained": retained, "retain_error": retain_error, "memory_configured": hindsight.configured}
