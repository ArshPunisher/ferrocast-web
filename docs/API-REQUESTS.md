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
                  update_channel: "stable" | "beta"; never_update_while_live: boolean;
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

`GET /api/v1/themes` → `{ id, name, description, pro: boolean }[]`. The overlay bundle ships five free themes: **`molten`** (default, same id the engine's presets use), `daylight`, `arcade`, `minimal`, `sticker`. Widget configs reference them by `theme` id. Unknown ids fall back to `molten`.

## R9. Updates

`GET /api/v1/updates` → `{ current: string; latest: string | null; channel: "stable" | "beta"; blocked_while_live: boolean; notes_url: string | null }`. The dashboard never offers "Update now" while `blocked_while_live` (R-60).

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

