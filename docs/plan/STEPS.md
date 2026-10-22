# Steps

Order: repo and tooling → brand and design system → overlays → dashboard (demo mode) → site → videos → polish, tests, review.

## 1. Repo and tooling
- [x] pnpm workspace, TS strict, Prettier, ESLint, GPL-3.0 licence
- [x] commit-msg hook, `tools/check.sh`, CI workflow pinned to SHAs
- [x] CLAUDE.md, README, STEPS, STATUS, API-REQUESTS

## 2. Brand and design system
- [x] Logo mark generated from one geometry; wordmark; app icon 1024 (SVG + PNG); favicon set; manifest
- [x] Tokens (dark + light), Tailwind 4 theme, fonts self-hosted
- [x] Ferrofluid WebGL renderer + SVG fallback
- [x] Shared components (button, switch, field, segmented, badge, dialog, toasts, empty state)

## 3. API package
- [x] Types for every route and frame in API.md
- [x] Client with friendly errors, 503 retry, offline detection
- [x] Reconnecting socket, live socket batching, overlay frame parser
- [x] TS ports of template, money, alert select/render, queue
- [x] Demo engine (all routes, live + overlay sockets, faults, autoplay)
- [x] Unit tests (negative cases included)

## 4. Overlays
- [x] Page boots from `/o/<token>/`, one socket, snapshot first, hello since_seq
- [x] Widgets: alerts (queue, sounds, acks, layouts), chat, events, goal, label, viewers
- [x] Five themes (molten, daylight, arcade, minimal, sticker); text only through textContent; reduced motion; OBS visibility pause
- [x] `?test` and `?demo`; 1920×1080 transparent
- [x] Unit tests (hostile text, malformed frames, reconnect, duplicates) and Playwright

## 5. Dashboard
- [x] Shell: nav, live status strip, panic button, theme, mobile layout
- [x] First run: connect accounts, pick a look, Add to OBS
- [x] Home, Chat, Alerts, Overlays, Moderation, Bot, Tips, Settings
- [x] Error states for every documented status; offline engine
- [x] Playwright: flows, errors, 375 px, keyboard, axe

## 6. Site
- [x] Astro pages with full SEO (titles, canonical, OG/Twitter, JSON-LD, sitemap, robots)
- [x] Home, features, download, pricing, compare, FAQ, docs/getting-started, terms, privacy, refunds, contact
- [x] Generated OG images; Playwright SEO + links + 375 px

## 7. Videos
- [x] Remotion: hero loop, alert fires, one ban every platform, setup in 3 clicks
- [x] Render WebM/MP4 + posters into the site

## 8. Polish
- [x] web-design-guidelines review, break-ui pass, screenshots
- [x] CodeRabbit (or manual) review of every batch

## 9. After 1.4.2 (owner asked, 22 Oct 2026)
One Cloudflare Pages project and one address for the website and the web dashboard
(site at `/`, dashboard at `/app`), from this same repo. `remote.clearcraftlabs.com` is then
**deleted, not forwarded**: one link only.
- [ ] Design board first, owner approves before building
- [ ] The browser talks to the relay's API address directly (no Cloudflare Worker in between: its free plan stops at ~100k requests a day). Same site (`*.clearcraftlabs.com`), so the session cookie still works with CORS on the relay
- [ ] Move every service that uses `remote.clearcraftlabs.com` (checked 22 Oct):
  - [ ] Relay config `RELAY_REMOTE_URL` (deploy-relay.sh, relay.env.example, deploy/README): it sets the web origin for accounts, phones and Origin checks
  - [ ] Sign-in pages `/login`, `/login/link` (the email sign-in link), `/login/google/callback`: new address in the relay and in **Google Cloud's OAuth redirect URIs** (owner click)
  - [ ] Emails: the sign-in link and the weekly report's Open History use the web origin; send a test of each after the move
  - [ ] Phone pairing links and QR codes (`/app/#pair=…`, packages/api remote.ts, demo)
  - [ ] Phone API `/r/…`
  - [ ] Cloudflare Tunnel public hostname and its DNS record: delete only after everything above is live (owner click)
  - [ ] Website links: `dashboard.astro`, `docs/getting-started.astro`
  - [ ] Docs: ACCOUNTS.md, API.md, GOOGLE-VERIFICATION.md, plan/PRO.md, STATUS.md
  - [ ] Google verification: the submitted demo shows `remote.clearcraftlabs.com/app`; don't break it while the review is open, and tell Google the new address if asked
- [ ] Before the switch, the small step: an "Open dashboard" button in the site header

## 10. Later (not started)
- [ ] In-app unsaved-changes guard for the alert and layout editors (today: a browser `beforeunload` warning only)
- [ ] Goals screen of its own (today: created from the goal widget in the layout editor)
- [ ] Release or drop held messages once the engine has R16
- [ ] Wire `@remotion/player` on the site if an interactive demo earns its weight
