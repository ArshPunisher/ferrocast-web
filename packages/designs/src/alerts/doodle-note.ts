// Doodle note: a yellow sticky note slapped on at a tilt, held by a strip of tape, the name
// in marker with a highlighter swipe. The Spark is doodled in the note's corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'doodle-note',
    name: 'Doodle note',
    description: 'A taped sticky note with a marker headline and a highlighter swipe on the name.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'plate',
    layout: 'right',
    media_size: 130,
    font: font('Caveat Brush', 46, 400),
    colors: colors('#1d2b53', '#1d2b53', '#ffe680', '#ff7eb6', '#1d2b53'),
    shadow: 'none',
    anim: motion('drop', 'lift', 'wiggle', 650, 420, 280),
    sound: { ref: null, builtin: 'boing', volume: 60 },
    duration_ms: 6500,
    brand: 'corner',
    css: css(
      '.f-plate .fa-text{background:linear-gradient(180deg,#fff08f,#ffe066);border:0;border-radius:2px 2px 18px 2px;rotate:-3deg;padding:26px 34px 24px;box-shadow:0 14px 22px -10px #0007,inset 0 -8px 0 #f2cf3f}',
      '.fa-text::before{content:"";position:absolute;left:50%;top:-16px;width:120px;height:30px;translate:-50% 0;rotate:4deg;background:repeating-linear-gradient(90deg,#ffffff40 0 6px,transparent 6px 12px),#9fd8ffcc;clip-path:polygon(3% 0,97% 6%,100% 40%,96% 70%,100% 100%,2% 94%,0 60%,4% 30%)}',
      '.fa-title .hl{background:linear-gradient(176deg,transparent 52%,#ff7eb6aa 52% 88%,transparent 88%);padding:0 .1em}',
      '.fa-body{font-family:"Caveat",cursive;font-size:28px;font-weight:600;opacity:1}',
      '.f-plate .fa-media{border-radius:50%;border:4px solid #1d2b53;rotate:6deg;box-shadow:5px 5px 0 #1d2b53}',
      '.fa-emblem{background:#ff7eb6;color:#1d2b53}',
      '.fa-emblem svg{fill:#fff;filter:none}',
      '.fa-spark{color:#1d2b53}',
      '.fa-spark.spot-corner{right:8px;top:auto;bottom:6px;width:30px;height:30px;filter:none;rotate:-8deg}',
    ),
  },
)
