# Status

## 17 Oct 2026 (tips)

**Done**

- Tips screen now matches the real engine and relay: page name + display name + message make the tip page in one click, then each provider (Razorpay, Ko-fi, Stripe) is three steps (paste your page link, add the shown webhook address with that provider's events, paste the secret). Secrets are write-only (Saved + Replace). Optional "Only payments from this link" (`plink_…`) and test mode. Copy/Open for the public link, a live preview of the public page, an accurate "Why it's safe", and a confirmed "Take the tip page down".
- `packages/api`: new `TipSettings`/`TipSettingsInput` types, `deleteTips`, and `tips.ts` with the relay's rules word for word (used by the screen for instant checks and by the demo engine). Demo engine: normalising, validation, has_secret handling, 409 taken names, 429 after 3 name changes a day, 422 without a relay (`?relay=0`), DELETE 204, `?tips=empty`.
- Tests: 17 unit tests for tips; 20 tip browser tests per browser (every error status, keyboard-only, axe in both themes, copy, take down) plus a 375 px phone flow.

**Next**

- Engine: `DELETE /api/v1/tips` and the API.md tips section (`docs/API-REQUESTS.md` R19).

## 17 Oct 2026 (later)

**Done**

- Overlays (`apps/overlays`): one page, one socket, snapshot first, every widget (alerts, chat, events, goal, label, viewers), five themes (molten, daylight, arcade, minimal, sticker), OBS hide freezes alerts, `tts` and `revoked` frames, close codes 4401/4404 stop reconnecting, `?test`, `?demo`, `?lowmotion`. 18 KB gzip JS. 62 unit tests, 23 browser tests.
- Dashboard (`apps/dashboard`, served at `/app/`): first run (connect, pick a look, add to OBS), Home, Chat (merged, reply to source, inline mod actions, viewer card, held messages, why-no-alert), Alerts (rule and look editor with the real overlay renderer as the preview), Overlays (blurred URLs, add to OBS with manual fallback, regenerate, layout editor with drag and keyboard), Moderation (panic, shared ban list, filters), Bot, Tips, Settings. Phone layout with a tab bar and a tap-for-actions sheet. 10 unit tests, 147 browser tests (Chromium, WebKit, iPhone) including every documented error status, offline engine, axe in both themes, keyboard-only and worst-case data.
- Site (`apps/site`): 17 pages with full SEO and generated share images, legal pages for Razorpay, Lighthouse mobile 99-100. 77 browser tests.
- Videos (`apps/video`): four loops plus a portrait cut, rendered into `apps/site/public/media/`.
- Engine API changes from 17 Oct (goals, held, panic, resync, tts, revoked; `/app/` base; 422 for connect and add-to-OBS) are implemented and tested.

- Reviews: CodeRabbit's shared free limit was used up for most batches, so overlays, dashboard and site each got a strict separate review; every real finding was fixed (see the commit bodies). CodeRabbit reviewed the final site batch: one finding, fixed.

**Next**

- Owner to confirm the company facts and policy wording in `apps/site/src/data/company.ts` and the legal pages.
- Engine to pick up `docs/API-REQUESTS.md` (R1-R17), especially themes, viewer card, session stats, held-message release.

**Blocked:** nothing in this repo.

## 17 Oct 2026

**Done:** repo, tooling, CI; brand (mark, app icon, favicons) generated from one geometry; design tokens and shared components; `packages/api` with types, client, sockets, core ports and the demo engine.
