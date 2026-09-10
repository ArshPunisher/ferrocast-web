// Overclock HUD: a terminal readout that types itself in behind corner brackets and scan
// lines, acid-green on near black. The Spark is a small badge on the bracket corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'overclock-hud',
    name: 'Overclock HUD',
    description: 'A HUD readout that types itself in behind corner brackets and scan lines.',
    style: 'tech',
    motion: 'lively',
  },
  {
    frame: 'none',
    layout: 'left',
    media_size: 120,
    font: font('Orbitron', 36, 800, { uppercase: true, letter_spacing: 0.04 }),
    colors: colors('#e9fbe9', '#d4ff2a', '#05070a', '#19f0ff', '#000000'),
    shadow: 'none',
    anim: motion('wipe', 'wipe', 'type', 520, 380, 120),
    sound: { ref: null, builtin: 'coin', volume: 60 },
    duration_ms: 6500,
    brand: 'badge',
    css: css(
      '.f-none .fa-text{background:repeating-linear-gradient(0deg,#ffffff08 0 2px,transparent 2px 4px),linear-gradient(90deg,#05070af2,#0a1410e6);padding:18px 30px 20px;border-radius:0;clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px))}',
      '.fa-text::before{content:"";position:absolute;inset:0;border:2px solid #d4ff2a;clip-path:inherit;opacity:.0}',
      '.fa-text::after{content:"SIGNAL // NEW EVENT";position:absolute;left:30px;top:-24px;font:600 13px/1 "JetBrains Mono Variable",monospace;letter-spacing:.18em;color:#19f0ff}',
      '.fa-media{border-radius:0;border:2px solid #19f0ff;box-shadow:0 0 0 6px #05070a,0 0 0 8px #19f0ff55}',
      '.fa-emblem{background:repeating-linear-gradient(0deg,#19f0ff22 0 2px,transparent 2px 5px),#071016;color:#d4ff2a}',
      '.fa-media::before,.fa-media::after{content:"";position:absolute;width:22px;height:22px;border:3px solid #d4ff2a;z-index:1}',
      '.fa-media::before{left:-10px;top:-10px;border-right:0;border-bottom:0}',
      '.fa-media::after{right:-10px;bottom:-10px;border-left:0;border-top:0}',
      '.fa-body{font-family:"JetBrains Mono Variable",monospace;font-size:18px;color:#9fe7c2}',
      '.fa-title .hl{text-shadow:0 0 12px #d4ff2a99}',
      '.fa-spark.spot-badge{background:#d4ff2a;color:#05070a;box-shadow:none;border-radius:0;rotate:0deg;clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)}',
    ),
  },
  {
    raid: { anim: motion('slide_left', 'slide_right', 'type', 500, 380, 100), duration_ms: 8000 },
  },
)
