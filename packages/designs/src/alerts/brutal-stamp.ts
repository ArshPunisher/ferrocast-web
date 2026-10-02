// Brutal stamp: a block of paper slams in with a hard black offset shadow, a heavy rule on
// top, an index tag, the headline in huge Anton capitals and the name in signal orange.
// No glow, no gradient. The Spark is the small notch cut into the top rule.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'brutal-stamp',
    name: 'Brutal stamp',
    description: 'A paper block with a hard shadow, a heavy rule and huge capitals. One orange.',
    style: 'minimal',
    motion: 'still',
  },
  {
    frame: 'plate',
    layout: 'right',
    media_size: 110,
    font: font('Anton', 58, 400, { uppercase: true, letter_spacing: -0.005 }),
    colors: colors('#0a0a0a', '#ff3b00', '#f2f0eb', '#ff3b00', '#0a0a0a'),
    shadow: 'none',
    anim: motion('magnet', 'shrink', 'none', 420, 300, 120),
    sound: { ref: null, builtin: 'bass', volume: 60 },
    duration_ms: 6000,
    brand: 'notch',
    css: css(
      '.fa{gap:0;align-items:stretch}',
      '.f-plate .fa-text{background:#f2f0eb;border:4px solid #0a0a0a;border-top:14px solid #0a0a0a;border-radius:0;box-shadow:12px 12px 0 #0a0a0a;padding:34px 34px 20px;min-width:440px;text-align:left}',
      '.fa-text::before{content:"NEW / 01";position:absolute;left:0;top:-14px;padding:0 10px;font:700 12px/14px "JetBrains Mono Variable",monospace;letter-spacing:.2em;color:#ff3b00}',
      '.fa-title{line-height:1}',
      '.fa-body{font-family:"JetBrains Mono Variable",monospace;font-size:17px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#0a0a0a;opacity:1;border-top:2px solid #0a0a0a;padding-top:10px;margin-top:14px}',
      '.f-plate .fa-media{border-radius:0;height:auto;background:#0a0a0a;box-shadow:12px 12px 0 #ff3b00;border:4px solid #0a0a0a}',
      '.fa-emblem{background:#0a0a0a;color:#f2f0eb}',
      '.fa-emblem svg{filter:none}',
      '.fa-spark.spot-notch{background:#0a0a0a;border-color:#0a0a0a;color:#f2f0eb;border-radius:0;top:-34px}',
    ),
  },
  {
    raid: { title: 'Raid. {name} + {viewers_text}', duration_ms: 7500 },
  },
)
