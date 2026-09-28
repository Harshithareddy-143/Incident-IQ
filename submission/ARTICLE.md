# The incident that taught the next incident

When a production service fails, the response often starts with a familiar problem: the engineer on call has to reconstruct what happened from alerts, logs, deployment notes, and old tickets. A general-purpose AI can summarize the current error, but it may not know that the same service failed last month for the same reason—or which fix actually worked.

IncidentIQ is an incident-response application built around that gap. It connects a Next.js dashboard to a FastAPI backend, Groq for diagnosis, Supabase for incident records, and Hindsight for persistent incident memory.

## A confirmed fix becomes useful context

The workflow is grounded in an engineer’s confirmed resolution. An engineer submits an incident with its service, environment, symptoms, and available logs. Before generating a diagnosis, the backend asks Hindsight to recall related memories using those incident details. Groq receives the current incident and the recalled memories, then returns a structured response with a summary, likely cause, recommended checks, and an explanation of any memory match.

The diagnosis is a suggestion, not an automatic production change. The engineer investigates and records the confirmed root cause and applied solution. IncidentIQ saves the resolution and asks Hindsight to retain it. A later incident can recall that experience and present it as evidence for the next diagnosis.

That distinction matters: the model is not retrained after every ticket. IncidentIQ gives the model relevant, persistent experience when it answers. Historical fixes can guide an investigation, but they are not proof that the current failure has the same cause.

## Making memory visible

The project includes a seeded scenario, INC-018: the Payments API returns HTTP 500 errors in production after a deployment because `DATABASE_URL` is missing. The live memory comparison submits one incident to Groq twice: once without recalled memory and once with Hindsight’s actual recall results. It shows the returned memories beside the two diagnoses and does not save the comparison as a real incident.

During a recorded local run with the seeded bank, Hindsight returned six related memories. The memory-assisted diagnosis connected the current missing `DATABASE_URL` symptom to the earlier production deployment failure. This is a demonstration result, not a benchmark or a claim about average incident-resolution improvement.

The ordinary incident flow is separate. It stores the incident, tracks recalled evidence, lets the engineer record a resolution, and retains the confirmed fix in Hindsight. The memory browser displays entries returned by the configured bank. A local log-file import can suggest incident fields from a file selected by the user; it reads the file in the browser and sends the contents only after the user submits the incident.

## What this prototype demonstrates—and what it does not

The design demonstrates a useful memory loop: recall prior experience, diagnose with evidence, let a human confirm the fix, retain the result, and make it available to a later investigation. The project has backend tests for memory formatting, error handling, and the live comparison route, as well as a production build for the Next.js frontend.

This is a hackathon prototype, not a production incident-management system. The demo scenario is synthetic, the comparison depends on configured Groq and Hindsight services, and the project has not established a measured reduction in incident-resolution time. It does not monitor production or watch folders in the background. Before a team uses it for real incidents, it needs authentication, per-team access controls, a privacy review for log data, and end-to-end validation in a staging environment.

The goal is narrower: make organizational memory observable in one engineering workflow. If a prior, confirmed fix helps an engineer ask a better question during the next outage, the memory has done something a stateless answer could not.

## Project

IncidentIQ uses Next.js, TypeScript, Tailwind CSS, FastAPI, Groq, Supabase, and Hindsight. Run it locally using the steps in the project README. The live comparison makes two Groq requests and one Hindsight recall request; check your provider limits before repeated runs.
