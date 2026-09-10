// Quest dialog: an RPG dialogue box. Double white border on black, pixel type that prints
// letter by letter, a blinking next arrow, the art in a framed portrait. The Spark is a
// small badge on the portrait.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'quest-dialog',
    name: 'Quest dialog',
    description: 'An RPG dialogue box that prints itself letter by letter, with a framed portrait.',
    style: 'retro',
    motion: 'lively',
  },
  {
    frame: 'none',
    layout: 'left',
    media_size: 130,
    font: font('Press Start 2P', 24, 400, { uppercase: false }),
    colors: colors('#ffffff', '#ffd23f', '#14142b', '#5ec8ff', '#000000'),
    shadow: 'none',
    anim: motion('pop', 'shrink', 'type', 420, 360, 150),
    sound: { ref: null, builtin: 'coin', volume: 65 },
    duration_ms: 7000,
    brand: 'badge',
    css: css(
      '.fa{gap:14px}',
      '.f-none .fa-text{background:#14142b;border-radius:0;padding:26px 30px 30px;box-shadow:0 0 0 4px #fff,0 0 0 8px #14142b,0 0 0 12px #fff,10px 14px 0 12px #00000066;max-width:560px}',
      '.fa-title{line-height:1.5}',
      '.fa-body{font-family:"Silkscreen",monospace;font-size:20px;color:#bfe9ff;margin-top:12px}',
      '.fa-text::after{content:"";position:absolute;right:16px;bottom:12px;width:16px;height:12px;background:#ffd23f;clip-path:polygon(0 0,100% 0,50% 100%);animation:fc-next .8s steps(1) 1s 6}',
      '@keyframes fc-next{50%{opacity:0}}',
      '.fa-media{border-radius:0;box-shadow:0 0 0 4px #fff,0 0 0 8px #14142b,0 0 0 12px #ffd23f;image-rendering:pixelated;margin-right:12px}',
      '.fa-emblem{background:linear-gradient(180deg,#5ec8ff 0 60%,#3fb950 60% 80%,#8a5a2b 80%);color:#ffd23f}',
      '.fa-emblem svg{filter:drop-shadow(3px 3px 0 #14142b)}',
      '.fa-spark.spot-badge{border-radius:0;rotate:0deg;background:#ffd23f;box-shadow:0 0 0 3px #14142b}',
    ),
  },
  {
    raid: { title: 'A party of {viewers_text} led by {name} joins!' },
    follow: { title: '{name} joined the party!' },
  },
)
