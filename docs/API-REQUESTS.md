# API requests for the engine

Things the dashboard and overlays need that `ferrocast/docs/API.md` doesn't define yet. The demo engine (`packages/api/src/demo/engine.ts`) already implements each one exactly as proposed here, and the types live in `packages/api/src/types.ts`, so the engine can copy the shapes.

Status: R1–R19 are **done** in the engine (17 Oct 2026); `docs/API.md` there is the contract now, and `packages/api/test/contract.test.ts` checks a real engine against the demo's shapes. Differences from the proposals:

- R4: `amount` reads "₹500" (no trailing zeros), and pending items keep their sender even for test events.
- R5: Settings also has `currency` (the main currency, from the computer's region by default); TTS `min_amount` is in it, and `GET /tts` echoes it as `currency`.
- R3/R17: the default panic hotkey is `Ctrl+Alt+Shift+P` (a global Cmd/Ctrl+Shift+P would take a browser and editor shortcut); the dashboard's own shortcut matches.
- R11: `resync.missed` is `0` when the count is unknown; `hello.seq` equals `since` while replaying. Seqs start from the clock and only grow.
- R12: the preview snapshot has no real chat, events or labels.
- R19: reclaiming your own name after a take-down no longer counts as a name change.
- OBS `version` is the bare number ("31.1.2").

## R1. Shared ban list entry

`GET /api/v1/mod/bans` → `BanEntry[]`

```ts
type BanEntry = { platform: "twitch" | "youtube" | "kick"; user_id: string; login: string; display_name: string;
                  reason: string | null; banned_at: number; everywhere: boolean; by: string | null }
```

Newest first. `POST /api/v1/mod/unban` returns 404 when the person isn't on the list.

## R2. Moderation filters shape

`GET / PUT /api/v1/mod/filters`

```ts
type FilterAction = "delete" | "timeout" | "ban" | "hold"
type Filters = {
  words: { enabled: boolean; list: string[]; lookalikes: boolean; action: FilterAction }
  links: { enabled: boolean; allow_roles: number /* Roles bits */; allow_domains: string[]; action: FilterAction }
  caps: { enabled: boolean; min_length: number; max_percent: number; action: FilterAction }
  emotes: { enabled: boolean; max: number; action: FilterAction }
  symbols: { enabled: boolean; max_percent: number; action: FilterAction }
  solicitation: { enabled: boolean; action: FilterAction }   // "I do commissions / buy followers" (Reddit #2 pain)
  timeout_seconds: number                                      // 1 … 1 209 600
  exempt_roles: number                                         // Roles bits never filtered
}
```

400 `invalid` names the field (`"timeout_seconds: must be between 1 second and 14 days."`).

## R3. Panic mode plan

`GET / PUT /api/v1/mod/panic/config`

```ts
type PanicConfig = { followers_only: boolean; followers_only_minutes: number; emote_only: boolean;
                     slow_mode_seconds: number; hold_new_accounts: boolean; pause_alerts: boolean;
                     pause_tts: boolean; hotkey: string /* "Ctrl+Shift+P" */ }
```

`POST /api/v1/mod/panic` also sends a live `notice` (`warn` when on, `info` when off) so every open dashboard shows the state.

## R4. Pending TTS item

`GET /api/v1/tts/pending` and the live `tts_pending` frame carry:

```ts
type TtsPending = { id: string; event_id: string; platform: Platform; name: string; text: string;
                    amount: string | null /* display string, "₹500" */; received_at: number }
```

A mod deleting the source message removes the item (R-48).

## R5. Settings shape

`GET / PUT /api/v1/settings`

```ts
type Settings = { theme: "system" | "dark" | "light"; reduced_motion: "system" | "on" | "off";
                  low_motion_overlays: boolean /* R-40 Linux preset */; lan_access: boolean;
                  never_update_while_live: boolean;
                  launch_at_login: boolean; close_to_tray: boolean; language: string }
```

## R6. Viewer card

`GET /api/v1/viewers/{platform}/{user_id}` → 

```ts
type ViewerCard = { platform; user_id; login; display_name; avatar_url: string | null; roles: number;
                    first_seen: number | null; messages: number; follows_since: number | null; note: string;
                    banned: boolean; timeouts: number; other_identities: { platform; login }[] }
```

404 `viewer_not_found` when we have never seen them.

## R7. Session stats for Home

`GET /api/v1/stats/session` →

```ts
type SessionStats = { started_at: number | null; follows: number; subs: number; tips: Money[] /* one per currency */;
                      bits: number; messages: number; peak_viewers: number; viewers: { twitch?: number; youtube?: number; kick?: number } }
```

## R8. Themes ("pick a look")

`GET /api/v1/themes` → `{ id, name, description, pro: boolean }[]` (`pro` is always false: every built-in look is free). The overlay bundle ships five free themes: **`molten`** (default, same id the engine's presets use), `daylight`, `arcade`, `minimal`, `sticker`. Widget configs reference them by `theme` id. Unknown ids fall back to `molten`.

## R9. Updates

`GET /api/v1/updates` → `{ current: string; latest: string | null; channel: "stable" | "beta" /* read-only, from the build version */; blocked_while_live: boolean; notes_url: string | null }`. The dashboard never offers "Update now" while `blocked_while_live` (R-60).

## R10. Finish first run

`POST /api/v1/setup/complete` → 204. Sets `status.setup_done = true` so the dashboard stops showing onboarding. (Alternative: a `setup_done` field in Settings.)

## R11. Live socket resume (API.md now has `resync`; this asks for the replay half)

`GET /api/v1/live?session=<token>&since=<seq>`: optional `since`. When present the server replays events with `seq > since` (bounded, e.g. last 500) before live frames, so a dashboard that reconnects after a blip doesn't miss chat. The client already drops duplicate event ids.

## R12. Overlay test-mode socket

The overlay page opened as `/o/<token>/?test` connects to `/o/<token>/ws?test`. The server then sends sample `alert` and `event` frames for that socket only (every ~6 s), never touching the real queue. Test alerts from `POST /api/v1/test` are not sent to sockets in test mode.

## R13. Media in `RenderedAlert` (resolved differently)

API.md now sends media **ids** (including `tts_audio`). The overlay resolves a bare id to `media/<id>` next to the page and still accepts URLs, so either works. Original proposal:

`RenderedAlert.sound` / `image` on the **overlay socket** should be URLs relative to the overlay page (`media/<id>`), not media ids, so the overlay can play them without knowing the id scheme. On the dashboard API they stay ids.

## R14. Goal units

`Goal.current` and `Goal.target` are in **major units** for `tips` goals (₹3,450 = `3450`), with `currency` set. Proposed so overlays and the dashboard format them without a second lookup.

## R15. Live `notice` for connector trouble

When a connector goes to `sign_in_needed` or `scopes_missing`, send one `notice` with `action: { label: "Reconnect", href: "#/settings/accounts" }` (R-22: one clear banner, never a stream of errors).

## R16. Release or drop a held message

API.md §5 sends `held { event_id, reason }` when the chat filter holds a message, but there is no route to act on it. Proposed:

- `POST /api/v1/mod/held/{event_id}/release` → 204: post it to chat as if it passed the filter.
- `POST /api/v1/mod/held/{event_id}/drop` → 204: discard it (the dashboard also offers ban / time out on the author).
- 404 `held_not_found` when it was already handled (another mod got there first).

Until then the dashboard shows held messages with Delete, Time out and Ban only.

## R17. `held` and `panic` details the dashboard relies on

- `panic.plan` is the `PanicConfig` from R3, so every open dashboard shows the same switches.
- The held message itself still arrives as a normal `event` frame first (so the dashboard can show its text), and never reaches overlays.

## R18. Close unknown overlay sockets with 4404

When `/o/<token>/ws` is opened with a token the engine doesn't know (the URL was regenerated or the overlay deleted while the page was offline, so it never got the `revoked` frame), close the WebSocket with code **4404** (or 4401 for "not allowed"). The overlay page treats either code like `revoked`: it clears itself and stops reconnecting, instead of knocking forever.


## R19. Tips: take the page down, and API.md's tips section

The engine and relay already save tip pages (`PUT /api/v1/tips` → relay `PUT /v1/tips/config`), and the relay has `DELETE /v1/tips/config`, but the engine has no route for it. Proposed:

- `DELETE /api/v1/tips` → 204: calls the relay's delete and clears the saved `tips` setting, so `GET /api/v1/tips` returns the empty shape again (`page_url: null, webhooks: null`, providers null). The name stays held for this install for 30 days (the relay already does this).
- 422 `unavailable` when the build has no relay, like the save.
- Worth a look on the relay side: taking your own name back after a take-down counts as one of the 3 name changes a day (`set_tip_config` sees no current page, so any name is "new"). The demo copies this; consider not counting a name that is held for the same install.

API.md §Tips still lists the old placeholder shape (`enabled, currency, min_amount, providers`). The dashboard follows what the server really sends (`handle, display_name, message, page_url, webhooks, razorpay|kofi|stripe: { page_url, page_id, test_mode, has_secret } | null`; see `packages/api/src/types.ts`). Please update API.md to match.

## R20. Richer scene layers (the design library)

The built-in design library uses a few **optional** fields on `layer` widget configs. The
engine already passes unknown layer fields through (`core::layer::validate` ignores them), so
nothing breaks today; please add the same checks the web side makes
(`packages/api/src/design.ts` `validateLayer`, same messages):

- `shape`: `clip` one of chevron, arrow, hexagon, octagon, diamond, star, burst, ticket,
  ribbon, tag, parallelogram, cut, shield, wave, torn, cloud, blob, heart, drop, leaf, moon,
  bolt, pennant, trapezoid, steps, sparkle, cross, bat; `pattern` one of dots, grid, lines,
  scanlines, stripes, checker, halftone, waves, zigzag, rays, rings, paper, perspective,
  blinds, stars, sparkles, confetti, bokeh, snow, embers, rain, petals, leaves, lights,
  bubbles, fireflies, pixels, eq, shimmer; `pattern_scale` 0.25 to 4; `shadow` none, soft,
  hard, glow.
- `frame` / `webcam`: `variant` one of hud, sketch, tube, pixel, film, polaroid, gold, tape,
  chevron, holo, vhs, circle, bulbs, stitch, brush, deco.
- `text`: `effect` one of gradient, chrome, neon, extrude, outline, glitch, sticker, marker,
  long_shadow, stamp; `color2` a colour; `split` letters or words; `rotate` up to 8 strings
  of up to 80 characters; `rotate_s` 2 to 60; `countdown` 1 to 86400 (seconds);
  `countdown_done` up to 80 characters.

The overlay ignores any value it doesn't know, and never passes one to CSS.


## Level meters: raw peaks, pushed (requested 21 Nov)

`POST /studio/engine/levels` answers with the highest peak over the last ~300 ms, so even at 30 requests a second the dashboard's bars move in 300 ms steps. Ask: a short window (about 33 ms) for `peak`, or a push of levels over the live WebSocket at 30 Hz, so the dashboard can draw attack and release itself. The dashboard already polls at ~30 Hz and animates between samples.

Status 21 Nov: the engine now takes an optional `window: "fast"` (about 43 ms) on `POST /studio/engine/levels`, answered off the Studio queue; the dashboard sends it. A push over the WebSocket is still open.

## Preview guides in the native picture (21 Nov)

The dashboard draws the safe areas (EBU R95 93% and 90%), the centre cross and the "hide what runs past the canvas" mask as page elements marked `data-over-preview`, so the app's existing holes leave its picture out under them and the page shows through. That keeps this dashboard-only, but it is unverified in the real app. If it does not look right there, the cleaner route is an optional `guides` field on the preview rect (`{ action, title, cross, hide_overflow }`) that the app draws itself; "show overflow even when the source is hidden" (OBS's third mode) needs the app in any case. Not requested yet.

## R12. Dashboard themes: `Settings.theme` takes ten ids (21 Nov)

The dashboard has ten looks (Settings, Appearance): `graphite`, `slate`, `moonlight`, `forest`,
`ember`, `obsidian` (dark) and `daylight`, `mist`, `linen`, `contrast` (light). `PUT /api/v1/settings`
today accepts only `system`, `dark` and `light` for `theme` (`crates/engine/src/state.rs`, `one_of`),
so choosing one of the ten is refused with 400.

Ask: accept `system`, `dark`, `light` and the ten ids. `dark` and `light` stay valid and mean
`slate` and `daylight`, so a saved setting keeps working; anything else is still a 400 naming
`theme`. Nothing else changes (the phone's remote page reads the same setting). The demo engine
(`packages/api/src/demo/engine.ts`) already takes and checks the same list.

## R13. Stripes over what runs past the canvas: `stripe` on the preview rect (21 Nov)

The owner picked Streamlabs-style stripes for the part of a source outside the canvas. The native
preview only draws the canvas, so the engine draws the stripes over each outlined source box's
outside part, in the page's `bg` and a second colour.

Ask (done on the engine side, branch `feat/overflow-stripes`): `PUT /api/v1/studio/engine/preview`
(and `program`, `vertical`) takes an optional `rect.stripe`, 0xRRGGBB like `bg`. With it, diagonal
stripes (`bg` and `stripe`, 18 points across) lie over the part of an outlined source that runs
past the canvas; without it the surround stays plain. The dashboard sends the theme's
`--fc-stage-b` as `stripe` next to `bg`. 400 for a value over 0xFFFFFF.


## R21. Mini Feed: queue mute, alert interrupt and look weights (22 Nov)

The Studio's events dock now has pause, skip, mute, filters, read marks and a test alert. Pause, skip and test already exist; the rest needs the engine (done on branch `feat/p1-minifeed-alerts`, see the engine's `docs/API.md` Alerts):

- `GET /api/v1/queue` gains `muted: boolean` (saved with the queue, survives a restart).
- `POST /api/v1/queue/mute` and `/unmute` -> queue. A muted queue shows alerts without `sound`, `tts_text` and `tts_audio`.
- `AlertRule.interrupt: boolean` (default false): a new alert from the rule ends the playing one and shows at once; paused queues just queue it.
- `Variation.weight: number` (0 to 1000, default 1): among matching looks with the same top priority, picked by weight; 400 over 1000.

Read marks and the type filter are per browser (localStorage `fc-feed-read-v2` (by the engine's event number), `fc-feed-filter`), not engine state. The demo engine implements all of it (`persistQueue` keeps pause and mute over a reload in the dashboard's demo). A phone's owner role can call mute (the relay's audit log names it); the cloud `queue_op` has no mute and its queue frame always says `muted: false`.

## R22. Selective recording: `show` on an item, and three edit words (22 Nov)

Each source can be shown on the stream only (chat and alerts a clean recording leaves out), in the
recording only (a face camera the stream doesn't carry), or both. Roadmap Phase 2 #9.

Ask (done on the engine side, branch `feat/p2-selective-recording`):
- `GET /api/v1/studio/engine/scenes/{scene}/items` lists `show` on every item and every child of a
  group: `"both"` (the default, and what a collection from before had), `"stream"` or `"recording"`.
  The dashboard reads a missing `show` as both.
- `POST /api/v1/studio/engine/scenes/{scene}/items/{id}/edit` takes `{ do: "stream_only" }`,
  `{ do: "recording_only" }` and `{ do: "stream_and_recording" }`. An unknown word is a 400 as before.
  The choice is an undo step.
- A flag on a group covers its children as a whole; a child of a shown group keeps its own. It
  applies to the stream, the recording and the replay buffer's clips; the preview, Studio Mode,
  thumbnails and the virtual camera show every item. While no visible item differs the two are one
  picture, drawn once; once one does, a recording can't share the stream's encode (the encoder
  budget's `why_not_shared` says why), so it runs its own.

The demo engine has no Studio desk (the Studio engine needs the desktop app), so there is nothing
to simulate there; the page's behaviour is covered by `e2e/studio-selective-recording.spec.ts`
against mocked Studio endpoints.


## R23. Performance mode, hold-to-show/hide hotkeys and copy/paste across collections (22 Nov)

All done on the engine side (branch `feat/p1-perf-hotkeys-copy`, `docs/API.md` Studio). The dashboard uses:

- `GET` / `PUT /api/v1/studio/engine/preview/pause` `{ paused }` -> `{ paused }`: stops drawing the preview, Studio Mode's second picture and the vertical picture; never touches a stream, recording, replay buffer or virtual camera. The page reads it every ~2.5 s and when it is looked at again, because the hotkey actions `performance_mode`, `performance_mode_on` and `performance_mode_off` change it too.
- Hotkey actions `push_show:<scene>\n<source>`, `push_hide:`, `push_filter_on:<source>\n<filter>`, `push_filter_off:` (held keys; back as they were on release; never saved). The Shortcuts page lists them in "Hold to show or hide", "Hold a filter on or off" and "Performance".
- `GET` / `DELETE /studio/engine/clipboard`, `POST /studio/engine/clipboard/source` and `/filters`, `POST /studio/engine/clipboard/paste/source` and `/filters` (see the engine's API.md). An empty clipboard is a 404 `clipboard_empty`.

The demo engine answers all `/studio/engine/*` with 422 `studio_unavailable` like the engine without the desktop app, so these need no demo behaviour (a test lists them with the other Studio calls). Not done: bind fields for these keys in the item and filter settings (they are set on the Shortcuts page only).
