// Chalk menu: a slate board in a warm wood frame pops up like the café's specials board.
// The headline is chalked by hand and rolls in a gentle wave, the name in latte foam, with
// a smudge of chalk dust behind. The art sits in a round coffee cup. The Spark is a little
// round stamp on the frame's corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'chalk-menu',
    name: 'Chalk menu',
    description:
      'A café specials board in a wood frame: hand chalked words, the name in latte foam.',
    style: 'cozy',
    motion: 'bouncy',
  },
  {
    frame: 'plate',
    layout: 'right',
    media_size: 120,
    font: font('Caveat Brush', 54, 400),
    colors: colors('#f6f1e7', '#e9c99a', '#2f3b35', '#7d9a7a', '#5f3b24'),
    shadow: 'none',
    anim: motion('pop', 'shrink', 'wave', 600, 400, 250),
    sound: { ref: null, builtin: 'coin', volume: 55 },
    duration_ms: 7000,
    brand: 'badge',
    css: css(
      '.fa{gap:22px}',
      '.f-plate .fa-text{background:radial-gradient(ellipse at 30% 30%,#ffffff0d,transparent 60%),linear-gradient(160deg,#2f3b35,#232d28);border:12px solid #8a5a3b;border-radius:12px;padding:20px 40px 22px;min-width:400px;text-align:center;box-shadow:inset 0 0 0 2px #00000033,0 22px 44px -20px #000d}',
      '.fa-text::before{content:"Today";position:absolute;left:50%;top:-30px;translate:-50% 0;padding:4px 18px 6px;border-radius:6px;background:#dcbf94;color:#3b2417;font:700 24px/1 "Caveat",cursive;box-shadow:0 6px 12px -6px #000a;rotate:-3deg}',
      '.fa-title{line-height:1.08;text-shadow:0 0 1px #f6f1e7aa}',
      '.fa-body{font-family:"Caveat",cursive;font-size:28px;font-weight:600;color:#d9d3c5;opacity:1;margin-top:4px}',
      '.f-plate .fa-media{border-radius:50%;background:#fbf7f0;box-shadow:0 0 0 8px #fbf7f0,0 0 0 10px #d8c3a4,0 18px 30px -12px #000b}',
      '.fa-emblem{border-radius:50%;background:radial-gradient(circle at 50% 50%,#f4e3c9 0 22%,#b98352 23% 62%,#8d5a32 63%);color:#f4e3c9}',
      '.fa-emblem svg{width:34%;height:34%;filter:none;color:#fbf7f0}',
      '.fa-spark.spot-badge{background:#dcbf94;color:#3b2417;box-shadow:0 0 0 3px #5f3b24}',
    ),
  },
  {
    follow: { title: '{name} grabbed a table' },
    tip: { title: '{name} left {amount} in the tip jar' },
    superchat: { title: '{name} left {amount} in the tip jar' },
    raid: { title: '{name} walked in with {viewers_text}', duration_ms: 8000 },
  },
)
