// Confetti pop: a clean frosted card with a burst of confetti that falls once past it,
// letters bouncing in. Works over any game. The Spark sits on the corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'confetti-pop',
    name: 'Confetti pop',
    description:
      'A frosted card and a burst of confetti that falls once past it. Celebrates anything.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'glass',
    layout: 'above',
    media_size: 130,
    font: font('Fredoka', 46, 700),
    colors: colors('#ffffff', '#ffd23f', '#10121a', '#ff5fa8', '#10121a'),
    shadow: 'soft',
    anim: motion('pop', 'fade', 'bounce', 550, 450, 250),
    sound: { ref: null, builtin: 'sparkle', volume: 65 },
    duration_ms: 6500,
    brand: 'corner',
    css: css(
      '.fa-stage::before{content:"";position:absolute;left:10%;right:10%;top:-10%;height:120%;background:linear-gradient(#ff5fa8,#ff5fa8) 10% 10%/10px 18px,linear-gradient(#ffd23f,#ffd23f) 24% 30%/14px 8px,linear-gradient(#4fd1ff,#4fd1ff) 38% 6%/8px 16px,linear-gradient(#7cff8a,#7cff8a) 52% 24%/14px 9px,linear-gradient(#ff8a3d,#ff8a3d) 66% 12%/9px 17px,linear-gradient(#b38cff,#b38cff) 80% 28%/15px 8px,linear-gradient(#ffd23f,#ffd23f) 90% 8%/8px 14px,linear-gradient(#ff5fa8,#ff5fa8) 16% 46%/14px 7px,linear-gradient(#4fd1ff,#4fd1ff) 72% 44%/8px 15px;background-repeat:no-repeat;opacity:0;animation:fc-confetti 2.4s cubic-bezier(.3,.6,.4,1) .2s both}',
      '@keyframes fc-confetti{0%{opacity:1;transform:translateY(-60px) rotate(-4deg)}80%{opacity:1}100%{opacity:0;transform:translateY(220px) rotate(6deg)}}',
      '.fa-emblem{background:conic-gradient(#ff5fa8,#ffd23f,#4fd1ff,#7cff8a,#ff5fa8)}',
    ),
  },
)
