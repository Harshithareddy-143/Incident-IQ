# IncidentIQ

IncidentIQ is an incident operations dashboard that learns from resolved production issues. Its defining loop is **recall → diagnose → resolve → retain**: it searches Hindsight by Vectorize for relevant engineering experience, supplies those memories to Groq for a structured diagnosis, then retains confirmed resolutions for future incidents.

## Why memory matters

A stateless assistant can suggest generic debugging steps. IncidentIQ can surface a prior failure with the same service, symptoms, and deployment timing, explain the match, and point an engineer toward the fix that worked before. Hindsight is the persistent memory layer; the browser demo’s seed data is explicitly local demo content and is not represented as live Hindsight data.

## Architecture

```text
Browser dashboard → FastAPI Incident Service → Hindsight retain / recall
                                           ├→ Groq diagnosis
                                           └→ Supabase PostgreSQL
```

The primary dashboard is a Next.js App Router app written in TypeScript and styled with Tailwind CSS plus the existing IncidentIQ design system. The original static HTML demo remains available at the repository root. The API is independently deployable with FastAPI. Provider keys stay on the backend. Supabase Auth can own users; the service-role key is used server-side only.

## Hindsight workflow

1. `POST /api/incidents` validates the incident and saves it to Supabase when configured.
2. The Hindsight service calls the Hindsight Cloud recall endpoint using incident symptoms, service, environment, logs, and stack trace.
3. Groq receives both current evidence and recalled memories. Its JSON diagnosis distinguishes hypotheses from evidence and identifies the memories used.
4. `POST /api/incidents/{id}/resolve` stores the resolution, then calls Hindsight retain with the incident and confirmed root cause, solution, notes, and lesson.
5. Future incidents recall this retained knowledge. If Hindsight is unavailable, analysis can continue with current evidence and reports memory unavailability.

## Features

- Operations dashboard, active incident list, searchable/filterable history, incident detail and timeline, Hindsight memory browser, live memory comparison, and analytics.
- New incident intake with severity, environment, logs, and stack trace.
- Local log import for `.log`, `.txt`, `.out`, `.json`, `.csv`, and `.yaml` files (2 MB max). The browser suggests form fields; nothing is sent until the user submits the incident.
- Live before/after memory comparison centered on the seeded INC-018 scenario. It performs real provider calls and does not persist the demo incident.
- Incident history, details, timelines, and recalled memory evidence load from the API and Supabase.
- The memory browser shows entries returned by Hindsight and recall counts tracked in Supabase.
- Resolve flow that captures root cause, applied solution, notes, and recommendation usefulness.
- The legacy static HTML demo remains available separately. The Next.js dashboard uses live API data and does not silently simulate backend integrations.
- INC-018 seed script retains the critical deployment/environment-variable incident into a real Hindsight bank.

## Tech stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS (plus the preserved static demo)
- Backend: FastAPI, Python, HTTPX
- AI: Groq OpenAI-compatible API; default model `openai/gpt-oss-120b`
- Memory: Hindsight Cloud by Vectorize
- Database/auth: Supabase PostgreSQL and Supabase Auth

## Run locally

### Dashboard

Start the Next.js dashboard:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL` only when the API uses a different origin; it defaults to `http://localhost:8000/api`. The old static demo can still be opened with `python -m http.server 5500`.

### API

```bash
cd backend
python -m venv .venv
# Activate the virtual environment, then:
pip install -r requirements.txt
copy .env.example .env  # Windows PowerShell: Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Set credentials in `backend/.env`. The API docs are at `http://localhost:8000/docs`.

### Configure Supabase

Run [`backend/supabase/schema.sql`](backend/supabase/schema.sql) in the Supabase SQL editor. If the schema was applied earlier, run it again; its `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` adds the persisted AI evidence field without duplicating it. Configure the Supabase URL and server-only service-role key in the backend environment. Add proper user authentication and per-user authorization before exposing this deployment to multiple users; the hackathon API currently uses service-side database access for a single workspace demo.

### Configure Hindsight

Create a Hindsight Cloud bank, then set `HINDSIGHT_API_KEY`, `HINDSIGHT_BASE_URL`, and `HINDSIGHT_BANK_ID`. The default base URL is `https://api.hindsight.vectorize.io`. Retain the prepared INC-018 demo experience:

```bash
cd backend
python seed_hindsight.py
```

This makes a real retain call and will fail clearly when Hindsight is not configured. Use the Hindsight bank ID and API key from your Vectorize workspace.

### Configure Groq

Set `GROQ_API_KEY`; `GROQ_MODEL` defaults to `openai/gpt-oss-120b`. If Groq is missing or returns unusable JSON, the service supplies a cautious structured fallback rather than claiming an AI diagnosis was generated.

## Free-tier operation

- Supabase Free currently includes a 500 MB database and can pause projects after a week without activity. Check the live plan page for current quotas before relying on it: <https://supabase.com/pricing>.
- Groq's Free tier has model-specific rate limits. Exact limits depend on the account and are visible in the Groq Console: <https://console.groq.com/docs/rate-limits>.
- Hindsight Cloud starts with free credits and then uses pay-as-you-go billing. Hindsight can also be self-hosted without a software license fee, though the computer/server and its power/network still have a cost: <https://vectorize.io/pricing>.
- Log-file parsing in IncidentIQ runs in the browser without calling an AI provider. Submitting an incident calls the configured API providers and can use their free quotas or credits.

## Environment variables

See [`.env.example`](.env.example) and [`backend/.env.example`](backend/.env.example). Never put provider keys or Supabase service-role credentials in frontend JavaScript or `NEXT_PUBLIC_*` variables. The public Supabase placeholders exist for a future authenticated frontend client only.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Provider configuration status |
| POST | `/api/incidents` | Persist, recall Hindsight memories, and generate diagnosis |
| POST | `/api/demo/compare` | Compare diagnoses with and without live recalled memories; does not persist an incident |
| GET | `/api/incidents` | List stored incidents |
| GET | `/api/incidents/{id}` | Incident details, diagnosis, recalled evidence, resolutions, and timeline |
| POST | `/api/incidents/{id}/resolve` | Save resolution and retain it in Hindsight |
| GET | `/api/memory` | Proxy Hindsight memory listing |
| POST | `/api/memory/recall` | Search Hindsight directly |
| GET | `/api/analytics` | Aggregate persisted database records |

## Demo scenario

Use the **Memory demo** page to compare the same Payments API incident with and without live Hindsight context. The seeded INC-018 scenario describes HTTP 500 responses after deployment because `DATABASE_URL` is missing. This comparison makes one Hindsight recall and two Groq requests, but does not save an incident. To show the full learn-and-recall loop, create a real incident, resolve it with the confirmed cause and fix, then submit a similar incident and show the retained memory in its evidence panel. For a demonstration, use synthetic logs and inspect the incident before submitting it.

## Tests

```bash
cd backend
pytest
```

## Submission assets

See [`submission/`](submission/) for the article draft, social post draft, live-demo script, and [`captioned demo video`](submission/assets/IncidentIQ-demo.mp4). The video was captured from the running app using synthetic incident details; its live comparison showed six memories returned by Hindsight. Follow the separate hackathon content guide for its exact formats and team-member requirements before publishing.

## Future improvements

- Supabase Auth UI, per-user/team authorization, and row-level access policies.
- Add provider-mocked integration coverage for the complete create → recall → resolve → retain → recall loop.
- Add live Hindsight cost visibility and configurable retention policies.
- Add an optional local folder watcher for teams that explicitly install a local agent.
