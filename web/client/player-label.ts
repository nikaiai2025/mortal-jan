import type { PlayerLabel } from "../shared/types";
import { t } from "./i18n";

/** Never guess anonymity from display text: a player can choose that exact text. */
export function localizedPlayerName(fallback: string, identity?: PlayerLabel): string {
 return identity ? identity.name ?? t(`名無し#${identity.publicId}`, `Anonymous#${identity.publicId}`) : fallback;
}
