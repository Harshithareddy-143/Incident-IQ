from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import demo, incidents, memory
from app.core.config import settings

@asynccontextmanager
async def lifespan(_app):
    yield
    await incidents.hindsight.client.aclose()
    await incidents.groq.client.aclose()
    await incidents.database.client.aclose()
    await memory.service.client.aclose()
    await memory.database.client.aclose()
    await demo.hindsight.client.aclose()
    await demo.groq.client.aclose()


app = FastAPI(title="IncidentIQ API", version="1.0.0", description="Incident response with persistent Hindsight memory", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin, "http://127.0.0.1:5500", "http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(incidents.router, prefix="/api")
app.include_router(memory.router, prefix="/api")
app.include_router(demo.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "groq_configured": bool(settings.groq_api_key), "hindsight_configured": settings.hindsight_configured, "hindsight_bank": settings.hindsight_bank_id if settings.hindsight_configured else None, "supabase_configured": settings.supabase_configured}


@app.get("/api/analytics")
async def analytics():
    from app.services.supabase_service import SupabaseService
    try:
        records = await SupabaseService().list_incidents()
    except Exception:
        records = []
    resolved = [item for item in records if item.get("status") == "Resolved"]
    root_causes: dict[str, int] = {}
    categories: dict[str, int] = {}
    durations = []
    from datetime import datetime
    for item in resolved:
        cause = (item.get("likely_root_cause") or "").strip()
        if cause:
            root_causes[cause] = root_causes.get(cause, 0) + 1
            lowered = cause.lower()
            category = next((name for terms, name in [(["database", "sql", "connection pool"], "Database"), (["token", "jwt", "auth"], "Authentication"), (["deploy", "environment", "configuration"], "Deployment"), (["dns", "network", "cors"], "Network")] if any(term in lowered for term in terms)), "Other")
            categories[category] = categories.get(category, 0) + 1
        try:
            start = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(item["resolved_at"].replace("Z", "+00:00"))
            durations.append(max(0, (end - start).total_seconds() / 60))
        except (KeyError, ValueError, TypeError):
            pass
    return {"incidents_resolved": len(resolved), "incidents_total": len(records), "categories": categories, "root_causes": root_causes, "memory_assisted_resolutions": sum(bool(item.get("memory_used")) for item in resolved), "average_resolution_minutes": round(sum(durations) / len(durations), 1) if durations else None}
