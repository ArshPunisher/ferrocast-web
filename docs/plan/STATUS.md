# Status

## 19 Oct 2026 (Pro M4: Ferrocast voices)
- Settings › Text-to-speech: the Voice picker (`components/tts-voices.tsx`, one block in `Settings.tsx`; the old "Studio voices" footnote is gone) lists "Ferrocast voices (Pro)" first (Hindi, then Indian English, then US English) above "On this computer", with a Preview button (plays a sample line through the engine's alert path), a "Backup voice" picker while a Ferrocast voice is picked, and a Ferrocast voices card with a quiet ProChip, "4,120 of 20,000 characters this month" + a meter + reset date, and warn notes for resting voices or the last fallback. Not Pro but on sale: the calm line + Settings › Pro. Light/dark, 375 px.
- `packages/api`: `tts-voices.ts` (types, `ttsVoicesApi`, `splitVoices`, `orderCloudVoices`, `cloudUsageLine`), `TtsVoice` gains `gender`/`family`; demo `features/tts-voices.ts` (Pro + feature gate, 402/404, previews count characters once per voice, chime audio, `setTtsVoices({ resting, used })`). The demo's fake "Aria (studio)" voice is gone. API.md §9.4.
- Tests: vitest `test/tts-voices.test.ts` (8), Playwright `e2e/tts-voices.spec.ts` (8 per project, chromium + mobile: hidden/on-sale line, 402, pick + backup + usage, preview counts, resting fallback, axe, 375 px x2); mobile `testMatch` gains `tts-voices`.

## 19 Oct 2026 (Pro M5: auto-replies, free)
- Bot page: "Auto-replies" section (`components/bot/autoreplies.tsx`, one line in `Bot.tsx`). Empty state with three starters ("discord" → link, "what game" → `{game}`, "hello" → welcome) that open the dialog prefilled; list in check order with on/off switch, move up/down, edit, delete with Undo. Dialog: match type segmented control (Has / Word / Starts with / Pattern), the words or pattern, reply with the Insert variable menu and a 500 counter, a live "Try it" (asks the engine, 220 ms debounce; "Matches" + what the bot says, or "No match", or the pattern error), "More" disclosure (name, platforms, who, cooldowns, live only, exact capitals). Errors land under their field (400/413/422 via `autoReplyError`). Light/dark, 375 px (actions wrap under the text on a phone).
- `packages/api`: `autoreplies.ts` (types, `autoRepliesApi`, `autoReplyError`, a TS port of the matching, starters), demo `features/autoreplies.ts` (same routes and statuses, answers demo chat, quiet in panic, loop guard). API.md §4 "Auto-replies".
- Tests: vitest `test/autoreplies.test.ts` (10), Playwright `e2e/autoreplies.spec.ts` (5 per project, chromium + mobile); `playwright.config.ts` mobile `testMatch` gains `autoreplies`.

## 19 Oct 2026 (Pro M3: cloud backups)
- Settings › Your data: "Cloud backups" (`components/cloud-backups.tsx`) in `ProPanel` (feature `backups`), one line added in `Settings.tsx`. Save-your-recovery-key step before the first upload (Download / Copy, "If you lose it, your backups are lost", a confirm checkbox), key status with passphrase add/change/remove, automatic toggle, Back up now with usage (of 7 / 250 MB), the list (This PC / Another PC, Automatic / By you) with Restore (confirm dialog; key or passphrase fields with inline errors for another PC's backup) and Delete. On a fresh install with backups from another PC: "Use your newest backup from another PC". Empty state "No cloud backups yet. They're encrypted on this PC before upload." Larger, bolder type than the rest of Settings; light/dark; 375 px.
- `packages/api`: `cloud-backups.ts` (types, `cloudBackupsApi`, helpers), demo `features/cloud-backups.ts` (402 without Pro, key-first, pruning, restore errors; `?cloud=empty|new-pc`, `setCloudBackups()`). API.md §9.3.
- Tests: vitest `test/cloud-backups.test.ts` (8), Playwright `e2e/cloud-backups.spec.ts` (9 per project, chromium + mobile: hidden/on-sale line, 402, key then back up, restore confirm, delete + passphrase, new PC, axe, 375 px). `playwright.config.ts` mobile `testMatch` gains `cloud-backups`.

## 19 Oct 2026 (Pro M2: tip page branding and goal page)
- Tips screen: "Branding" and "Goal page" sections in `ProPanelView` (feature `tip_brand`): colour pickers + hex fields with a live contrast note (the same fix the relay makes), avatar/banner upload with inline 413/415/422 reasons, a goal form (title, target, currency, end date) with progress, Copy link / Copy for OBS / Open. The preview (`components/tips/TipPreview.tsx`) draws the relay's palette, avatar, banner and goal card live.
- `packages/api`: `tip-brand.ts` (types, `tipBrandApi`, contrast helpers mirroring the relay, `majorToMinor`, checks), demo `features/tip-brand.ts` (402 without Pro, the relay's errors, counts the demo's tips); the demo passes raw `Blob` bodies through. API.md §9.2.
- Tests: vitest `test/tip-brand.test.ts` (12), Playwright `e2e/tip-brand.spec.ts` (8, chromium + mobile project, 375 px, axe, 402, offline, 413/415).
## 19 Oct 2026 (Pro M1: stream history)
- `#/history` (`screens/History.tsx`, `components/history/{charts,StreamTable}.tsx`): range chips (4 weeks, 3 months, 1 year), big numbers, a viewers line, streams per week, platform split, every stream (sticky first column, scrolls sideways on a phone), Export CSV. Plain SVG charts with titles, descriptions and screen-reader tables; light and dark; 375 px. Wrapped in ProPanel (`feature: 'history'`). Nav entry "History" only when the panel would show.
- `packages/api`: `history.ts` (types, `historyApi`, `weeklyTotals`, `historySummary`), demo `features/history.ts` (a seeded year of streams, 402 without Pro, the relay's range errors, CSV); `?history=empty` / `setHistoryEmpty()`.
- The demo-only `#/preview/pro` and `ProPreview.tsx` are gone; `e2e/pro-foundation.spec.ts` now checks the Pro panel on History. New `e2e/history.spec.ts` (also in the mobile project).

## 19 Oct 2026 (Pro M0: foundations)
- `packages/api`: `ProView` gains `features` (`ProFeatures`) and `quotas` (`ProQuota`), API.md §8/§9; `proPanelState()` decides hidden / calm line / open. The demo stays honest (off sale, no Pro, no features) with `?pro=open|active` and `?pro_features=on` (or `setPro()`) for tests.
- Dashboard: `components/pro/ProChip.tsx` (outline chip, named "Part of Ferrocast Pro") and `ProPanel.tsx` (hidden unless the feature exists and `active || sales_open`; one line "Runs on Ferrocast’s servers, part of Pro." + Settings › Pro link). Demo-only `#/preview/pro` shows them until M1 has a real Pro panel.
- Tests: vitest (api `pro.test.ts`, dashboard `components/pro/pro.test.tsx`), Playwright `e2e/pro-foundation.spec.ts` (chromium, webkit, mobile project, 375 px).

## 18 Oct 2026 (editors redesigned, QA pass, dashboard access)

- Owner picked two layouts from `../design/editor-options.html`: S1 Studio for the theme/scene/overlay editor (scenes rail, canvas on a dark stage with quick-add buttons, inspector for the selected layer with layers below; shapes get real names) and A1 Preview first for Alerts (events list, short sections, sticky preview, one Insert menu for variables).
- A full click-through QA pass fixed: menus running off-screen (Menu now shifts inside the window), the Import menu overlap, a slow theme sheet (thumbnails mount one per frame), featured cards (smaller, caption under the picture), the boxed design-name field, duplicate React keys, a doubled demo ban row, faded-but-clickable TTS options, the sidebar theme toggle disagreeing with Settings, and the dev-only theme-boot 404.
- Text: shorter copy on Settings, Tips, Moderation, Studio, Community and Import; field labels 13.5px semibold, hints 13px, inputs 14.5px, small text up half a step to a step; a disabled primary button is neutral.
- Open in browser (desktop sidebar) makes a pair link and the desktop hands it to the default browser. The site has a Dashboard page explaining this, and the download page's beta buttons live in the system cards.

## 18 Oct 2026 (every built-in design is free)

- Owner's call: every built-in design is free. The 26 designs marked Pro are now free (`pro` stays in the `Design` type because API.md has it, but the library always sets it false). Gone with it: the Pro chip on design cards, the theme sheet and the designer, the "Free only" filter, "(Pro)" in widget Look menus and "· Pro" on the overlay preview sheets. Settings › Pro is unchanged. The library test now asserts no built-in is Pro.

## 18 Oct 2026 (gallery, theme bundles, live test)

- Designs is now a store-like gallery: Themes, Alerts, Widgets and My designs tabs with counts; a Featured carousel of theme bundles that plays the real scenes; theme cards that say what's inside ("5 scenes + alerts"); a theme sheet to flip through every scene and the alert before "Use theme". Style chips and a motion menu replace the dropdowns; the import cards are one Import menu. Routes `#/designs`, `/alerts`, `/widgets`, `/mine`.
- Fourteen new theme bundles, each with its own alert (and widgets where needed): Lo-fi loft, Glitch district, Chrome bubble, Sakura bloom, Phosphor terminal, Floodlight, Pit wall, Brutal mono, Winter cabin, Tavern quest, Ocean depths, Tokyo neon, Clean studio and Café corner. The library is now 28 themes, 47 alerts and 50 widgets.
- Fixes from a real private YouTube stream: Kick's pill warns only while the relay link is down; a long name with no spaces wraps inside alert cards; a pairing link pasted into an open tab pairs.
- Overlay previews are marked decorative (`data-overlay-preview`, hidden from screen readers, excluded from the dashboard's contrast check; overlays are checked in their own package).

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
