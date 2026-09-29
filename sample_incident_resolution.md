# Sample incident and resolution

Use [`sample_incident.log`](sample_incident.log) in IncidentIQ's **New incident** form.

## Incident details

- **Title:** Payments API returns HTTP 500 after deployment
- **Service:** Payments API
- **Environment:** Production
- **Severity:** Critical
- **Symptoms and impact:** Customers cannot complete checkout. Errors started after the latest deployment; the payment provider is healthy.
- **Observed logs:** Filled from the imported file. Review the imported text before submitting.

Choose **Analyze incident** to save the incident and view its diagnosis. The app may recall the existing INC-018 memory about a missing production `DATABASE_URL`.

## Resolution to enter after verifying the cause

- **Confirmed root cause:** The production `DATABASE_URL` environment variable was missing after deployment, so the Payments API could not connect to its database.
- **Applied solution:** Restored the correct production `DATABASE_URL`, redeployed the service, and confirmed checkout requests returned successfully.
- **Notes:** Verified database connectivity and completed a test checkout after deployment. Check required environment variables during future production releases.
- **Was the recommendation useful?** Yes

Open the incident, enter those resolution fields, then choose **Save resolution & retain memory**. That saves the resolution and asks Hindsight to retain it. Only use the resolution after confirming it matches what actually happened.
