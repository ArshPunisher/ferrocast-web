// Speech bubble: a comic speech balloon pops out of the art, its tail pointing back at it,
// chunky outlined letters bouncing in. The Spark sits on the balloon's far edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'speech-bubble',
    name: 'Speech bubble',
    description: 'A comic speech balloon pops out of the art, tail and all, with bouncing letters.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'comic',
    layout: 'left',
    media_size: 130,
    font: font('Bangers', 54, 400, { letter_spacing: 0.04 }),
    colors: colors('#141414', '#ff3b30', '#ffffff', '#ffd60a', '#141414'),
    shadow: 'none',
    anim: motion('pop', 'shrink', 'bounce', 520, 380, 220),
    sound: { ref: null, builtin: 'boing', volume: 65 },
    duration_ms: 6500,
    brand: 'edge',
    css: css(
      '.f-comic .fa-deco{display:none}',
      '.f-comic .fa-text{border-radius:48px;rotate:0deg;padding:22px 40px 24px;margin-left:30px;background-image:none;box-shadow:6px 6px 0 #141414}',
      '.fa-text::before{content:"";position:absolute;left:-40px;top:50%;width:46px;height:40px;translate:0 -50%;background:#141414;clip-path:polygon(100% 0,0 60%,100% 100%)}',
      '.fa-text::after{content:"";position:absolute;left:-30px;top:50%;width:36px;height:24px;translate:0 -46%;background:#fff;clip-path:polygon(100% 0,0 60%,100% 100%)}',
      '.f-comic .fa-media{background:#ffd60a}',
      '.fa-emblem{background:#ffd60a;color:#141414}',
      '.fa-emblem svg{filter:none}',
    ),
  },
)
