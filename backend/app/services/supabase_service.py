from typing import Any
from datetime import datetime, timezone
import httpx
from app.core.config import settings


class SupabaseService:
    def __init__(self, client: httpx.AsyncClient | None = None):
        self.client = client or httpx.AsyncClient(timeout=20)

    @property
    def configured(self) -> bool:
        return settings.supabase_configured

    def _headers(self) -> dict[str, str]:
        # Supabase's newer sb_secret_* API keys are not JWTs. Send them as apikey only.
        return {"apikey": settings.supabase_service_role_key, "Content-Type": "application/json", "Prefer": "return=representation"}

    async def insert_incident(self, values: dict[str, Any]) -> dict[str, Any]:
        if not self.configured:
            return values
        response = await self.client.post(f"{settings.supabase_url.rstrip('/')}/rest/v1/incidents", headers=self._headers(), json=values)
        response.raise_for_status()
        rows = response.json()
        return rows[0] if rows else values

    async def update_diagnosis(self, incident_id: str, analysis: dict[str, Any], memory_used: bool) -> None:
        if not self.configured:
            return
        body = {"ai_summary": analysis.get("summary"), "likely_root_cause": analysis.get("likely_root_cause"), "confidence": str(analysis.get("confidence", "")), "memory_used": memory_used, "ai_analysis": analysis}
        url = f"{settings.supabase_url.rstrip('/')}/rest/v1/incidents?incident_number=eq.{incident_id}"
        response = await self.client.patch(url, headers=self._headers(), json=body)
        if response.status_code == 400 and "ai_analysis" in response.text:
            # Keep older databases working until the additive schema migration is applied.
            body.pop("ai_analysis")
            response = await self.client.patch(url, headers=self._headers(), json=body)
        response.raise_for_status()

    async def resolve_incident(self, incident_id: str, resolution: dict[str, Any]) -> dict[str, Any]:
        if not self.configured:
            return {"incident_number": incident_id, **resolution}
        base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        lookup = await self.client.get(f"{base}/incidents?incident_number=eq.{incident_id}&select=*", headers=self._headers())
        lookup.raise_for_status()
        rows = lookup.json()
        incident = rows[0] if rows else {"incident_number": incident_id}
        response = await self.client.patch(f"{base}/incidents?incident_number=eq.{incident_id}", headers=self._headers(), json={"status": "Resolved", "resolved_at": datetime.now(timezone.utc).isoformat(), "likely_root_cause": resolution["root_cause"]})
        response.raise_for_status()
        resolution_row = {"incident_number": incident_id, "root_cause": resolution["root_cause"], "solution": resolution["solution"], "notes": resolution.get("notes", ""), "recommendation_useful": resolution.get("useful", "Yes")}
        resolution_response = await self.client.post(f"{base}/incident_resolutions", headers=self._headers(), json=resolution_row)
        resolution_response.raise_for_status()
        return {**incident, **resolution}

    async def list_incidents(self) -> list[dict]:
        if not self.configured:
            return []
        response = await self.client.get(f"{settings.supabase_url.rstrip('/')}/rest/v1/incidents?select=*&order=created_at.desc", headers=self._headers())
        response.raise_for_status()
        return response.json()

    async def record_recalled_memories(self, incident_id: str, memories: list[dict[str, Any]]) -> None:
        if not self.configured or not memories:
            return
        rows = []
        for memory in memories:
            content = str(memory.get("text") or memory.get("content") or memory.get("context") or "")
            title = memory.get("title")
            if not title and content:
                title = next((line.split(":", 1)[1].strip() for line in content.splitlines() if line.lower().startswith("title:")), None)
            rows.append({"incident_number": incident_id, "memory_id": memory.get("id") or memory.get("memory_id"), "similarity": memory.get("similarity", memory.get("score")), "title": title, "content": memory})
        response = await self.client.post(f"{settings.supabase_url.rstrip('/')}/rest/v1/incident_memories", headers=self._headers(), json=rows)
        response.raise_for_status()

    async def incident_detail(self, incident_id: str) -> dict[str, Any] | None:
        if not self.configured:
            return None
        base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        headers = self._headers()
        requests = [
            self.client.get(f"{base}/incidents?incident_number=eq.{incident_id}&select=*", headers=headers),
            self.client.get(f"{base}/incident_resolutions?incident_number=eq.{incident_id}&select=*&order=created_at.desc", headers=headers),
            self.client.get(f"{base}/incident_memories?incident_number=eq.{incident_id}&select=*&order=recalled_at.desc", headers=headers),
            self.client.get(f"{base}/incident_timeline?incident_number=eq.{incident_id}&select=*&order=occurred_at.asc", headers=headers),
        ]
        responses = await __import__("asyncio").gather(*requests)
        for response in responses:
            response.raise_for_status()
        incidents, resolutions, memories, timeline = [response.json() for response in responses]
        if not incidents:
            return None
        analysis = incidents[0].get("ai_analysis") or {
            "summary": incidents[0].get("ai_summary"),
            "likely_root_cause": incidents[0].get("likely_root_cause"),
            "confidence": incidents[0].get("confidence"),
        }
        if not analysis.get("reasoning_from_memory"):
            match_event = next((item.get("event", "") for item in timeline if "Memory match explanation:" in item.get("event", "")), "")
            if match_event:
                analysis["reasoning_from_memory"] = match_event.split("Memory match explanation:", 1)[1].strip()
        return {**incidents[0], "analysis": analysis, "resolutions": resolutions, "related_historical_incidents": [row["content"] for row in memories], "timeline": timeline}

    async def add_timeline_event(self, incident_id: str, event: str) -> None:
        if not self.configured:
            return
        response = await self.client.post(f"{settings.supabase_url.rstrip('/')}/rest/v1/incident_timeline", headers=self._headers(), json={"incident_number": incident_id, "event": event})
        response.raise_for_status()

    async def memory_recall_counts(self) -> dict[str, int]:
        if not self.configured:
            return {}
        response = await self.client.get(f"{settings.supabase_url.rstrip('/')}/rest/v1/incident_memories?select=memory_id", headers=self._headers())
        response.raise_for_status()
        counts: dict[str, int] = {}
        for row in response.json():
            if row.get("memory_id"):
                counts[row["memory_id"]] = counts.get(row["memory_id"], 0) + 1
        return counts
