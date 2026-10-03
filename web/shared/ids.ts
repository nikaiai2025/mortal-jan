const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 characters, no look-alikes

export function randomId(length: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, (b) => ID_ALPHABET[b & 31]).join("");
}
