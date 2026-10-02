// Sakura petal: a cream card edged in blush drops in like a falling blossom, the headline
// waves in a soft script, petals scatter from the corners. The art is a five-petal flower.
// The Spark sits between two hairlines under the headline.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'sakura-petal',
    name: 'Sakura petal',
    description: 'A cream card with a blush edge, a waving script headline and scattering petals.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'above',
    media_size: 120,
    font: font('Pacifico', 44, 400),
    colors: colors('#4a2342', '#d6457a', '#fff7f2', '#f7a8c4', '#4a2342'),
    shadow: 'none',
    anim: motion('drop', 'fade', 'wave', 800, 500, 300),
    sound: { ref: null, builtin: 'chime', volume: 55 },
    duration_ms: 7000,
    brand: 'divider',
    css: css(
      '.fa{gap:0}',
      '.f-plate .fa-text{background:#fff7f2;border:3px solid #ffd2e1;border-radius:28px;box-shadow:0 0 0 6px #ffffff,0 22px 44px -18px #d6457a88;padding:44px 44px 22px;margin-top:-40px}',
      '.fa-title{line-height:1.35}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-weight:600;font-size:20px;color:#6a3a5e;opacity:1}',
      '.fa-divider{color:#d6457a;margin:8px 24px 2px}',
      '.f-plate .fa-media{z-index:1;border-radius:50%;background:none;box-shadow:none;overflow:visible}',
      '.fa-emblem{background:radial-gradient(circle,#ffe14d 0 16%,#f7a8c4 17% 60%,#ffd2e1 61%);clip-path:polygon(50% 0,61% 28%,92% 18%,78% 47%,100% 70%,68% 72%,59% 100%,43% 76%,13% 92%,24% 62%,0 40%,31% 34%,18% 6%,41% 22%);color:#ffffff}',
      '.fa-emblem svg{width:34%;height:34%;filter:none}',
      '.fa-stage::before,.fa-stage::after{content:"";position:absolute;width:26px;height:18px;border-radius:100% 0 100% 0;background:#f7a8c4;animation:fc-petal 1.6s ease-out .4s both}',
      '.fa-stage::before{left:170px;top:90px;rotate:-20deg}',
      '.fa-stage::after{right:160px;bottom:90px;rotate:40deg;width:20px;height:14px;animation-delay:.7s}',
      '@keyframes fc-petal{from{transform:translate(-40px,-60px) rotate(-120deg);opacity:0}}',
    ),
  },
  {
    follow: { title: '{name} came to see the blossoms' },
    raid: { title: '{name} brought {viewers_text} for hanami', duration_ms: 8000 },
  },
)
