# Ferrocast design system

## Read

Product site and companion app for gaming streamers who distrust cloud vendors, in a dark-first **liquid-metal** language: off-black surfaces, chrome highlights and the two colours of the **X1 Spark** mark, Molten and Arc. Premium and calm, never "gamer RGB", never generic SaaS.

Dials (taste skill): site 7 / 6 / 4 (variance / motion / density); dashboard 4 / 4 / 6; overlays 3 / 5 / n/a (they sit on top of a game and must stay light).

## The motif

**X1 Spark**: cast metal throwing a spark. Ferro = iron, cast = broadcast; the liquid f is the molten metal, the split shard is the spark leaving it, hot (Molten) on top and electric (Arc) below. It appears as:

- the **logo** and every brand file (below).
- the **alert flourish** on the overlays: the Spark mark's f climbs out of the card's top edge and the two halves of the shard drop in; the card's bottom edge is Molten.
- **`SparkMark`** in empty states and loading.

The ferrofluid from the first brand round stays as a quiet backdrop, not as the identity: the **WebGL scene** (`packages/ui/src/ferro/`, site hero, first-run screen, video renders; Arc rim light; pauses off screen, adapts resolution, one still frame under reduced motion) and **`FerroSpikes`**, its SVG fallback without WebGL.

## The logo

**Spark**: a liquid lowercase f (ferro, cast metal) throwing a lightning shard that is split along its own diagonal. Geometry and the outlined wordmark live in `packages/ui/src/brand.ts`; every brand file (mark, lockups, app icons, tray icon, favicons) is generated from it by `brand/build.mjs`.

- The f is ink (`currentColor`). The shard's upper half is **molten amber**, the lower half **arc cyan**: `--fc-brand-molten` / `--fc-brand-arc` (dark `#ffa424` / `#33d4ff`, light `#cf7400` / `#0888b8`). The UI uses the same two colours (see Colour); the `--fc-brand-*` tokens stay the logo's own source.
- The wordmark is Bricolage Grotesque 700, outlined and hand-kerned. The o carries a live dot (molten) set into a notch on its shoulder.
- The heavier small-size drawing (thicker f, one unsplit shard) is for the favicons, the tray icon, the 16 to 64 px app icons, the mono `FerroGlyph`, and `LogoMark` at 20 px and below. The colour `LogoMark` keeps the split two-colour shard from 21 px up (the Wordmark uses 22 and 26 px).
- Components: `LogoMark`, `Wordmark` (mark + outlined text), `WordmarkText`, `FerroGlyph` (mono), `SparkMark` (empty states and loading: the f settles and the two halves of the shard land once; still under reduced motion).

## Colour

Two brand colours from the X1 Spark mark, each with one job. Not Hookline orange-red, not Twitch purple, not Kick green, not YouTube red.

- **Molten** (amber) is the **primary action**: filled primary buttons (one per view where possible), progress and meter fills, range inputs. Filled Molten always carries **dark text** (`--fc-on-accent`); white on Molten fails AA.
- **Arc** (cyan) is **interactive state and information**: links, icons, focus rings, the on state of switches (`--fc-arc` track), selected rows and cards (`--fc-accent-soft` + `--fc-accent-line`), info notes, the accent `Badge`, text selection.
- Bright values (`--fc-accent`, `--fc-arc`) are for fills and graphics. Anything set as text uses a `-text` token, which is deeper on off-white.
- **Warning amber is not Molten.** On dark they sit close (OKLab distance 0.047), so they never share a treatment: warnings are amber *text* on `--fc-warn-soft` with an icon or label, Molten is a *solid fill* on an action and never signals state. Never colour a warning with Molten or an action with warn.

| Token | Dark | Light (off-white) | Use |
|---|---|---|---|
| `--fc-bg` | `#0a0b0d` | `#f2f3f6` | page |
| `--fc-surface-1/2/3` | `#101216` / `#16191e` / `#1d2127` | `#fff` / `#f7f8fa` / `#eceef2` | panels, raised, controls |
| `--fc-line` / `-strong` | `#252a31` / `#343a44` | `#dfe2e8` / `#c9ced7` | hairlines |
| `--fc-text` / `-2` / `-3` | `#eef0f4` / `#b3b9c4` / `#8a919d` | `#0e1014` / `#424854` / `#5f6672` | text (all AA) |
| `--fc-accent` | `#ffa424` | `#cf7400` | Molten fill (primary buttons, bars) |
| `--fc-accent-strong` | `#ffb547` | `#e08a1a` | hover of a Molten fill |
| `--fc-on-accent` | `#120a00` | `#0a0600` | text on Molten (9.9:1 / 5.9:1) |
| `--fc-molten-text` | `#ffa424` | `#9a5400` | Molten set as text (8.2:1+ / 4.96:1+) |
| `--fc-arc` | `#33d4ff` | `#0888b8` | Arc fills and graphics (switch on, guides) |
| `--fc-accent-text` | `#33d4ff` | `#05678c` | Arc text: links, icons, focus ring (7.2:1+ / 4.85:1+) |
| `--fc-accent-soft` / `-line` | Arc at 12% / 40% | Arc at 10% / 38% | selected and info backgrounds / borders |
| `--fc-brand-molten` / `-arc` | `#ffa424` / `#33d4ff` | `#cf7400` / `#0888b8` | the logo |
| `--fc-ok / warn / danger` | green / amber / red | darker variants | real state only |
| `--fc-twitch / youtube / kick` | brand-ish | darker for light | small platform marks only |

Contrast rule: every text pair 4.5:1, focus rings and UI parts 3:1, in both themes (the light values also cover the system-light block). Check new pairs before shipping; the ratios above are against every surface from `--fc-bg` to `--fc-surface-3`, including text on `--fc-accent-soft`.

Overlays carry their own copy of the palette (`--ov-*` in `overlay.css`, `--al-*` in `alert.css`) because they render inside OBS without the dashboard's tokens: Molten for fills and the alert card edge, Arc for names, mentions and status text (`#05678c` on the white Daylight and Sticker cards), Arcade's offset shadow in Arc, Sticker's in Molten.

No pure black or white surfaces. Status dots only for real state (connection health, live).

## Type

- Display: **Bricolage Grotesque** (variable), tight tracking (-0.02 to -0.035em), weights 600-800.
- UI and body: **Hanken Grotesk** (variable).
- Numbers, codes, URLs: **JetBrains Mono**, tabular.
- Self-hosted via Fontsource (no font CDN: the desktop app works offline).

## Shape

Controls (buttons, inputs) **10 px**, panels and cards **16 px**, chips, switches and badges **fully round**. Nothing else.

## Motion

- Ease out `cubic-bezier(0.22, 1, 0.36, 1)`; drawers `cubic-bezier(0.32, 0.72, 0, 1)`. UI transitions 120-320 ms.
- Press: `scale(0.97)`. Dialogs scale from 0.96 + fade. Toasts rise 12 px. Lists use layout animation for reorder.
- Alerts on the overlay (default theme `molten`): enter 450-600 ms with a liquid "rise" (scale-y from the bottom + spike flourish), hold, exit 300 ms.
- Only `transform` and `opacity`. No heavy blur (WebKitGTK, OBS on Linux). No infinite CSS animation by default (R-38). `prefers-reduced-motion` turns movement into fades.

## Voice

Plain, warm, specific. Say what happened and what to do. Never lead with "AI" (call it smart filters), never upsell to the audience, mark Pro calmly with an outline chip. "Your legal name stays off your tip page and alerts" for tips (the payment provider's own receipt may still show it). No em dashes in UI copy.
