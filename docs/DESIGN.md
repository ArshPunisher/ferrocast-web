# Ferrocast design system

## Read

Product site and companion app for gaming streamers who distrust cloud vendors, in a dark-first **liquid-metal** language: glossy black ferrofluid, chrome highlights, one cobalt accent. Premium and calm, never "gamer RGB", never generic SaaS.

Dials (taste skill): site 7 / 6 / 4 (variance / motion / density); dashboard 4 / 4 / 6; overlays 3 / 5 / n/a (they sit on top of a game and must stay light).

## The motif

**Ferrofluid**: black liquid that rises into spikes under a magnet (the Rosensweig instability). Ferro = iron, cast = broadcast. It appears as:

- the **logo mark**: a puddle with five concave spikes reaching for a cobalt dot (the magnet). Geometry in `packages/ui/src/ferro/mark.ts`; every brand file is generated from it (`brand/build.mjs`).
- the **WebGL scene** (`packages/ui/src/ferro/`): a raymarched puddle whose spike field follows the pointer like a magnet. Site hero, first-run screen, video renders. Pauses off screen, adapts resolution, one still frame under reduced motion, SVG fallback without WebGL.
- **`FerroSpikes`**: the SVG mark whose spikes rise once (spring) when an empty state appears. Never loops.

## Colour

One accent: **cobalt** `#3461f5` (cobalt is, like iron, ferromagnetic). Not orange (Hookline), not Twitch purple, not Kick green, not YouTube red.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--fc-bg` | `#0a0b0d` | `#f2f3f6` | page |
| `--fc-surface-1/2/3` | `#101216` / `#16191e` / `#1d2127` | `#fff` / `#f7f8fa` / `#eceef2` | panels, raised, controls |
| `--fc-line` / `-strong` | `#252a31` / `#343a44` | `#dfe2e8` / `#c9ced7` | hairlines |
| `--fc-text` / `-2` / `-3` | `#eef0f4` / `#b3b9c4` / `#8a919d` | `#0e1014` / `#424854` / `#5f6672` | text (all AA) |
| `--fc-accent` | `#3461f5` | `#2e5be8` | fills with white text (AA) |
| `--fc-accent-text` | `#8eaaff` | `#2347c4` | links, icons, focus ring |
| `--fc-ok / warn / danger` | green / amber / red | darker variants | real state only |
| `--fc-twitch / youtube / kick` | brand-ish | darker for light | small platform marks only |

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
