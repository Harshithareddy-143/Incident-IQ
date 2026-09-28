# IncidentIQ live demo script (about 90 seconds)

## Before recording

- Start the backend and Next.js dashboard.
- Confirm the health badges show Groq, Hindsight, and Supabase connected.
- Confirm INC-018 is visible in the Hindsight memory browser.
- Use the synthetic example below. Do not record real customer data, secrets, or API keys.
- The live comparison makes two Groq calls and one Hindsight recall; check current quotas before recording.

## Narration and actions

**0:00–0:12 — The problem**  
Say: “When production breaks, teams lose time rediscovering fixes from old incidents. A one-shot AI has no access to that history.” Show the IncidentIQ overview and integration status.

**0:12–0:25 — The experience it should remember**  
Open **Memory** and show the real INC-018 entry: Payments API, production deployment, missing `DATABASE_URL`, and the confirmed fix. Say: “This is an incident retained in Hindsight, not a card hard-coded into the comparison screen.”

**0:25–0:58 — Compare live responses**  
Open **Memory demo**. Submit:

- Title: `Payments API returns 500 after deployment`
- Service: `Payments API`
- Environment: `Production`
- Severity: `Critical`
- Symptoms: `Checkout requests return HTTP 500 immediately after the latest deployment.`
- Logs: `DATABASE_URL is undefined`

Select **Run live comparison**. Show the same incident under **Without Hindsight** and **With Hindsight**, plus the returned memory evidence. Say: “Both responses use the same incident. The second also gets memories recalled from Hindsight; this comparison is not stored as a real incident.”

**0:58–1:15 — Close the loop**  
Open **Active incidents** and explain that the ordinary workflow saves incidents. A human engineer records the confirmed cause and fix; IncidentIQ retains that resolution so a later incident can recall it. Do not claim the comparison itself retained anything.

**1:15–1:30 — Explain the design**  
Say: “Groq generates the diagnosis, Supabase stores incident records, and Hindsight supplies persistent incident memory. The model is not fine-tuned; it receives relevant experience as evidence. This prototype keeps a human in control of resolution.”

## If the live comparison has no matching memory

Do not present an empty result as proof of improvement. Confirm INC-018 is in the selected bank and try a close synthetic query. If Hindsight still recalls nothing, show the actual empty state and record the demo later; do not replace the result with a fabricated memory.
