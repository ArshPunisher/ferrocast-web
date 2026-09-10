// Canopy leaf: a mossy pill drifts down like a leaf, two leaves tumble past once, the name
// in warm amber over forest green. Calm, outdoorsy. The Spark sits on the corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'canopy-leaf',
    name: 'Canopy leaf',
    description: 'A mossy pill that drifts down like a leaf, with two leaves tumbling past.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'pill',
    layout: 'right',
    media_size: 110,
    font: font('Righteous', 40, 400),
    colors: colors('#f1f7e8', '#ffc145', '#173a2a', '#7bc96f', '#0b1f16'),
    shadow: 'soft',
    anim: motion('drop', 'sink', 'wave', 800, 500, 300),
    sound: { ref: null, builtin: 'chime', volume: 55 },
    duration_ms: 6500,
    brand: 'corner',
    css: css(
      '.fa.f-pill{background:linear-gradient(135deg,#21503a,#173a2a);border:2px solid #7bc96f66;padding:10px 10px 10px 16px}',
      '.fa-media{border-radius:50%;background:#7bc96f}',
      '.fa-emblem{background:radial-gradient(circle at 35% 30%,#b8f0a8,#5aa84e 60%,#2f6b2a);color:#173a2a}',
      '.fa-emblem svg{filter:none;fill:#f1f7e8}',
      '.fa::before,.fa::after{content:"";position:absolute;width:30px;height:20px;border-radius:0 80% 0 80%;background:#ffc145;top:-30px;animation:fc-leaf 2.4s ease-in .5s both;opacity:0}',
      '.fa::before{left:20%}',
      '.fa::after{left:70%;background:#7bc96f;animation-delay:.9s}',
      '@keyframes fc-leaf{0%{opacity:1;transform:translate(0,-40px) rotate(0)}100%{opacity:0;transform:translate(60px,160px) rotate(260deg)}}',
      '.fa-spark{color:#f1f7e8}',
    ),
  },
)
