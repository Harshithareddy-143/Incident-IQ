"""Retain the critical demo incident in a configured Hindsight bank."""
import asyncio
from app.services.hindsight_service import HindsightService


async def main():
    service = HindsightService()
    incident = {"incident_number": "INC-018", "title": "Payments API fails after deployment", "service": "Payments API", "environment": "Production", "severity": "Critical", "description": "HTTP 500 immediately after deployment.", "logs": "DATABASE_URL is undefined."}
    resolution = {"root_cause": "DATABASE_URL was missing from the production environment.", "solution": "Restored DATABASE_URL and redeployed. Service recovered successfully.", "notes": "Verify the production environment before deeper application debugging."}
    try:
        existing = await service.list_memories(limit=100)
        items = existing.get("items", existing.get("memories", []))
        if isinstance(items, dict):
            items = items.get("items", [])
        already_seeded = any(
            isinstance(item, dict)
            and "INC-018" in " ".join(str(item.get(key, "")) for key in ("text", "content", "context", "title"))
            and "Payments API" in " ".join(str(item.get(key, "")) for key in ("text", "content", "context", "title"))
            for item in items
        )
        if already_seeded:
            print("INC-018 is already present in the Hindsight bank; skipping duplicate retain.")
            return
        result = await service.retain_incident(incident, resolution)
        print(f"Retained INC-018 in Hindsight bank: {result}")
    finally:
        await service.client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
