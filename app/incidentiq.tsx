"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Row = Record<string, any>;
type View = "Overview" | "Active incidents" | "History" | "Memory" | "Memory demo" | "Analytics";
const API = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}`.replace(/\/$/, "");
const nav: { name: View; icon: string }[] = [
  { name: "Overview", icon: "⌂" }, { name: "Active incidents", icon: "◉" },
  { name: "History", icon: "◷" }, { name: "Memory", icon: "✳" }, { name: "Memory demo", icon: "⇄" }, { name: "Analytics", icon: "▥" },
];
const text = (v: unknown, fallback = "—") => typeof v === "string" && v.trim() ? v : fallback;
const contentOf = (item: Row) => String(item?.text ?? item?.content ?? item?.context ?? "");
const incidentId = (row: Row) => row.incident_number || row.id || "";

export default function IncidentIQ() {
  const [view, setView] = useState<View>("Overview");
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [memories, setMemories] = useState<Row[]>([]);
  const [health, setHealth] = useState<Row>({});
  const [analytics, setAnalytics] = useState<Row>({});
  const [selected, setSelected] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importedFile, setImportedFile] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const detail = body.detail;
      const message = Array.isArray(detail)
        ? detail.map((issue: Row) => `${Array.isArray(issue.loc) ? issue.loc.slice(1).join(" → ") : "Request"}: ${issue.msg || "Invalid value"}`).join(". ")
        : typeof detail === "string" ? detail
        : detail && typeof detail === "object" ? JSON.stringify(detail)
        : `API request failed (${response.status})`;
      throw new Error(message);
    }
    return response.json();
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    const [h, i, m, a] = await Promise.allSettled([
      request("/health"), request("/incidents"), request("/memory"), request("/analytics"),
    ]);
    if (h.status === "fulfilled") setHealth(h.value);
    if (i.status === "fulfilled") setIncidents(Array.isArray(i.value) ? i.value : []);
    else setError(i.reason instanceof Error ? i.reason.message : "Unable to load incident history");
    if (m.status === "fulfilled") setMemories(m.value.items || m.value.memories || []);
    if (a.status === "fulfilled") setAnalytics(a.value);
  }, [request]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const active = useMemo(() => incidents.filter((item) => item.status !== "Resolved"), [incidents]);
  const filtered = useMemo(() => incidents.filter((item) => `${incidentId(item)} ${item.title || ""} ${item.service || ""} ${item.status || ""}`.toLowerCase().includes(search.toLowerCase())), [incidents, search]);

  async function openIncident(item: Row) {
    setError("");
    const id = incidentId(item);
    try { setSelected(await request(`/incidents/${encodeURIComponent(id)}`)); }
    catch { setSelected(item); }
    setView("Active incidents");
  }

  async function submitIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(["title", "service", "environment", "severity", "description", "logs", "stack_trace"].map((key) => [key, String(form.get(key) || "")]));
    try {
      const created = await request("/incidents", { method: "POST", body: JSON.stringify(payload) });
      setSelected(created); setView("Active incidents"); setNotice(`Incident ${incidentId(created)} analyzed and saved.`);
      formElement.reset(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create incident"); }
    finally { setBusy(false); }
  }

  async function importLogFile(file: File) {
    setError("");
    const allowed = /\.(log|txt|out|json|csv|yaml|yml)$/i.test(file.name);
    if (!allowed) { setError("Choose a .log, .txt, .out, .json, .csv, .yaml, or .yml file."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("That file is over 2 MB. Export a smaller time window and try again."); return; }
    try {
      const raw = await file.text();
      const logs = raw.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").slice(-30000);
      const errorLine = logs.split(/\r?\n/).find((line) => /\b(error|fatal|critical|exception|traceback|failed|failure|HTTP\s+5\d\d)\b/i.test(line));
      const concise = (errorLine || "").replace(/^\s*\S{10,30}\s+/, "").replace(/\s+/g, " ").trim().slice(0, 140);
      const service = logs.match(/(?:service(?:_name)?|application|app)\s*[=:]\s*([^\r\n,;]+)/i)?.[1]?.trim().slice(0, 100);
      const environment = logs.match(/environment\s*[=:]\s*(production|staging|development)\b/i)?.[1];
      const severity = /\b(fatal|critical|panic)\b/i.test(logs) ? "Critical" : /\b(error|exception|failed|failure)\b/i.test(logs) ? "High" : /\b(warn|warning)\b/i.test(logs) ? "Medium" : "";
      const stackStart = logs.search(/(?:Traceback \(most recent call last\):|\n\s+at\s+[^\n]+|\b\w+(?:Error|Exception):)/);
      const stack = stackStart >= 0 ? logs.slice(stackStart, stackStart + 30000) : "";
      const form = formRef.current;
      const setField = (name: string, value: string | undefined) => {
        if (!form || !value) return;
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) field.value = value;
      };
      setField("logs", logs);
      setField("title", concise || `${file.name.replace(/\.[^.]+$/, "").slice(0, 150)} log review`);
      if (service) setField("service", service);
      if (environment) setField("environment", environment[0].toUpperCase() + environment.slice(1).toLowerCase());
      if (severity) setField("severity", severity);
      setField("description", concise ? `Imported from ${file.name}. Detected: ${concise}` : `Imported ${file.name}. Review the extracted logs and describe the user impact.`);
      if (stack) setField("stack_trace", stack);
      setImportedFile(file.name);
      setNotice(`Read ${file.name} locally and filled suggested fields. Review them before analyzing.`);
    } catch {
      setError("Could not read that file. Try exporting it as UTF-8 text, JSON, or CSV.");
    }
  }

  async function resolveIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(["root_cause", "solution", "notes", "useful"].map((key) => [key, String(form.get(key) || "")]));
    try {
      const result = await request(`/incidents/${encodeURIComponent(incidentId(selected))}/resolve`, { method: "POST", body: JSON.stringify(payload) });
      setNotice(result.retained ? "Resolution saved and retained in Hindsight." : "Resolution saved. Hindsight retain was not confirmed.");
      await refresh(); await openIncident({ ...selected, status: "Resolved" });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save resolution"); }
    finally { setBusy(false); }
  }

  const pageTitle = view === "Overview" ? "Incident operations" : view;
  return <div className="app-shell">
    <aside className="app-sidebar">
      <div className="brand"><span className="brand-mark">I<span>Q</span></span><span className="hide-small">Incident<span className="muted">IQ</span><small>INCIDENT OPERATIONS</small></span></div>
      <div className="workspace hide-small"><span className="workspace-icon">◈</span>Engineering workspace<span className="chevron">⌄</span></div>
      <div className="nav-label hide-small">WORKSPACE</div>
      {nav.map((item) => <button key={item.name} onClick={() => { setView(item.name); setSelected(null); }} className={`nav-item app-nav ${view === item.name ? "active selected" : ""}`}><span>{item.icon}</span><span className="hide-small">{item.name}</span>{item.name === "Active incidents" && active.length > 0 && <b className="nav-count">{active.length}</b>}</button>)}
      <div className="sidebar-spacer" />
      <div className="memory-status hide-small"><div className="status-head"><i className={`pulse ${health.hindsight_configured ? "" : "offline"}`} />Hindsight memory</div><p>{health.hindsight_configured ? `Connected · ${health.hindsight_bank || "bank ready"}` : "Not connected to the API"}</p><button className="text-button" onClick={() => setView("Memory")}>Browse memories <span>→</span></button></div>
      <div className="profile"><div className="avatar">IQ</div><div className="hide-small"><strong>Engineering team</strong><small>Incident workspace</small></div></div>
    </aside>
    <main className="app-main">
      <header className="app-topbar"><div>Workspace <span className="slash">/</span><strong>{selected && view === "Active incidents" ? incidentId(selected) : pageTitle}</strong></div><div className="flex items-center gap-4"><span className="live"><i style={{ background: health.status === "ok" ? "#4ac594" : "#e9aa53" }} />{health.status === "ok" ? "API connected" : "API status unknown"}</span><button className="icon-btn" title="Refresh data" onClick={() => void refresh()}>↻</button></div></header>
      <div className="app-content">
        {error && <div role="alert" className="app-card mb-4 border-red-900 p-3 text-sm text-red-200">{error}<button className="float-right" onClick={() => setError("")}>×</button></div>}
        {view === "Overview" && <>
          <div className="page-title"><div><div className="eyebrow">MONDAY, INCIDENT COMMAND</div><h1>Good to see you <span className="wave">✳</span></h1><p className="subtitle">Your incident response, diagnosis, and engineering memory in one place.</p></div><button className="primary" onClick={() => { setView("Active incidents"); setSelected({ __new: true }); }}>＋ New incident</button></div>
          <div className="app-grid">
            <Stat label="Open incidents" value={active.length} icon="◉" tone="red" foot="From Supabase" />
            <Stat label="Resolved incidents" value={analytics.incidents_resolved ?? 0} icon="✓" tone="green" foot="Persisted resolutions" />
            <Stat label="Memories available" value={memories.length} icon="✳" tone="violet" foot={health.hindsight_configured ? "Live Hindsight bank" : "Hindsight unavailable"} />
            <Stat label="Memory assisted" value={analytics.memory_assisted_resolutions ?? 0} icon="↗" tone="blue" foot="Resolved with recalled context" />
          </div>
          <div className="demo-banner"><div className="demo-icon">✳<i /></div><div className="demo-copy"><div className="banner-kicker">INCIDENTIQ MEMORY ENGINE <span>LIVE DATA</span></div><h2>Past incidents can make the next response faster.</h2><p>Recall verified resolutions, inspect why they match, and retain fixes after resolution.</p></div><button className="secondary" onClick={() => setView("Memory")}>Explore memory →</button><div className="banner-orb" /></div>
          <div className="section-heading"><div><h2>Recent incidents</h2><p>Latest incidents saved to the workspace.</p></div><button className="link-button" onClick={() => setView("History")}>View history →</button></div>
          <IncidentTable rows={incidents.slice(0, 6)} onSelect={openIncident} />
          <div className="app-two mt-4"><div className="app-card p-4"><div className="panel-head"><div><h3>Service connectivity</h3><p>Current integration status from the backend.</p></div></div><div className="mt-4 flex flex-wrap gap-2">{[["API", health.status === "ok"], ["Groq", health.groq_configured], ["Hindsight", health.hindsight_configured], ["Supabase", health.supabase_configured]].map(([label, on]) => <span className="app-badge" key={String(label)}><i className="pulse" style={{ background: on ? "#4ac594" : "#e9aa53" }} />{String(label)} · {on ? "Connected" : "Unavailable"}</span>)}</div></div><div className="app-card p-4"><div className="panel-head"><div><h3>Memory bank snapshot</h3><p>Evidence from Hindsight, not sample cards.</p></div><button className="link-button" onClick={() => setView("Memory")}>Browse</button></div><p className="mt-5 text-2xl font-bold text-violet-300">{memories.length}<span className="ml-2 text-xs font-normal text-slate-400">memories returned</span></p></div></div>
        </>}

        {view === "Active incidents" && selected?.__new && <>
          <PageHeading eyebrow="INCIDENT INTAKE" title="Report an incident" subtitle="IncidentIQ checks Hindsight for related resolutions and asks Groq to analyze current evidence." onBack={() => { setSelected(null); setView("Overview"); }} />
          <form ref={formRef} className="app-card p-5" onSubmit={submitIncident}><LogFileImport onFile={importLogFile} fileName={importedFile} /><div className="grid gap-4 md:grid-cols-2"><Field name="title" label="Incident title" placeholder="Checkout errors after deployment" required /><Field name="service" label="Service" placeholder="Payments API" required /><label className="app-label">Environment<select className="app-field" name="environment"><option>Production</option><option>Staging</option><option>Development</option></select></label><label className="app-label">Severity<select className="app-field" name="severity"><option>Critical</option><option>High</option><option selected>Medium</option><option>Low</option></select></label><Area name="description" label="Symptoms and impact" required /><Area name="logs" label="Observed logs or errors" /><Area name="stack_trace" label="Stack trace" /></div><div className="mt-4 flex justify-end"><button className="primary" disabled={busy}>{busy ? "Analyzing…" : "Analyze incident →"}</button></div></form>
        </>}

        {view === "Active incidents" && selected && !selected.__new && <>
          <PageHeading eyebrow="INCIDENT DETAIL" title={text(selected.title, incidentId(selected))} subtitle={`${incidentId(selected)} · ${text(selected.service)} · ${text(selected.environment)}`} onBack={() => setSelected(null)} />
          <IncidentDetail row={selected} onResolve={resolveIncident} busy={busy} />
        </>}

        {view === "Active incidents" && !selected && <><PageHeading eyebrow="ON-CALL QUEUE" title="Active incidents" subtitle="Investigate open incidents and review diagnosis evidence." action={<button className="primary" onClick={() => setSelected({ __new: true })}>＋ New incident</button>} /><IncidentTable rows={active} onSelect={openIncident} /></>}

        {view === "History" && <><PageHeading eyebrow="INCIDENT ARCHIVE" title="Incident history" subtitle="Search persisted incidents, diagnoses, and resolutions." /><div className="filter-row"><input aria-label="Search incidents" className="app-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, title, service, status…" /></div><IncidentTable rows={filtered} onSelect={openIncident} /></>}

        {view === "Memory" && <><PageHeading eyebrow="ENGINEERING MEMORY" title="Hindsight memory bank" subtitle="Memory entries loaded from the configured Hindsight bank; recall counts come from persisted incident evidence." /><div className="app-card memory-intro"><div className="intro-mark">✳</div><div><h2>{health.hindsight_configured ? "Memory service connected" : "Memory service unavailable"}</h2><p>{health.hindsight_configured ? `Bank: ${health.hindsight_bank || "configured"}. Each card shows the stored text returned by the API.` : "Start the backend and configure Hindsight to browse persistent memories."}</p></div><div className="recall-stat"><strong>{memories.length}</strong><span>entries returned</span></div></div><div className="section-heading"><div><h2>Stored memories</h2><p>Inspect source facts, IDs, dates, and tracked recalls.</p></div></div>{memories.length ? <div className="memory-grid">{memories.map((m, index) => <MemoryCard key={String(m.id || index)} item={m} />)}</div> : <Empty text="No memories returned. Retain a resolved incident or seed the demo memory." />}</>}

        {view === "Memory demo" && <MemoryDemo request={request} setError={setError} setNotice={setNotice} />}

        {view === "Analytics" && <><PageHeading eyebrow="WORKSPACE SIGNALS" title="Incident analytics" subtitle="Aggregates calculated from incidents and saved resolutions." /><div className="app-grid"><Stat label="Total incidents" value={analytics.incidents_total ?? incidents.length} icon="◉" tone="blue" foot="In Supabase" /><Stat label="Resolved" value={analytics.incidents_resolved ?? 0} icon="✓" tone="green" foot="In Supabase" /><Stat label="Memory assisted" value={analytics.memory_assisted_resolutions ?? 0} icon="✳" tone="violet" foot="Resolved incidents" /><Stat label="Avg. resolution" value={analytics.average_resolution_minutes == null ? "—" : `${analytics.average_resolution_minutes}m`} icon="◷" tone="amber" foot="Resolved rows with timestamps" /></div><div className="app-two mt-4"><div className="app-card p-4"><h3 className="font-semibold">Root causes</h3>{Object.entries(analytics.root_causes || {}).length ? Object.entries(analytics.root_causes).map(([cause, count]) => <div className="recall-item" key={cause}><span>{cause}</span><b>{String(count)}</b></div>) : <Empty text="No persisted root cause data yet." />}</div><div className="app-card p-4"><h3 className="font-semibold">Cause categories</h3>{Object.entries(analytics.categories || {}).length ? Object.entries(analytics.categories).map(([cause, count]) => <div className="recall-item" key={cause}><span>{cause}</span><b>{String(count)}</b></div>) : <Empty text="Categories appear after incidents are resolved." />}</div></div></>}
      </div>
    </main>
    {notice && <div className="toast show">{notice}</div>}
  </div>;
}

function Stat({ label, value, icon, tone, foot }: { label: string; value: string | number; icon: string; tone: string; foot: string }) {
  return <div className="stat-card"><div className="stat-top">{label}<span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>;
}
function MemoryDemo({ request, setError, setNotice }: { request: (path: string, init?: RequestInit) => Promise<Row>; setError: (value: string) => void; setNotice: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Row | null>(null);
  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(["title", "service", "environment", "severity", "description", "logs", "stack_trace"].map((key) => [key, String(form.get(key) || "")]));
    try {
      const comparison = await request("/demo/compare", { method: "POST", body: JSON.stringify(payload) });
      setResult(comparison);
      setNotice(comparison.persisted ? "Comparison complete." : "Live comparison complete; no incident was saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "The comparison failed."); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow="LIVE HINDSIGHT COMPARISON" title="See memory change the response" subtitle="The same incident is diagnosed twice: first without memories, then with Hindsight recall." />
    <div className="app-card mb-4 border-violet-900/70 p-4 text-xs leading-relaxed text-violet-100">This demo makes two Groq diagnosis requests and one Hindsight recall request. It does not save an incident or retain a memory. Use the seeded Payments API scenario to make the comparison clear.</div>
    <form className="app-card mb-4 p-5" onSubmit={run}><div className="grid gap-4 md:grid-cols-2"><Field name="title" label="Incident title" placeholder="Payments API fails after deployment" required defaultValue="Payments API returns 500 after deployment" /><Field name="service" label="Service" placeholder="Payments API" required defaultValue="Payments API" /><label className="app-label">Environment<select className="app-field" name="environment" defaultValue="Production"><option>Production</option><option>Staging</option><option>Development</option></select></label><label className="app-label">Severity<select className="app-field" name="severity" defaultValue="Critical"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label><Area name="description" label="Symptoms and impact" required defaultValue="Checkout requests return HTTP 500 immediately after the latest deployment." /><Area name="logs" label="Observed logs or errors" defaultValue="DATABASE_URL is undefined" /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">Tip: the seeded INC-018 memory is about DATABASE_URL missing in production.</span><button className="primary" disabled={busy}>{busy ? "Recalling and comparing…" : "Run live comparison →"}</button></div></form>
    {result && <><div className="flex flex-wrap gap-2 pb-3"><span className="app-badge">Hindsight {result.hindsight_available ? "available" : "unavailable"}</span><span className="app-badge">{result.memory_count || 0} memories recalled</span><span className="app-badge">Database unchanged</span></div><div className="comparison">
      <CompareResult title="Without Hindsight" eyebrow="BASELINE · NO MEMORY CONTEXT" diagnosis={result.without_memory} />
      <CompareResult title="With Hindsight" eyebrow="MEMORY-ASSISTED · LIVE RECALL" diagnosis={result.with_memory} />
    </div><div className="section-heading"><div><h2>Recalled evidence</h2><p>These are the live Hindsight results provided to the memory-assisted diagnosis.</p></div></div>{result.memories?.length ? <div className="memory-grid">{result.memories.map((item: Row, i: number) => <MemoryCard key={item.id || i} item={item} />)}</div> : <Empty text="Hindsight returned no related memories for this query. The comparison is still real, but this run cannot show a memory improvement." />}</>}
  </>;
}
function CompareResult({ title, eyebrow, diagnosis }: { title: string; eyebrow: string; diagnosis: Row }) {
  const checks = Array.isArray(diagnosis?.recommended_checks) ? diagnosis.recommended_checks : [];
  const memoryAssisted = title === "With Hindsight";
  return <article className={`compare-card ${memoryAssisted ? "with" : ""}`}><header className="compare-head"><div className="memory-mark">{memoryAssisted ? "✳" : "AI"}</div><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div><span className={memoryAssisted ? "assisted-label" : "generic-label"}>{memoryAssisted ? "LIVE MEMORY" : "NO MEMORY"}</span></header><div className="compare-body"><span className="response-label">SUMMARY</span><p>{diagnosis?.summary || "No diagnosis returned."}</p><div className="analysis-block"><h4>LIKELY ROOT CAUSE · {diagnosis?.confidence || "Confidence not provided"}</h4><p>{diagnosis?.likely_root_cause || "Not identified"}</p></div>{checks.length > 0 && <div className="analysis-block mt-3"><h4>RECOMMENDED CHECKS</h4><ul>{checks.map((check: string, index: number) => <li key={index}>{check}</li>)}</ul></div>}{memoryAssisted && diagnosis?.reasoning_from_memory && <div className="recalled-card mt-3"><div className="recalled-top">WHY MEMORY MATTERS</div><p>{diagnosis.reasoning_from_memory}</p></div>}{!memoryAssisted && <div className="recalled-card mt-3"><div className="recalled-top">BASELINE</div><p>No prior incident memories were provided to this diagnosis.</p></div>}</div><footer className="compare-foot"><span>{memoryAssisted ? "Same incident + recalled Hindsight evidence" : "Same incident, no prior context supplied"}</span></footer></article>;
}
function PageHeading({ eyebrow, title, subtitle, action, onBack }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode; onBack?: () => void }) {
  return <div className="page-title"><div>{onBack && <button className="link-button mb-3 block" onClick={onBack}>← Back</button>}<div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</div>;
}
function IncidentTable({ rows, onSelect }: { rows: Row[]; onSelect: (row: Row) => void }) {
  if (!rows.length) return <Empty text="No incidents found. Create an incident to populate this view from the backend." />;
  return <div className="table-wrap app-scroll"><table className="app-table"><thead><tr><th>INCIDENT</th><th>SERVICE</th><th>SEVERITY</th><th>STATUS</th><th>MEMORY</th><th>CREATED</th></tr></thead><tbody>{rows.map((row) => <tr key={incidentId(row)} onClick={() => onSelect(row)}><td><strong className="text-slate-100">{text(row.title, incidentId(row))}</strong><div className="mt-1 font-mono text-[9px] text-slate-500">{incidentId(row)}</div></td><td>{text(row.service)}</td><td><span className={`severity sev-${String(row.severity || "low").toLowerCase()}`}>{text(row.severity)}</span></td><td><span className={`status-pill ${row.status === "Resolved" ? "" : "status-investigating"}`}>{text(row.status)}</span></td><td className={row.memory_used ? "memory-pill" : "memory-pill dim"}>{row.memory_used ? "✳ recalled" : "—"}</td><td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div>;
}
function Field({ name, label, placeholder, required, defaultValue }: { name: string; label: string; placeholder: string; required?: boolean; defaultValue?: string }) { return <label className="app-label">{label}<input className="app-field" name={name} placeholder={placeholder} required={required} defaultValue={defaultValue} maxLength={name === "title" ? 180 : name === "service" ? 100 : undefined} />{name === "title" && <small className="mt-1 block text-slate-500">Use a short summary (up to 180 characters), not the SQL setup instructions.</small>}</label>; }
function LogFileImport({ onFile, fileName }: { onFile: (file: File) => void; fileName: string }) {
  const [dragging, setDragging] = useState(false);
  function choose(event: ChangeEvent<HTMLInputElement>) { const file = event.currentTarget.files?.[0]; if (file) onFile(file); event.currentTarget.value = ""; }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file) onFile(file); }
  return <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`mb-5 rounded-lg border border-dashed p-4 transition ${dragging ? "border-violet-400 bg-violet-950/30" : "border-slate-700 bg-slate-900/40"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-sm text-slate-200">Import a log file</strong><p className="mt-1 text-xs text-slate-400">Drop a file here or choose one. IncidentIQ reads it in this browser and suggests form fields.</p><p className="mt-1 text-[10px] text-slate-500">.log .txt .out .json .csv .yaml · 2 MB max · nothing is sent until you choose Analyze incident</p>{fileName && <p className="mt-2 text-xs text-violet-300">Loaded: {fileName} — check the suggested fields below.</p>}</div><label className="secondary cursor-pointer">Choose file<input className="sr-only" type="file" accept=".log,.txt,.out,.json,.csv,.yaml,.yml,text/plain,application/json,text/csv" onChange={choose} /></label></div>
  </div>;
}
function Area({ name, label, required, defaultValue }: { name: string; label: string; required?: boolean; defaultValue?: string }) { return <label className="app-label md:col-span-2">{label}<textarea className="app-field min-h-24 resize-y" name={name} required={required} defaultValue={defaultValue} placeholder="Add concrete evidence; avoid secrets." /></label>; }
function Empty({ text: message }: { text: string }) { return <div className="app-card empty-state">{message}</div>; }
function MemoryCard({ item }: { item: Row }) {
  const body = contentOf(item);
  const title = item.title || body.split("\n").find((line) => line.toLowerCase().startsWith("title:"))?.split(":").slice(1).join(":").trim() || "Stored Hindsight memory";
  return <article className="memory-card"><div className="memory-card-head"><b>{item.id || "HINDSIGHT"}</b><span>{item.fact_type || "memory"}</span></div><h3>{title}</h3><div className="app-memory">{body || item.context || "The provider returned this entry without a text field."}</div><div className="memory-card-foot"><span>{item.date || item.updated_at || item.occurred_start ? new Date(item.date || item.updated_at || item.occurred_start).toLocaleDateString() : "Date not provided"}</span><strong>{Number(item.times_recalled || 0)} tracked recalls</strong></div></article>;
}
function IncidentDetail({ row, onResolve, busy }: { row: Row; onResolve: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const analysis = row.analysis || {};
  const evidence: Row[] = row.related_historical_incidents || [];
  return <div className="detail-grid"><div><section className="app-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="eyebrow">{incidentId(row)}</span><h2 className="mt-2 text-lg font-semibold">{text(row.title)}</h2></div><span className={`status-pill ${row.status === "Resolved" ? "" : "status-investigating"}`}>{text(row.status)}</span></div><p className="detail-text mt-4">{text(row.description)}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400"><span>Service: {text(row.service)}</span><span>Environment: {text(row.environment)}</span><span>Severity: {text(row.severity)}</span><span>Created: {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</span></div>{row.logs && <DetailBlock title="OBSERVED LOGS" value={row.logs} />}{row.stack_trace && <DetailBlock title="STACK TRACE" value={row.stack_trace} />}</section>
    <section className="app-card mt-3 p-4"><div className="panel-head"><div><h3>AI diagnosis</h3><p>Generated from this incident and the recalled evidence shown below.</p></div>{analysis.confidence && <span className="app-badge">Confidence · {analysis.confidence}</span>}</div><DetailBlock title="SUMMARY" value={analysis.summary || row.ai_summary} /><DetailBlock title="LIKELY ROOT CAUSE" value={analysis.likely_root_cause || row.likely_root_cause} /><DetailBlock title="RECOMMENDED ACTIONS" value={analysis.recommended_actions} /><DetailBlock title="MEMORY REASONING" value={analysis.reasoning_from_memory} /></section>
    <section className="app-card mt-3 p-4"><h3 className="font-semibold">Resolution</h3>{(row.resolutions || []).length ? row.resolutions.map((item: Row) => <div key={item.id || item.created_at} className="detail-block"><h4>ROOT CAUSE</h4><p className="detail-text">{item.root_cause}</p><h4 className="mt-3">SOLUTION</h4><p className="detail-text">{item.solution}</p>{item.notes && <p className="detail-text mt-2">{item.notes}</p>}</div>) : row.status !== "Resolved" ? <form onSubmit={onResolve} className="mt-4"><label className="app-label">Confirmed root cause<textarea className="app-field min-h-20" name="root_cause" required minLength={5} /></label><label className="app-label">Applied solution<textarea className="app-field min-h-20" name="solution" required minLength={5} /></label><label className="app-label">Notes<textarea className="app-field min-h-16" name="notes" /></label><label className="app-label">Was the recommendation useful?<select className="app-field" name="useful"><option>Yes</option><option>Partially</option><option>No</option></select></label><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save resolution & retain memory →"}</button></form> : <p className="app-muted mt-3 text-sm">No resolution record was returned for this incident.</p>}</section></div>
    <aside><section className="app-card p-4"><div className="panel-head"><div><h3>Historical evidence</h3><p>Actual memories recalled for this incident.</p></div></div>{evidence.length ? evidence.map((item, i) => <div className="recalled-card" key={item.id || i}><div className="recalled-top"><span>{item.id || "RECALLED MEMORY"}</span><span>Returned by Hindsight</span></div><div className="recalled-issue">{item.title || contentOf(item).split("\n").find((line) => line.startsWith("Title:")) || "Historical incident"}</div><p className="app-memory">{contentOf(item)}</p>{item.similarity != null && <small>Similarity score: {item.similarity}</small>}</div>) : <Empty text="No related Hindsight memories were returned for this incident." />}</section><section className="app-card mt-3 p-4"><h3 className="font-semibold">Timeline</h3>{(row.timeline || []).length ? row.timeline.map((entry: Row) => <div key={entry.id} className="timeline-row"><time>{entry.occurred_at ? new Date(entry.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</time><i />{entry.event}</div>) : <p className="app-muted mt-3 text-xs">No timeline events were recorded.</p>}</section></aside></div>;
}
function DetailBlock({ title, value }: { title: string; value: unknown }) {
  const result = Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n") : typeof value === "object" && value ? JSON.stringify(value, null, 2) : text(value);
  return <div className="detail-block"><h4>{title}</h4><p className="detail-text whitespace-pre-wrap">{result}</p></div>;
}
