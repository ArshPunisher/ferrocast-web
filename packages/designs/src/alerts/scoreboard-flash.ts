// Scoreboard flash: the stadium board flips over to your name. A black LED board with an
// amber header strip and a dot-matrix footer, tall Bebas capitals that pop in, the amount
// lit in amber. The Spark is a round sponsor badge on the board's corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'scoreboard-flash',
    name: 'Scoreboard flash',
    description: 'The stadium board flips to your name: amber header, LED dots and tall capitals.',
    style: 'bold',
    motion: 'lively',
  },
  {
    frame: 'banner',
    layout: 'text',
    media_size: 110,
    font: font('Bebas Neue', 70, 400, { uppercase: true, letter_spacing: 0.03 }),
    colors: colors('#ffffff', '#ffc21a', '#0b0c0e', '#ffc21a', '#0b0c0e'),
    shadow: 'none',
    anim: motion('flip', 'flip', 'pop', 600, 400, 250),
    sound: { ref: null, builtin: 'bass', volume: 70 },
    duration_ms: 6500,
    brand: 'badge',
    css: css(
      '.f-banner .fa-text{transform:none;border-left:0;border-radius:10px;background:linear-gradient(180deg,#16181c,#0b0c0e);border:6px solid #2b2f36;padding:64px 50px 34px;min-width:520px;text-align:center;box-shadow:0 26px 50px -20px #000e}',
      '.f-banner .fa-text>*{transform:none}',
      '.f-banner .fa-text::after{width:auto;left:0;right:0;top:auto;bottom:6px;height:12px;background:radial-gradient(circle,#ffc21a88 0 2px,transparent 2.5px) 0 0/12px 12px}',
      '.fa-text::before{content:"SCOREBOARD";position:absolute;left:0;right:0;top:0;height:46px;padding-top:9px;background:#ffc21a;font:400 32px/1 "Bebas Neue",sans-serif;letter-spacing:.3em;color:#0b0c0e}',
      '.fa-title .hl{text-shadow:0 0 18px #ffc21a99}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-size:22px;font-weight:600;color:#c9d3e6;opacity:1}',
      '.fa-spark.spot-badge{background:#ffc21a;color:#0b0c0e}',
    ),
  },
  {
    tip: { title: 'Boundary! {name} sends {amount}' },
    superchat: { title: 'Boundary! {name} sends {amount}' },
    raid: { title: 'Crowd surge: {name} brings {viewers_text}', duration_ms: 8000 },
    follow: { title: '{name} takes a seat' },
  },
)
