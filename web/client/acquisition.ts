import { VISITOR_ID_PATTERN, acquisitionFromUrl, type Acquisition } from "../shared/acquisition";
import type { Session } from "../shared/types";

export const ACQUISITION_KEY = "mortal-jan.acquisition";
export const MEASUREMENT_OFF_KEY = "mortal-jan.measurement-off";
interface Arrival extends Acquisition { visitorId: string }
let arrival: Arrival | null = null;
let pending: Promise<void> = Promise.resolve();
const sent = new Set<string>();

export function measurementOff(): boolean {
	try { return localStorage.getItem(MEASUREMENT_OFF_KEY) === "1"; } catch { return true; }
}

/** Storage is required: do not invent another visitor on every load when storage is blocked. */
export function startAcquisition(url: URL, referrer: string): void {
	try {
		if (url.searchParams.get("measure") === "off") localStorage.setItem(MEASUREMENT_OFF_KEY, "1");
		if (url.searchParams.get("measure") === "on") localStorage.removeItem(MEASUREMENT_OFF_KEY);
		if (measurementOff()) { arrival = null; return; }
		const raw = localStorage.getItem(ACQUISITION_KEY);
		if (raw) {
			const stored = JSON.parse(raw) as Arrival;
			if (!VISITOR_ID_PATTERN.test(stored.visitorId)) return;
			arrival = stored;
		} else {
			arrival = { visitorId: crypto.randomUUID(), ...acquisitionFromUrl(url, referrer) };
			localStorage.setItem(ACQUISITION_KEY, JSON.stringify(arrival));
		}
	} catch { arrival = null; }
}

export const acquisitionVisitorId = (): string | null => !measurementOff() ? arrival?.visitorId ?? null : null;

/** Only once per page/player, bounded to 1s, and entirely optional for gameplay. */
export function reportArrival(session?: Session): Promise<void> {
	if (!acquisitionVisitorId()) return Promise.resolve();
	const key = session?.publicId ?? "anonymous";
	if (sent.has(key)) return pending;
	sent.add(key);
	pending = pending.then(async () => {
		if (!acquisitionVisitorId()) return;
		try {
			await fetch("/api/acquisition", {
				method: "POST", headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
				body: JSON.stringify(arrival), signal: AbortSignal.timeout(1000),
			});
		} catch { /* Retry on a future page load, not before every gameplay request. */ }
	});
	return pending;
}

export function measurementControl(root: HTMLElement): void {
	const host = root.querySelector<HTMLElement>("[data-measurement-control]");
	if (!host) return;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "ghost-button";
	const update = () => { button.textContent = measurementOff() ? "訪問元と回答の計測を再開する" : "訪問元と回答の計測を停止する"; };
	update();
	button.addEventListener("click", () => {
		try {
			if (measurementOff()) { localStorage.removeItem(MEASUREMENT_OFF_KEY); location.reload(); }
			else { localStorage.setItem(MEASUREMENT_OFF_KEY, "1"); arrival = null; update(); }
		} catch { button.textContent = "この端末では設定を保存できません"; button.disabled = true; }
	});
	host.replaceChildren(button);
}
