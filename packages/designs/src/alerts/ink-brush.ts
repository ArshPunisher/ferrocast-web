// Ink brush: a ragged red brush stroke is swept in behind heavy italic capitals, a white
// sun disc holds the art. Bold and graphic. The Spark is a faint watermark in the stroke.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'ink-brush',
    name: 'Ink brush',
    description: 'A ragged red brush stroke swept in behind heavy italic capitals and a white sun.',
    style: 'bold',
    motion: 'lively',
  },
  {
    frame: 'none',
    layout: 'left',
    media_size: 140,
    font: font('Anton', 56, 400, { uppercase: true, italic: true, letter_spacing: 0.01 }),
    colors: colors('#ffffff', '#111111', '#d62828', '#ffffff', '#111111'),
    shadow: 'none',
    anim: motion('wipe', 'wipe', 'bounce', 600, 450, 250),
    sound: { ref: null, builtin: 'bass', volume: 65 },
    duration_ms: 6500,
    brand: 'watermark',
    css: css(
      '.f-none .fa-text{padding:24px 60px 26px 40px;background:#d62828;clip-path:polygon(2% 14%,9% 4%,30% 8%,52% 2%,78% 7%,97% 3%,100% 22%,96% 48%,100% 76%,94% 97%,70% 92%,44% 98%,20% 93%,3% 97%,0 70%,3% 44%)}',
      '.fa-title .hl{color:#111;background:#fff;padding:0 .12em;box-decoration-break:clone}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-style:normal;text-transform:none;font-weight:700;color:#fff}',
      '.fa-media{border-radius:50%;background:#fff;box-shadow:0 0 0 6px #111}',
      '.fa-emblem{background:#fff;color:#d62828}',
      '.fa-emblem svg{filter:none}',
    ),
  },
)
