import { NAME_MAX_LENGTH } from "../shared/rules";
import { HttpError } from "./http";

// Rejected player names, compared after normalization. Extend as needed.
// Short words are matched exactly to avoid rejecting ordinary names that contain them.
const NG_EXACT = ["しね", "ころす", "sex", "かたわ"];
const NG_SUBSTRINGS = [
	"ちんこ",
	"ちんぽ",
	"まんこ",
	"せっくす",
	"れいぷ",
	"きちがい",
	"がいじ",
	"fuck",
	"shit",
	"nigger",
	// Reserved to prevent impersonation.
	"うんえい",
	"公式",
	"admin",
	"mortal",
];

function normalize(text: string): string {
	return text
		.normalize("NFKC")
		.toLowerCase()
		.replace(/\s+/g, "")
		.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // katakana → hiragana
		.replace(/死/g, "し")
		.replace(/殺/g, "ころ")
		.replace(/運営/g, "うんえい");
}

/** Returns the name to store (null clears it) or throws HttpError. */
export function validateName(raw: unknown): string | null {
	if (raw === null) return null;
	if (typeof raw !== "string") throw new HttpError(400, "name_invalid");
	const name = raw.normalize("NFC").trim();
	if (name === "") return null;
	if ([...name].length > NAME_MAX_LENGTH) throw new HttpError(400, "name_too_long");
	if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name)) throw new HttpError(400, "name_invalid");
	const normalized = normalize(name);
	if (NG_EXACT.includes(normalized) || NG_SUBSTRINGS.some((word) => normalized.includes(normalize(word)))) {
		throw new HttpError(400, "name_ng");
	}
	return name;
}
