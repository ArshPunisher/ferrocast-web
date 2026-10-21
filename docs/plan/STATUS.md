# Status

## 21 Oct 2026 (Pro 1.4: Insights, smart features, YouTube from the cloud)
- `packages/api`: `insights.ts` (supporters client, per-stream metrics, weekday × four-hour slots in the viewer's clock, the best slot, one currency for tips), `smart.ts` (smart moderation, replies, recap types and client), `history.ts` (`plan`, `keep_days`, `earliest`, `limited`, one stream's samples), `pro.ts` (`features.smart`), `account.ts` (YouTube from the cloud on the web host). Demo: free accounts keep 30 days, 403 `account_required` with neither, believable samples; `features/smart.ts` with seeded suggestions, approval, actions, recap and supporters.
- Dashboard: History is now **Insights** (free with an account, 30 days; Pro a year): stream by stream bars (viewers, follows, subs, chat, tips) with one stream's viewer curve, best times to stream (heat map), top supporters from the PC's own log, a calm Pro line only when a range goes past 30 days, a Sign in card without an account. Smart moderation panel (Moderation), smart replies (Bot, approve the facts first), written recap (Recap), YouTube from the cloud on the web Account page (connect, bot switch, quota, confirm before disconnect). Plans, Settings › Pro and the unlock list Pro's 1.4 features first. Never "AI" in the copy.
- Site: pricing lists Pro's 1.4 features and the free 30 days of insights; FAQ, terms and privacy (YouTube from the cloud, smart features and their processor, Limited Use, history retention) updated.
- Tests: `packages/api/test/insights.test.ts`, `e2e/smart.spec.ts`, more in `e2e/history.spec.ts`; `pro-foundation.spec.ts` now tests the Pro panel on smart moderation. Full dashboard and site e2e pass. Checked in Chromium at 1440 and 375 px, light and dark.

## 20 Oct 2026 (site SEO pass)
- Structured data: the home page's SoftwareApplication now lists the free app plus Pro monthly (₹199) and yearly (₹1,999) in INR with the pricing page, `sameAs` the GitHub repo, and always has `downloadUrl`; `softwareVersion` still comes from the newest stable release at build time (1.0.1 until 1.1.0 is published, then the next build picks it up).
- Sitemap: every URL has `lastmod`, the last commit to the page file or the data it renders (build time when git can't say).
- Footer: a ClearCraft Labs column (the studio, Fuselane, Hookline, TransformX), so the studio's sites link each other. clearcraftlabs.com got a Ferrocast page at /ferrocast/ the same day.
- Checked: titles, descriptions, canonicals, OG/Twitter, h1s and robots were already right (seo/links/mobile/a11y e2e pass). CodeRabbit: one finding (lastmod should follow data files), fixed.

## 20 Oct 2026 (updates you can see)
- Why the owner's 1.0.0 never showed an update: the engine found it, but the dashboard only read `/updates` once when Settings opened and said "is the latest" before the first check or after a failed one (engine STATUS has the full root cause).
- `packages/api`: `UpdateInfo` now matches API.md's `UpdateView` (new fields optional for older engines), `UpdateProblem`, `UpdateInstall`, the `update` live frame (shape checked in `live.ts`), `checkUpdates`, `restartForUpdate`, `/updates/*` denied to phones; the demo engine checks, "downloads" with progress, becomes ready and "restarts" (never while live).
- Dashboard: `lib/update.ts` (summary, notes parsed as plain text, bytes, "last checked", `useUpdateWatch` in the shell: load, every minute, on focus, on status/resync), the store's `update` slice. `components/update.tsx`: the sidebar item above Open in browser (and in the phone's More sheet) only when there's something to do (Update available, Downloading n%, Installing, Restart to finish, Update didn't install), one app-wide dialog with What's new, Update now, the progress bar, Restart to finish; disabled with a reason while live; phones say "Update from the streaming PC", the headless app links to the download page. Settings › Updates: Check for updates, last checked, the check's error with its hint, See what's new.
- Tests: `lib/update.test.ts`, `packages/api/test/updates.test.ts`, `e2e/update-flow.spec.ts` (desktop and 375 px, Chromium and WebKit). Checked by hand at 375 px in light and dark.

## 20 Oct 2026 (download feedback and thank-you panel)
- Owner's complaint: clicking Download gave no feedback. Every download on `/download/` (the three system buttons and the .deb/.rpm links) now shows "Starting download…" with a spinner inside the link at once, while the link's real href still downloads the file (no JS, middle-click and modified clicks are left to the browser; a second click while starting is ignored). About a second later the system cards give way to a "Thanks for downloading Ferrocast" panel: Sparky cheers (new `cheer` mood: wave, hop, spark burst; fades only under reduced motion; fired with a `bot:cheer` event, `Bot` takes an `id` so a page can show him twice), and the header Sparky steps away meanwhile. The panel lists the steps for that exact file (DMG and right-click › Open; installer and SmartScreen More info › Run anyway; `chmod +x` for the AppImage; `apt`/`dnf` for .deb/.rpm with the real file name), then "Read the setup guide" (getting started, Connect), "All downloads" (back to the cards, focus on the used link), "Download didn’t start? Try again" (the same file) and "Ask us" (contact; the site has no Discord). Focus moves to the panel heading and a status region announces "Starting your … download…" then "Download started.".
- No route or URL change: a pushState could cancel the download's own navigation in some browsers.
- Tests: `e2e/download-thanks.spec.ts` (each OS and both Linux packages: loader, the download event from the link's href, panel and steps, focus, back; Try again; modified and middle clicks; reduced motion with axe on the panel in both themes; 375 px fit). Release files are answered by a stub attachment, never fetched. `bot.spec.ts` and `download.spec.ts` now scope to the header Sparky and the cards. Checked with playwright-cli at 1440 and 375, light and dark.

## 20 Oct 2026 (the motion designer, from the approved motion board)
- `packages/api/src/motion.ts`: ids and names (11 entrances, 9 text effects, 9 exits, 7 idle loops, 8 particle choices, palettes, 9 spots, directions, 7 recipes), `DEFAULT_MOTION`/`motionOf` (1.0 looks read as defaults that change nothing), `springOf`, `motionPlan` (the one timing the timeline and the overlay share: spring lengths, speed, stagger, beat), `withMotionTiming`/`withAnimChange` (keep `in_ms`/`out_ms`/length honest; going back to a simple one restores 650/450), `applyRecipe`, `copyMotion`, `surpriseMotion`, `usualAmount`, port of `intensity_of`. `validateLook` checks the motion block like the engine. Types: `AlertIn`/`AlertOut`, `Motion`, `AlertDesignView.intensity`.
- Overlays: `design/motion-engine.ts` (the board's effects on WAAPI, one particle canvas per alert in `motion-fx.ts`, a pausable `Clock`, clean-ups when an alert leaves early), `impact-sound.ts` (synthesised hits: only with `impact_sounds` on and the alert's audio allowed, at the look's volume, no opening hit over the look's own sound), `motion-swatch.ts` (the designer's live tiles on the same engine). `alert.ts` wraps the card in punch/shake/position/idle layers (`.fa-pos[data-spot]`, middle = where 1.0 put it; a design's own `.fa` CSS still wins, now relative to the spot). 1.0 entrances/exits/text keep their keyframes; a 1.0 Typewriter has no cursor until the look gets motion. Reduced motion: short fades, sounds kept.
- Dashboard: `components/design/motion.tsx` replaces the Motion tab and the guided Motion card (Play alert in deep orange with white text, Surprise me, sound, Copy motion from…, tip-size test amounts; Recipes/Entrance/Text/Exit/While on screen/Particles with live swatches and Simple chips for the 1.0 ids; Feel, Impact, Placement with a screenshot backdrop (type/size errors in words, never uploaded), Sound with impact sounds, land on the beat and "Find your sound’s tempo" (`lib/tempo.ts`); guided Advanced keeps the timing sliders). Timeline: entrance/idle/exit lane, text lane, impact marker, "hit lands at" / "waits for the beat"; the 1.1 ids have no drag edges (Feel sets them).
- Tests: vitest `packages/api/test/motion.test.ts` (26), `apps/overlays/test/motion.test.ts` (61), `apps/dashboard/src/lib/tempo.test.ts` (9); Playwright `e2e/motion.spec.ts` (11). Checked in Chromium at 1440 and 375 px, light and dark. Review: CodeRabbit was at its free limit, so a strict manual review; its findings were fixed (early-exit clean-up, stale tempo result, beat on simple entrances, reduced-motion opening sound, plain tempo errors, CSS specificity, enum checks, focus ring).
- Known: Glow and plate-less Shimmer animate `filter` for the whole hold (main-thread paint in OBS); flash and vignette cover the 800×450 alert canvas, so their edge shows when the alert box isn't 16:9. Not yet seen in a real OBS browser source.

## 20 Oct 2026 (owner's design picks: Pro card, Pro feel, sounds)
- Settings › Pro (`components/pro.tsx`): the 1-pro-card board's option C with option A's first step. Plan (both prices side by side, "Save ₹389", "About ₹167 a month", the six Pro features), Receipts (email checked before sending), Review (a receipt), Pay opens Razorpay with `openExternal`, then the card asks again every 6 s for 15 min and on focus. Errors keep their message and hint; `invalid_email` goes back to step 2; `already_pro` refreshes. A `comp_` test grant never shows Manage; an ended one can buy or restore. "Already have Pro? Move it to this PC" stays. Demo: sells while on sale, `setPro({ paid })`, `setPro({ testGrant })`.
- Pro feel (2-pro-feel board, option B Seam): `lib/pro-status.ts` shares the status; `ProUnlock` plays once per subscription (Spark on a spring, molten sheen on "Pro", staggered list, Sparkle), then the sidebar seam (draws once), the seam on the active item, a chrome PRO mark, the account chip ("Pro, yearly") and Home's dismissable "Pro is on. Three things worth setting up" strip. Only when Pro is active; reduced motion fades. Demo `?pro=active` counts as already shown, `&unlock=1` plays it.
- Sounds (5-sounds board, option C): both sets plus Sparkle classic rendered from the board's Web Audio recipes (`apps/overlays/sounds/recipes.js`, `render.mjs`) to MP3s in `apps/overlays/src/design/sounds/` (17 files, ~400 KB, peak-limited, no tags). The overlay plays them as files (pausing with the alert like uploads); previews decode the same files. Old ids map: Chime → Glint, Coin → Tally, Whoosh → Lift, Boing → Droplet, Bass → Ember. Designer: grouped listbox (`SoundPicker`) that plays on arrow keys and a resting mouse, plus "Use suggested sounds". Alerts: rule sounds can be `builtin:<id>` (grouped select with a play button).
- Defaults (owner, 20 Oct): a new install's rules and a new design from scratch start with each event's suggested sound; saved rules and designs don't change. The demo's rules show the defaults (Channel points keeps the demo's own file).
- Tests: vitest `sounds.test.ts` (api, overlays), Pro card units, overlay runtime (`builtin:` rule sound); Playwright `pro-buy.spec.ts`, `sounds.spec.ts`, `pro.spec.ts` and `pro-foundation.spec.ts` updated. Screenshots 1440/375 light and dark in the session scratchpad.

## 20 Oct 2026 (1.0.0 bug fixes from the owner's Mac test)
- Web links: every link to the web goes through `lib/external.ts` (`openExternal`, `externalLink`): in the desktop window it navigates (the app's handler opens the default browser and keeps the dashboard), elsewhere a new tab; http(s) only. The app side (`on_new_window`) is ferrocast 7963096.
- Designer/Alerts previews load library files through `client.mediaUrl` (`lib/media-url.ts`): `Media.url` alone answers 401 on the real engine, so an uploaded picture never showed.
- Alerts page preview renders through the active alert design (pickLook + renderOnto) with a line naming it; design alerts are sized by layout size (`offsetWidth`), not the transformed box.
- Sound: previews show a sound toggle only when the alert makes a sound (`alertHasSound`); onboarding says alerts start silent. The designer replays after every change (`autoplay`), plays at once when unmuted, stops on mute; toggles call `unlockAudio()` in the click (WebKit).
- Designs: built-in look CSS is scoped to its own frame (`scopeCss`, `:where(.f-<frame>)`); Text over pins the art under the text and keeps the text plate; Glass gets a light pane for light plates (`plate-light`). Checked in Chromium for all 47 alert designs × 8 frames × 5 layouts (headline never covered, nothing outside the canvas). Known: dark-text designs on Text only (no plate) stay hard to read on dark games; existing copies made before this keep their unscoped CSS.
- Tests: vitest `external`, `media-url`, `scope` and three overlay design tests; `tools/check.sh` green (829 dashboard e2e).

## 19 Oct 2026 (Pro M12 review fixes)
- Bot page, YouTube row: "Check now" (with "While you’re offline, Ferrocast looks less often. Going live on Twitch or Kick wakes it.") while the cloud is on duty there and it isn't live; uses `connect {retry: true}`. The split duty line lists three platforms as "Twitch, Kick and YouTube" (`platformList`).
- Tests: vitest `platformList`; Playwright "YouTube on duty and offline offers Check now" and a 375 px case with light/dark screenshots; cloud-bot + remote-offline green on chromium + mobile.

## 19 Oct 2026 (Pro M12: YouTube cloud bot, beta)
- Bot page › "Keep the bot on when this PC is off": a YouTube row marked Beta. Not connected: "Connect YouTube" with a short note (sign in with the channel this PC is connected to; YouTube's daily budget may pause it until midnight Pacific). Connected: "Speaks as <channel>", the last reply, "Uses about N of 1,500 YouTube units today", the moderation opt-in (deletes any time, bans while live, 50 units each), Disconnect. Budget spent: "YouTube's daily limit for the cloud bot is used up; it's back at <time>" in the viewer's own clock (no Try again for it). Errors with hints (`youtube_not_linked`, `wrong_youtube_app`, `youtube_quota`, …). A relay without YouTube in `available` shows no row.
- `packages/api`: `cloud-bot.ts` (`youtube` platform, `CloudBotQuota`, `beta`, `limits.youtube_daily_units`, `cloudAvailable`, `quotaLine`, `quotaUsedUpLine`, `quotaBackLine`, `issueMessage`, YouTube hints), `remote.ts` `CloudModeration.youtube`, `types.ts`; demo: YouTube connect through Google, its units, `setCloudBot({ youtube: 'ready' | 'quota' | 'none', youtubeLinked })`; store memo key includes YouTube.
- Tests: vitest `cloud-bot.test.ts` (+4, one replaced), `remote*.test.ts` updated (336 passed); Playwright `cloud-bot.spec.ts` (+2 tests and a 375 px case) and `remote-offline.spec.ts` green on chromium + mobile (61 passed). Screenshots 1440/375 light+dark in the session scratchpad.

## 19 Oct 2026 (Pro M10: offline remote mode)
- Phone with the PC off and the cloud bot on: the limited dashboard opens at once (no gate). A warn banner "Your PC is off / Chat, bans and history still work." (owners: Pause bot with a confirm); Chat and Moderation (owners also History as a bottom tab); other screens open Chat. Chat: the cloud's lines, delete / time out / ban on that platform (no replies, viewer cards, held filter or events; "Sending messages needs your PC."). Moderation: "Moderate from chat" + what needs the PC. History on an owner's phone (online too) without Export. Modes switch in place on the relay's `remote` frame; cloud paused shows the gate, now bigger/bolder, with "Switch cloud bot on" for owners. Bot page: "Let the cloud bot moderate when this PC is off" per ready channel (Turn on re-runs the bot sign-in with the moderator scopes). Activity lines from the cloud say "while the PC was off".
- `packages/api`: `remote.ts` (`REMOTE_OFFLINE_ROUTES`, `remoteOfflineAllowed`, `remoteOfflineGuard`, `pcOfflineError`, `REMOTE_LIMITED_SCREENS`, `remoteMode`, `auditSource`, `RemoteMe.cloud/cloud_paused`, `OWNER_ALLOWED` + `GET /pro/history`), `FerroClient` `guard` option, `remote` frame type; demo `?remote=owner|mod&pc=off&cloud=on|paused`, `setRemoteCloud`, the opt-in in `features/cloud-bot.ts`.
- Tests: vitest `test/remote-offline.test.ts` (10), `store.test.ts` (+3), `remote.test.ts` and `weekly-email.test.ts` updated for the new frame fields and the history rule; Playwright `e2e/remote-offline.spec.ts` (10 per project, chromium + mobile, matched by the existing `remote` pattern) and `remote.spec.ts` + `cloud-bot.spec.ts` green (96 passed).

## 19 Oct 2026 (Pro M9: your own tip address)
- Tips: a "Your own address" Pro panel under Goal page (`components/tips/OwnAddress.tsx`, loaded in `screens/Tips.tsx` when `features.tip_domain`). No address: one field ("tips.yourchannel.com", checked before sending: apex, IP, wildcard, port/path, ours), Add address; then the hostname with a status badge and a three-step bar (DNS record → Certificate → Live), the exact CNAME as Type / Name / Target cells with Copy buttons (full name and "DNS only on Cloudflare" under it), an optional TXT record in a disclosure, what Cloudflare says, Check again with "Checked … ago", Remove address (confirm dialog); live: the link with Copy/Open and the goal link; lapsed: when it stops. Errors inline with message + hint. Light/dark, 375 px.
- `packages/api`: `tip-domain.ts` (types per API.md §9.2, `tipDomainApi`, `normaliseTipDomain`, `tipDomainProblem`, `tipDomainStep`), `ProFeatures.tip_domain`, `remote.ts` `OWNER_ALLOWED` gains `GET /pro/tips/domain`; demo `features/tip-domain.ts` (402, 503, 422 invalid/apex/no page, 409 limit/`taken.`, 429 after 10; each check moves pending → verifying → live; `setTipDomain({ hostname, status, advance, changesToday, lapsed })`).
- Tests: vitest `test/tip-domain.test.ts` (8); Playwright `e2e/tip-domain.spec.ts` (7 per project, chromium + mobile: hidden/on sale, add → pending → verifying → live → remove, taken + Cloudflare 502 inline, 402 + relay offline, lapsed, axe in two states, 375 px with a long name); mobile `testMatch` gains `tip-domain`; `tip-brand.spec.ts` still green. `test/weekly-email.test.ts` "owner phone" fails on M10's in-progress `remote.ts` change (not M9).

## 19 Oct 2026 (Pro M11: weekly email)
- `#/history`: a "Weekly email" section at the end of the history panel (`components/history/WeeklyEmail.tsx`, two lines in `screens/History.tsx`), shown when `features.weekly_email`. No address: "Your week, in your inbox", Email address field + Save (typos caught before sending, errors under the field with the hint); pending: "Check your inbox", the hint ("a•••@gmail.com"), until when the link works, Resend (same session) / Change address, quiet re-check every 10 s while visible; on: "Weekly email is on", the day and next date, Change address, Stop emails; paused (Brevo refused the address): "Emails paused", Use another address. Bigger, bolder headings; light/dark; 375 px.
- `packages/api`: `weekly-email.ts` (types per API.md §9.8, `weeklyEmailApi`, `looksLikeEmail`, `addressHint`), `ProFeatures.weekly_email`, `remote.ts` `OWNER_ALLOWED` gains `GET /pro/history/email`; demo `features/weekly-email.ts` (402, 503 without the feature, 422, 409 `already_on`, 429 after 3, `bounce@…` pauses, `setWeeklyEmail({ status, address, sentToday, confirm })`).
- Tests: vitest `test/weekly-email.test.ts` (8); Playwright `e2e/weekly-email.spec.ts` (7 per project, chromium + mobile, also green on webkit: save → pending → resend → on → stop, 409 + 429 inline, paused, 402, relay offline + mail_failed keeps the form, axe, 375 px in every state); mobile `testMatch` gains `weekly-email`.

## 19 Oct 2026 (Pro M7: 24/7 cloud bot, web half)
- Bot page: "Keep the bot on when this PC is off" (`components/bot/cloud-bot.tsx`, one line in `screens/Bot.tsx`) in `ProPanel` (feature `cloud_bot`). A status block says who answers ("Standing by" while this PC answers, "On duty since 21:40" when the cloud took over, "Off"), the last reply and the sync state, with the Cloud bot switch (off until a channel is ready, with the reason). Per platform: Twitch "Connect bot account" then "Allow it in your channel" (state `needs_channel`), Kick "Connect Kick" (409 `kick_not_linked` says to connect Kick in Accounts first), account names, Ready / One step left / Stopped chips, the platform's own error with its hint, Disconnect (confirm). The sign-in link opens from the streamer's own click (Open Twitch / Open Kick, Check again, re-checks on focus, 10 minutes). One Molten button per view. On an owner's phone the panel reads `/pro/bot` directly (the phone can't read `/pro`) and offers only the switch; a mod's phone doesn't show it.
- `packages/api`: `cloud-bot.ts` (types per API.md §9.7, `cloudBotApi`, `dutyLine`, `lastReplyLine`, `syncLine`, `cloudBotCanEnable`, `describeCloudBotError` with fallback hints for the cloud bot's codes); `remote.ts` gains `OWNER_ALLOWED` (`GET /pro/bot`, `PUT /pro/bot/enabled`, checked before `OWNER_DENIED`; the Rust copies must match); demo `features/cloud-bot.ts` (402 without Pro, Twitch ready and Kick unconnected, two-step Twitch connect, 422 `no_platform`, 503 YouTube, 404 unknown platform, `setCloudBot({ empty, onDuty, twitchError, kickLinked })`).
- Tests: vitest `test/cloud-bot.test.ts` (8) and `test/remote.test.ts` (+1, owner phone and `/pro/bot`); Playwright `e2e/cloud-bot.spec.ts` (12 per project, chromium + mobile: hidden/on-sale line, status and switch, cloud on duty, two-step Twitch + Kick + disconnect, `kick_not_linked`, Twitch revoked, relay unreachable + 402, owner phone, axe dark + light, 375 px x3); mobile `testMatch` gains `cloud-bot`.

## 19 Oct 2026 (Pro M6: dashboard from anywhere)
- Settings › Dashboard anywhere (`components/remote.tsx`, one line in `Settings.tsx`) in `ProPanel` (feature `remote`): Add my phone / Invite a mod (name first) open a QR code (`lib/qr.ts`, our own byte-mode level-M encoder for versions 1 to 10; no dependency: none was in package.json, and checked against jsQR outside the repo) with the link, Copy and a 10-minute countdown, closing by itself when the phone pairs; devices with Owner/Mod chips and Remove (confirm); "Phones can reach this PC right now"; latest changes from phones in words (`auditLabel`).
- Phone mode: `window.__FERROCAST__ = { api: "<origin>/r", remote: true }` from the relay; `boot.ts` pairs with `#pair=<code>` (`phoneApi`), keeps the device token in `localStorage` (`fc-remote`), asks `/r/v1/me`; gate screens "Pair this phone" and "Your streaming PC is off." (retries every 10 s). `RemoteStrip` on top ("Through Ferrocast's servers · PC online/offline", updated by the relay's `remote` live frame). Screens a role can't use are hidden: a mod gets Chat and Moderation only (no composer, events, filters, panic plan; other addresses open Chat), an owner's phone hides Import and the Accounts, OBS, Discord, Your data, Pro, Advanced settings. `FerroClient` no longer retries a 503 `pc_offline`.
- `packages/api`: `remote.ts` (types per API.md §9.5, `remoteApi`, `phoneApi`, `remoteAllowed`/`remoteLiveAllowed` ports of the PC's rules, `remoteScreenAllowed`, `auditLabel`), live frame `remote`; demo `features/remote.ts` (402 without Pro, 409 limits, `pairNewest()`), demo engine acting as a phone (`?remote=owner|mod`, `&pc=off`, `setRemotePc()`: 403 by role, 503 `pc_offline`, mod-filtered live frames).
- Tests: vitest `test/remote.test.ts` (12) and `src/lib/qr.test.ts` (4); Playwright `e2e/remote.spec.ts` (14 per project, chromium + mobile: hidden/on-sale line, devices + remove, QR link + auto-close, mod name + axe, 409 in words, mod phone strip and hidden screens, PC off and back, owner phone settings, 375 px, and the real phone page with mocked relay answers: unpaired, pair then PC off, used link, removed phone). `playwright.config.ts` mobile `testMatch` gains `remote`.

## 19 Oct 2026 (Pro M8: Ferrocast bot in Discord)
- Settings › Discord: "Ferrocast bot" (`components/discord-pro.tsx`) in `ProPanel` (feature `discord`) under the free webhook form, one line in `Settings.tsx`. Not connected: one line + Connect server (opens Discord's invite in the browser, Check again, re-checks on window focus). Connected: server name, "Members linked" count, go-live channel picker, "Post when I go live" switch, optional message above the post, rules list (add/edit/delete in a dialog: who gets it, platform, tier, YouTube level, minimum tip + currency, role picker with roles above Ferrocast's greyed out and the "Move Ferrocast's role above…" hint, keep days, 0 = keep), the viewer link with Copy link, Disconnect (confirm). The free form shows "The Ferrocast bot posts your go-live now, so this webhook stays quiet." when `pro_go_live` is true (refreshes on a window event). Light/dark, 375 px.
- `packages/api`: `discord-pro.ts` (types per API.md §9.6, `discordProApi`, `ruleWhat`/`ruleSummary`, `validateRuleDraft`, `parseAmount`/`formatMinor`), `DiscordSettings.pro_go_live`; demo `features/discord-pro.ts` (402 without Pro, connect then connected on the next look, 409/404/422/403 `missing_permission`, 10 rules, `setDiscordPro({ connected, discordDown })`); the free demo Discord reports `pro_go_live`.
- Tests: vitest `test/discord-pro.test.ts` (7), Playwright `e2e/discord-pro.spec.ts` (13 per project, chromium + mobile: hidden/on-sale line, connect + channel + go-live hand-over, rule add/edit/delete, missing permission, copy link, disconnect, relay unreachable + 402, Discord unreachable, axe dark + light, 375 px x3); mobile `testMatch` gains `discord-pro`.

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
