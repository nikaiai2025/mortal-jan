/** A 32-symbol alphabet: a generated 32-character spell has 160 bits of entropy. */
export function normalizeSpell(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 128) return null;
	const spell = value.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
	return /^[a-km-np-z2-9]{32}$/.test(spell) ? spell : null;
}

export function formatSpell(spell: string): string {
	return spell.match(/.{1,4}/g)?.join("-") ?? spell;
}

/** Domain separation keeps a recovery credential distinct from a session credential. */
export const spellHashInput = (spell: string): string => `mortal-jan.recovery.v1:${spell}`;
