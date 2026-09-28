"""Hindsight Cloud retain/recall adapter. Memory calls live here, never in UI code."""
from datetime import datetime, timezone
from typing import Any
import httpx

from app.core.config import settings


def format_incident_memory(incident: dict[str, Any], resolution: dict[str, Any]) -> str:
    return (
        f"Incident ID: {incident.get('incident_number', incident.get('id', 'unknown'))}\n"
        f"Title: {incident.get('title', '')}\nService: {incident.get('service', '')}\n"
        f"Environment: {incident.get('environment', '')}\nSeverity: {incident.get('severity', '')}\n"
        f"Symptoms: {incident.get('description', '')}\nObserved error/logs: {incident.get('logs', 'Not provided')}\n"
        f"Root cause: {resolution.get('root_cause', '')}\nResolution: {resolution.get('solution', '')}\n"
        f"Resolution notes: {resolution.get('notes', 'None')}\n"
        "Useful lesson: Use the incident symptoms and environment as evidence; verify this fix applies before changing production."
    )


class HindsightService:
    def __init__(self, client: httpx.AsyncClient | None = None):
        self.client = client or httpx.AsyncClient(timeout=25)

    @property
    def configured(self) -> bool:
        return settings.hindsight_configured

    def _url(self, action: str) -> str:
        resource = f"{settings.hindsight_base_url.rstrip('/')}/v1/default/banks/{settings.hindsight_bank_id}/memories"
        return f"{resource}/{action}" if action else resource

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {settings.hindsight_api_key}", "Content-Type": "application/json"}

    async def retain_incident(self, incident: dict[str, Any], resolution: dict[str, Any]) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("Hindsight is not configured; refusing to simulate a retain operation.")
        content = format_incident_memory(incident, resolution)
        response = await self.client.post(self._url(""), headers=self._headers(), json={"items": [{"content": content, "timestamp": datetime.now(timezone.utc).isoformat()}]})
        response.raise_for_status()
        return response.json()

    async def recall_relevant_incidents(self, query: str, max_memories: int = 6) -> list[dict[str, Any]]:
        if not self.configured:
            raise RuntimeError("Hindsight is not configured; refusing to simulate a recall operation.")
        response = await self.client.post(self._url("recall"), headers=self._headers(), json={"query": query, "max_tokens": 1800, "budget": "mid"})
        response.raise_for_status()
        payload = response.json()
        items = payload.get("results", payload.get("memories", payload.get("items", [])))
        if isinstance(items, dict):
            items = items.get("results", items.get("memories", []))
        result = []
        for item in items[:max_memories] if isinstance(items, list) else []:
            if isinstance(item, str):
                result.append({"content": item})
            elif isinstance(item, dict):
                result.append(item)
        # Some API versions return a single answer field. Preserve it as a recalled item.
        if not result and payload.get("text"):
            result.append({"content": payload["text"]})
        return result

    async def list_memories(self, limit: int = 100, offset: int = 0) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("Hindsight is not configured.")
        response = await self.client.get(self._url("list"), headers=self._headers(), params={"limit": limit, "offset": offset})
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, list):
            return {"items": payload, "total": len(payload), "limit": limit, "offset": offset}
        return payload if isinstance(payload, dict) else {"items": []}
