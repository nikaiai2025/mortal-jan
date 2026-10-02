// Measures the question page in headless Chrome emulating a phone (390px wide, DPR 3, CPU 4x slower):
// main-thread time while waiting on the question (tap invite animation on / off) and the time from a
// hand tile tap to the next frame.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const URL = process.argv[2] ?? "http://localhost:5173/q/1";
const profile = mkdtempSync(join(tmpdir(), "mj-measure-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
	await sleep(200);
	try {
		target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page");
	} catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	}
});
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const id = ++nextId;
		pending.set(id, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
		ws.send(JSON.stringify({ id, method, params }));
	});
const evaluate = async (expression) => {
	const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
	return r.result.value;
};
const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send("Performance.enable");
await send("Page.navigate", { url: URL });
for (let i = 0; i < 100; i++) {
	await sleep(200);
	if (await evaluate("document.querySelectorAll('.board__tile').length > 0").catch(() => false)) break;
}
await sleep(1000);
await send("Emulation.setCPUThrottlingRate", { rate: 4 });

/** Main-thread busy time over 5 s on the question, in ms. */
async function idle(label) {
	const a = await metrics();
	await sleep(5000);
	const b = await metrics();
	const d = (k) => Math.round((b[k] - a[k]) * 1000);
	return { label, taskMs: d("TaskDuration"), styleMs: d("RecalcStyleDuration") };
}
const results = [await idle("invite animation ON")];
await evaluate("(() => { const s = document.createElement('style'); s.id = 'noanim'; s.textContent = '.board__tile,.board__tile::after{animation:none!important}'; document.head.append(s); })()");
results.push(await idle("invite animation OFF"));
await evaluate("document.getElementById('noanim').remove()");

// A tap redraws the board synchronously; the next frame comes after it.
const tap = await evaluate(`(async () => {
	const out = [];
	const buttons = [...document.querySelectorAll('.board__tile:not(:disabled)')];
	for (let i = 0; i < 12; i++) {
		const t = performance.now();
		buttons[i % buttons.length].click();
		await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
		out.push(Math.round(performance.now() - t));
	}
	return out;
})()`);

console.log(JSON.stringify({ url: URL, idle: results, tapToFrameMs: tap }, null, 2));
ws.close();
chrome.kill();
