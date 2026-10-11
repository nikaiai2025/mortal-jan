# English UI and language switch

## Scope

- Japanese remains the default. The header offers 日本語 / English.
- The browser remembers an explicit choice under `mortal-jan.locale`. Blocked storage falls back to an in-memory choice.
- `?lang=en` opens English directly. Internal links keep the current language while preserving problem numbers, set filters and referral/review parameters.
- Translated surfaces: navigation, problem/answer/result screens, stats and rankings, recovery, measurement controls, rules/about, tile accessibility labels, board labels and generated share images.
- A language change reuses the current problem and its selected tile/call/riichi state. It does not fetch a new random problem or submit an answer. Answer submission disables the switch until it finishes.
- A displayed one-time recovery code and unsent form input survive a language change. Codes are not added to persistent storage, analytics or URLs.
- Existing scoring, API contracts, session identity, measurement opt-out and Japanese copy are unchanged.

## Search scope

This is client-side language support for visitors, including future English-language introductions. It does not create independently indexed English pages. Built public HTML, sitemap and canonical URL policy remain Japanese. Existing share-card artwork is unchanged; share images generated in the app use the selected language. Do not describe this PR as verified English search indexing.

## Automated checks

From `web/`: `npm run typecheck`, `npm test`, `npm run build`.

`client/i18n.test.ts` covers defaults, saved preference, explicit links, blocked storage, query preservation, runtime labels, accessible tile names, public copy and metadata. `client/language-flow.test.ts` uses Happy DOM and synthetic fixtures to check selected riichi/tile and call state, no reassignment/resubmission, internal navigation, one-time recovery-code retention and reissue, unsent recovery input and unchanged opt-out. Canvas drawing and network responses are mocked in this DOM test; it is not visual browser QA.

## Visual QA still required

Cloud Chromium could not start in the command sandbox (`socket() failed: Operation not permitted`). The supported dot cloud browser was available, but the local preview URL returned `ERR_CONNECTION_REFUSED`. No production preview was published to work around this.

Before merging, inspect narrow and desktop layouts in a reachable local browser, especially the English riichi prompt, rankings, recovery form and share image. Exercise Back/Forward, reload, repeated language switches and result-sharing dialog Close. Tests/build do not prove text fits visually.
