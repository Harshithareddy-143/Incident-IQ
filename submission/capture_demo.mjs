// Captures the running app through a temporary local Edge debugging session.
// It invokes the live comparison endpoint: expect one recall and two model calls.
import { mkdir, writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:9222";
const target = await fetch(`${base}/json/new?http://localhost:3000`, { method: "PUT" }).then((r) => {
  if (!r.ok) throw new Error(`Could not open dashboard in Edge (${r.status})`);
  return r.json();
});
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});
function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shots = new URL("./assets/", import.meta.url);
await mkdir(shots, { recursive: true });
await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await command("Page.navigate", { url: "http://localhost:3000" });
for (let i = 0; i < 30; i++) {
  if ((await evaluate("document.body?.innerText.includes('Incident operations')"))) break;
  await pause(500);
}
async function screenshot(name) {
  const result = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL(name, shots), Buffer.from(result.data, "base64"));
}
await screenshot("01-overview.png");
await evaluate("[...document.querySelectorAll('.app-nav')].find(b => b.innerText.includes('Memory') && !b.innerText.includes('demo'))?.click()");
await pause(1800);
await screenshot("02-memory-bank.png");
await evaluate("[...document.querySelectorAll('.app-nav')].find(b => b.innerText.includes('Memory demo'))?.click()");
await pause(500);
const formCheck = await evaluate("(() => { const f=document.querySelector('form'); return {valid:f?.checkValidity(), description:f?.elements.namedItem('description')?.value}; })()");
if (!formCheck?.valid) throw new Error(`Demo form is incomplete: ${JSON.stringify(formCheck)}`);
await pause(300);
await screenshot("03-comparison-input.png");
await evaluate("[...document.querySelectorAll('button')].find(b => b.innerText.includes('Run live comparison'))?.click()");
let complete = false;
for (let i = 0; i < 150; i++) {
  complete = await evaluate("document.body?.innerText.includes('Recalled evidence')");
  if (complete) break;
  await pause(600);
}
if (!complete) throw new Error("The live comparison did not finish in 90 seconds.");
await evaluate("document.querySelector('.comparison')?.scrollIntoView({block: 'center'})");
await pause(400);
await screenshot("04-live-comparison.png");
const summary = await evaluate(`(() => ({
  containsGeneric: document.body.innerText.includes('Without Hindsight'),
  containsAssisted: document.body.innerText.includes('With Hindsight'),
  showsActualEvidence: document.body.innerText.includes('Recalled evidence'),
  noDatabaseWrite: document.body.innerText.includes('Database unchanged')
}))()`);
await writeFile(new URL("capture-summary.json", shots), JSON.stringify(summary, null, 2));
socket.close();
console.log(JSON.stringify({ screenshots: 4, ...summary }));
