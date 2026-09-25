# Adding built-in designs

Built-in designs ship inside Ferrocast: no server, no download. They live in
`packages/designs`, one file per design, and a registry lists them in gallery order. The
overlay build writes them to `dist/overlays/designs/catalog.json`, which the engine reads at
start (API.md §4 Designs).

## Steps

1. Write one file per design under `packages/designs/src/alerts/`, `themes/` or `widgets/`.
   Use the helpers in `src/kit.ts`:
   - `alertDesign(meta, look, perEvent?, extras?)`: one base look; every event gets its own
     words; `perEvent` changes a few events; `extras` adds conditional looks (a bigger tip).
   - `themeDesign(meta, scenes, alertDesign)` with `scene(key, name, layers)` and the layer
     helpers `text`, `shape`, `frame`, `webcam`, `widget`, `brand`.
   - `widgetDesign(meta, kind, size, config, style)`.
   - `sceneDesign(meta, name, size, layers)` for a small standalone scene (a social rotator,
     a countdown, a now-playing card) added as its own browser source; it shows with the
     widgets in the gallery when it is narrower than 1280 px.
   - Library helpers: `cut` (a shape cut to a silhouette), `pattern` (tiled patterns and
     particles), `fancyFrame` / `cam` (frame variants), `rotator`, `countdown`, `surround`
     (a background with a hole for the camera), `mat` (a see-through border round a cam),
     `enter` (entrance and loop), and `font`, `colors`, `motion`, `css` for alert looks.
2. Import it in `src/registry.ts` (append; never reorder or rename shipped ids).
3. Run `pnpm --filter @ferrocast/designs test` and `pnpm --filter @ferrocast/overlays test`.
   Every built-in must pass the engine's checks, and the render tests draw each one.
4. Look at it: `pnpm dev`, open Designs, hover the tile. Check dark and light, and 375 px.

## Rules

- **Ids** are `builtin.<slug>` (lowercase, digits, dashes) and never change once shipped:
  streamers' settings and overlays point at them.
- **The mark**: every built-in carries a small Ferrocast Spark, placed so it looks part of the
  design. Alerts set `brand` (`corner`, `divider`, `watermark`, `notch`, `badge`, `edge`); each
  theme scene has exactly one `brand(...)` layer; widget designs set `style.brand`. Vary the
  placement between designs. The streamer's copy (Duplicate & customise) never has it.
- **Different, not recoloured**: a new alert design should differ in structure (frame,
  layout, motion, text animation), not only in colour.
- **Fonts**: only bundled families (see the library rules below); Google Fonts and system
  names fall back to a bundled face when missing.
- **Art**: draw with frames, shapes and text where you can. Bundled pictures go under
  `apps/overlays/public/designs/assets/` and are referenced as `asset:<path>` (lowercase).
  No SVG, no scripts, no remote URLs (custom CSS may only use `data:image/…`).
- **Motion**: transform and opacity only; no infinite loops by default (R-38); everything
  must still read under reduced motion.
- **Copy**: plain, warm, specific. No em dashes. `pro: true` only for the paid catalogue.

## Richer layers (API-REQUESTS R20)

Scene layers take a few optional fields the engine passes through untouched:

- Shapes: `clip` (chevron, ticket, star, burst, heart, flame, bat, cloud, steps…),
  `pattern` drawn in `fill` over `fill2` (tiles: dots, grid, stripes, scanlines, halftone,
  rays, rings, paper, perspective, blinds…; particles: stars, sparkles, confetti, snow,
  embers, rain, petals, leaves, string lights, bubbles, fireflies, pixels, music bars,
  shimmer), `pattern_scale` and `shadow`. Particles drift and tiles roll only when the
  layer has a loop; never in low motion; paused while OBS hides the page.
- Frames and webcams: `variant` (hud, sketch, tube, pixel, film, polaroid, gold, tape,
  chevron, holo, vhs, circle, bulbs, stitch, brush, deco).
- Text: `effect` with `color2` (gradient, chrome, neon, extrude, outline, glitch, sticker,
  marker, long_shadow, stamp), `split: 'letters' | 'words'` for per-letter entrances,
  `rotate` + `rotate_s` (more lines shown in turn) and `countdown` (seconds, `{time}` in the
  text) with `countdown_done`.

## Rules for the library

- **Never cover the camera.** The overlay sits above the camera in OBS. In live scenes keep
  every webcam frame's middle clear: use `surround` for a background and `mat` for a border.
  The catalogue test fails on anything opaque over a cam.
- **Keep the middle of in-game scenes clear** for the game (the alert box may sit there).
- **Alert CSS draws its final state by default** and animates *from* somewhere else
  (`animation: x 1s both` with a `from {}` keyframe), so low motion and reduced motion show
  the finished look. No `infinite`; give loops a count.
- **Scope alert CSS to the frame** (`.f-none .fa-text`, `.f-plate .fa-media`, `.fa.f-pill`),
  or the frame's own rules win.
- **Budget:** at most 40 layers and 8 looping layers a scene, 4,000 characters of CSS a look,
  64 KB a design.
- **Fonts:** use the bundled families: Bricolage Grotesque, Hanken Grotesk, JetBrains Mono,
  and the open-licence (SIL OFL 1.1) design fonts in `apps/overlays/src/fonts/` (each with
  its `OFL.txt`): Anton, Audiowide, Baloo 2 (with Devanagari), Bangers, Bebas Neue, Caveat,
  Caveat Brush, Cinzel, Creepster, Fredoka, Monoton, Orbitron, Oswald, Pacifico, Playfair
  Display, Press Start 2P, Righteous, Russo One, Silkscreen, Space Grotesk, Teko (with
  Devanagari), VT323. They load only when a design uses them.
- **Look at it full size:** `pnpm --filter @ferrocast/overlays dev`, then open
  `/preview.html?sheet=themes` (also `alerts&event=tip`, `alert&id=…`, `widgets`, `scenes`,
  `theme&id=…`, `scene&id=…&key=…`; add `&lowmotion` or `&long` for worst cases).

## Future packs

Packs are just more files in the registry, shipped with an app update. A downloadable
catalogue later uses the same `catalog.json` format (`{ format: "ferrocast-designs",
version: 1, designs }`), so nothing about a design file changes.
