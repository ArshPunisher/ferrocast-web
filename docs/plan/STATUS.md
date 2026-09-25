# Status

## 18 Oct 2026 (design library)

- Built-in library grew from 14 to 87 designs: 14 full themes (five scenes each, every one with its own matching alert design), 33 alert designs, 32 widget designs (11 goals, 9 labels, 6 event lists, 6 chat boxes) and 8 small scene designs (3 social rotators, 3 countdowns, 2 now-playing cards). About a quarter is marked Pro. Seasonal and regional packs: Diwali, Halloween, Holi, winter, cricket.
- Overlay renderer: shape silhouettes, tiled and particle patterns, frame variants, text effects, per-letter entrances, a rotator and a countdown on text layers (API-REQUESTS R20; the engine passes the fields through, and its real-catalogue test passes). 22 OFL Google Fonts bundled locally, loaded only when used.
- Fixed on the way: frame rules beat look CSS (now scoped), styled chat boxes lost their text size, look CSS now freezes with the alert and never moves in low or reduced motion.
- Tests: library size, variety, tiny mark, no mark on copies, nothing opaque over a camera, clear middle in game, budgets; render tests for every scene design and the new layer options; bundled-font test. Dev preview page `apps/overlays/preview.html` for contact sheets.
- Not committed (owner to review).

## 18 Oct 2026 (Studio)

**Done:** Studio, the streamer tools (all free, on the streamer's PC): a Studio screen (Show, Stream info, OBS, Moments), Start show from Home in two clicks with a pre-flight and one-click fixes, the stream-info editor for Twitch, YouTube and Kick with presets and per-platform results, scene switching with Alt+1..9, clip that, BRB, OBS health warnings on Home, the Don't miss lane with a sound only the streamer hears, markers with CSV/TXT export (also in the recap), and counters, quotes and chat modules on the Bot page. `packages/api/src/studio.ts` (types and `studioApi`), the demo implements every route.

**Next:** the overlay label editor could offer `{count:name}` as a source; an overlay countdown widget for Starting Soon.

## 18 Oct 2026 (overlay design system, phase 1)

**Done**

- Designs (API.md §4 Designs): alert looks, themes (five scenes), scenes and widget styles. Types and a TS port of the model and checks in `packages/api/src/design.ts`; client methods; the demo engine implements every route, `.ferrodesign` files (fflate) and the branding check.
- Built-in catalogue `packages/designs` (one file per design + `registry.ts`): six structurally different alert designs (molten plate, neon sign, comic burst, glass card, pixel arcade, esports banner), two themes (Forge, Arcade night) with all five scenes, six widget designs (goal bar, segment goal, latest and top labels, event cards, chat bubbles). The overlay build writes `designs/catalog.json` for the engine. Guide: `docs/CONTRIBUTING-designs.md`.
- Overlays: design alert renderer (frames, layouts, media, fonts, colours, highlight, shadow, outline, in/out and per-letter text animations, text delay, built-in Web Audio sounds, reduced motion), the Spark only on branded designs (classic themes keep it; `al-spikes` class kept), `layer` widgets (image, text, shape, frame, webcam frame, brand mark), widget design styles, rotation/opacity/hidden.
- Dashboard: Designs gallery (Built-in / My designs, dropdown filters for kind, style, motion and price, search, Preview as chips, live tiles, Use, Duplicate & customise, export, delete; import cards: design file, StreamElements, asset pack, Find in OBS). Designer with Stage (A2) and Guided (A3) views over one draft, remembered per person; undo/redo; Send test alert with the design on screen and an amount. Theme, scene and widget designers. Overlay editor on a shared layout editor: layers panel (order, lock, hide), align, snapping to other layers, text/picture/shape/frame/webcam layers, undo/redo. Asset-pack importer with a review table.
- Tests: `docs/TESTING.md`; `tools/smoke.sh` (`@smoke`).

**Next**

- Google Fonts are named but not yet downloaded for offline use (they fall back to bundled faces).
- StreamElements overlay import and Find in OBS (replace widgets in place) are still to come; their cards explain that.

## 18 Oct 2026 (Pro status in Settings, beta downloads)

**Done**

- Settings › Pro (`components/pro.tsx`, `packages/api/src/pro.ts`): status in one sentence, Check again, Manage (relay's manage page in the browser), Restore ("Move Pro here" with the subscription id and checkout email), and the buy form only once the relay says Pro is on sale. Shows "Ferrocast Pro launches after version 1" until then. Demo engine: `demo/features/pro.ts` (restore with `sub_DemoPro00001`). E2E: `apps/dashboard/e2e/pro.spec.ts`.
- Site Download page: a "Try the beta" section with per-OS buttons from the newest GitHub prerelease (read at build time by `src/data/releases.ts`; `FERROCAST_RELEASES=off|<file.json>` for offline builds), the beta warning, install notes (macOS right-click › Open once, Windows SmartScreen › More info › Run anyway), checksums. Before the first beta it links to the releases page. Title and description now say beta. E2E: `apps/site/e2e/download.spec.ts`.

## 18 Oct 2026 (QA fixes)

**Done**

- Primary buttons: white text on a deeper Molten fill (`--fc-btn-primary` #b35900, hover #9e4f00, `--fc-on-btn-primary`): 4.83:1 and 5.88:1, the same in both themes, dashboard and site. The bright `--fc-accent` stays for graphics. A unit test checks the ratios.
- Held messages: Approve / Remove on the chat line, a "Held" filter in Chat and a "Held for review" panel in Moderation; the `held_resolved` frame clears other dashboards. Viewer card bans and account disconnects ask first. The layout editor asks Save / Discard / Stay on in-app navigation.
- Backups list their reason and version (daily, before an update or import…), "Back up now", restore says it finishes at the next start. Counts read "1 month", "1 minute", "1 viewer"; field errors are whole sentences. Starter `!socials` is off until it has links. Link filter wording matches its switches, plus "Hold a first message with a link".
- Smaller: viewer counts labelled in the top bar, first connect says "Connecting", skipping step 1 leaves it unticked, LAN switch and pairing link say when a restart is needed, the look preview scales as one picture on phones, Home chat keeps keyboard focus, `/api/v1/status` answers on dev/preview servers. Demo engine: scam filter follows its action, consistent first-time viewer cards, raids on Twitch and Kick, `!so` uses `{target_game_note}`.

**Known:** the site's `/privacy/` meta description is 169 characters (SEO test wants ≤160); untouched here.

## 18 Oct 2026 (owner fixes: keychain prompt, OBS auto-connect, panic notices)

**Done**

- Toasts replace by `key` (and identical toasts never stack a copy); panic, OBS and account toasts are keyed. Panic notices are never top banners: one toast with the latest state, the red "Panic on" button shows it while on. Other notices replace by `key` or identical words.
- OBS settings: the engine follows OBS's own settings by itself (`auto`), toasts say what really happened ("Saved, but OBS isn't connected yet."), the password field shows "Saved — type to replace" / "From OBS — type to replace", "Use these" only when typed details differ. The top OBS chip says "Connected" in words.
- Copy: no more "system keychain" claims; dashboard, privacy page, FAQ, features and getting-started say secrets are stored privately on this computer (keyring on Windows/Linux, a user-only file on macOS).

## 18 Oct 2026 (StreamElements and Streamlabs importers)

**Done**

- `packages/api`: importer types (`ImportPreview`, `ImportReport`, `PackImportReport`), client methods (`previewStreamElements`, `previewStreamlabs`, `applyImport`), 502 fallback copy, and a demo importer (`demo/features/importers.ts`) with a sample channel and the engine's error codes. The `.ferropack` report now matches the engine's real shape.
- Dashboard: Import screen at `#/import` (from Settings → Your data, and a link on the last first-run step): paste a token or pick files, preview with counts, clashes and skip reasons, keep or replace, import, report. Live region for progress, focus moves to each new step.
- Site: features, FAQ, pricing, home and the data page meta now say exactly what each importer brings over.

**Next**

- Deploy the site copy with the next site release.

## 17 Oct 2026 (site: owner's final picks, company facts)

**Done**

- Home banner: ClearCraft-style star field (`scripts/hero-field.ts`, three.js points) in the hero only; the points form the Spark, then burst into a field that tilts toward the cursor. The page-wide particles are gone.
- Opening on every home load (`scripts/intro.ts`): On air (dim page, tally lamp, Molten wash), Level check (headline read in behind a cursor, meter peaks) and Spark drop (the braid's chats flow out of the hub after the burst). Skips on any input; off under reduced motion; CSS failsafe.
- Section rail (`scripts/rail.ts`): Spark line on the right edge at 1280 px and up, Signal dial in the corner below that. Replaces the fader and the header meter.
- Braid strands end inside each platform icon; the hero's pause button only appears on keyboard focus.
- Big screens: `.container` grows to `clamp(1200px, 84vw, 1560px)` from 1440 px; the hero headline and braid grow with it.
- Header theme switch: System, Light, Dark (System forgets the saved choice).
- Download page: the 3D icon is replaced by Sparky (`Bot.astro`, `scripts/bot.ts`), a bot whose eyes follow the cursor and whose face reacts (excited over anything `data-bot-excite`).
- Company facts confirmed from the Udyam certificate (UDYAM-PB-01-0155844); proprietor, address, phone, jurisdiction and Udyam number now print on Contact, Terms and the footer. Billing and grievance mail use the existing hello@ and privacy@ forwards.
- Copy: removed the false PayPal claim; the StreamElements/Streamlabs importer is now described as coming, not shipped.

**Next**

- Deploy to Cloudflare Pages (`ferrocast-site`) and attach ferrocast.clearcraftlabs.com.

## 17 Oct 2026 (site 3D, owner's picks)

**Done** (uncommitted, not deployed)

- Hero braid kept; it is now the only place the strand motif appears. Removed the strand stations (alerts, chat lane, tips, local-first), the footer strands, the left strand rail and its mobile bar, and the old stacked alert cards.
- S3 Isometric Desk as the sticky story for Alerts, Merged chat and Tips (`Story.astro`, `Beat.astro`, `scripts/channel/desk.ts`): bevelled models, soft environment light, contact-shadow AO, the camera flies monitor, portrait screen, phone; the chair fades out of the close-ups. Phones get one small stage per beat.
- "One ban. Every platform." rebuilt as a live HTML demo (`BanPanel.astro`) in the app's dark look: spam lands in all three chats, one Ban everywhere click removes all three at once, a pill confirms. Pausable, loops only on screen, finished state under reduced motion.
- S2 Control Deck for Setup, hotkeys and panic mode (`deck.ts`); S1 Glass Studio on /features/ (`glass.ts`).
- Right-edge section fader (`Channel.astro`, `scripts/fader.ts`): notches are links with aria-current, the cap can be dragged; slim header meter below 1280 px. Margin backdrop (`scripts/backdrop.ts`): a few soft shapes in the gutters only, 1400 px and up.
- Still posters of every story beat in `public/media/story/` for no-WebGL browsers.

**Next**

- Owner review of the new home page and /features/; then commit in small pieces.

## 17 Oct 2026 (community features)

**Done**

- `packages/api`: types, client methods and demo-engine routes for loyalty points, polls, giveaways, first-time chatter marks (`chatter` live frame), the stream recap, Discord go-live settings, OBS auto-detect and the starter command pack. Each demo feature lives in its own file under `src/demo/features/`. `contract.test.ts` reads and saves the new routes and passes against a real engine.
- Dashboard: new **Community** screen (polls, giveaway, points leaderboard and earning settings, welcome for new faces), **Stream recap** (from Home), points on the viewer card, "First message ever" and "Back after N days" badges in chat, Discord in Settings, "Found OBS on this computer" in Settings, "Add starter commands" in Bot, poll and giveaway widgets in the overlay editor (samples until one is running).
- Overlays: `poll` and `giveaway` widgets in their own files and `styles/community.css` (text-only DOM, reduced-motion aware, live text for screen readers).

**Next**

- Browser tests (Playwright) for the Community and Recap screens.

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
