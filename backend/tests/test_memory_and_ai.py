import asyncio
import httpx
import pytest
from pydantic import ValidationError
from app.services.hindsight_service import format_incident_memory
from app.services.groq_service import GroqService
from app.services.hindsight_service import HindsightService
from app.schemas.incidents import IncidentCreate


def test_hindsight_memory_has_actionable_incident_context():
    text = format_incident_memory(
        {"incident_number": "INC-018", "title": "Payments API fails", "service": "Payments API", "environment": "Production", "severity": "Critical", "description": "HTTP 500 after deploy", "logs": "DATABASE_URL undefined"},
        {"root_cause": "DATABASE_URL missing", "solution": "Restore variable and redeploy", "notes": "Check startup logs"},
    )
    assert "INC-018" in text and "DATABASE_URL missing" in text
    assert "Production" in text and "Restore variable and redeploy" in text


def test_hindsight_retain_url_has_no_trailing_slash(monkeypatch):
    from app.services import hindsight_service
    monkeypatch.setattr(hindsight_service.settings, "hindsight_base_url", "https://api.hindsight.vectorize.io/")
    monkeypatch.setattr(hindsight_service.settings, "hindsight_bank_id", "incident-bank")
    service = HindsightService()
    assert service._url("") == "https://api.hindsight.vectorize.io/v1/default/banks/incident-bank/memories"
    asyncio.run(service.client.aclose())


def test_groq_fallback_handles_missing_memories():
    result = GroqService._safe_fallback([])
    assert result["related_historical_incidents"] == []
    assert "No relevant memory" in result["reasoning_from_memory"]
    assert isinstance(result["recommended_checks"], list)


def test_groq_fallback_preserves_recalled_memory():
    memory = {"content": "INC-018: DATABASE_URL missing after deployment"}
    result = GroqService._safe_fallback([memory])
    assert result["related_historical_incidents"] == [memory]


def test_incident_input_rejects_empty_description():
    with pytest.raises(ValidationError):
        IncidentCreate(title="API issue", service="Payments", description="short")


def test_incident_input_rejects_unknown_severity():
    with pytest.raises(ValidationError):
        IncidentCreate(title="API failure", service="Payments", description="HTTP 500 after deployment", severity="Urgent")


def test_hindsight_failure_is_not_reported_as_a_success(monkeypatch):
    from app.services import hindsight_service
    monkeypatch.setattr(hindsight_service.settings, "hindsight_api_key", "test-key")
    monkeypatch.setattr(hindsight_service.settings, "hindsight_bank_id", "test-bank")

    class BrokenClient:
        async def post(self, *args, **kwargs):
            raise httpx.ConnectError("offline")

    with pytest.raises(httpx.ConnectError):
        asyncio.run(HindsightService(BrokenClient()).recall_relevant_incidents("database failure"))


def test_invalid_groq_json_returns_cautious_fallback(monkeypatch):
    from app.services import groq_service
    monkeypatch.setattr(groq_service.settings, "groq_api_key", "test-key")

    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return {"choices": [{"message": {"content": "not json"}}]}

    class Client:
        async def post(self, *args, **kwargs):
            return Response()

    result = asyncio.run(GroqService(Client()).diagnose({}, []))
    assert result["confidence"] == "Low"


def test_live_demo_compares_same_incident_with_and_without_memory(monkeypatch):
    from app.api import demo

    memory = {"content": "INC-018: Payments API failed because DATABASE_URL was missing"}
    seen = []
    class FakeHindsight:
        configured = True
        async def recall_relevant_incidents(self, _query):
            return [memory]
    class FakeGroq:
        async def diagnose(self, _incident, memories):
            seen.append(memories)
            return {"summary": "uses memory" if memories else "generic"}

    monkeypatch.setattr(demo, "hindsight", FakeHindsight())
    monkeypatch.setattr(demo, "groq", FakeGroq())
    payload = IncidentCreate(title="Checkout API failure", service="Payments API", description="Checkout returns HTTP 500 after deployment.")
    result = asyncio.run(demo.compare_memory(payload))

    assert result["persisted"] is False
    assert result["memory_count"] == 1
    assert result["without_memory"]["summary"] == "generic"
    assert result["with_memory"]["summary"] == "uses memory"
    assert [] in seen and [memory] in seen
