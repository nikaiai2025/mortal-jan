// Reviewing misses: the history list (filtered to △ and ✕) is kept for this tab, so that the result
// page can lead to the next miss without asking the server again.

const KEY = "mortal-jan.review";

export function saveReview(ids: number[]): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(ids));
	} catch {
		// storage unavailable: the result page offers the profile instead
	}
}

/** The miss listed after `id`, or null at the end of the list. */
export function reviewNext(id: number): number | null {
	try {
		const ids = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as number[];
		const index = ids.indexOf(id);
		return index >= 0 && index + 1 < ids.length ? ids[index + 1] : null;
	} catch {
		return null;
	}
}
