// Chai steam: a soft lamp-lit pill, handwritten words, and a curl of steam rising off the
// art. Calm enough for a rainy-night stream. The Spark sits on the pill's far edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'chai-steam',
    name: 'Chai steam',
    description: 'A warm lamp-lit pill with handwritten words and a curl of steam. Calm and cosy.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'pill',
    layout: 'left',
    media_size: 110,
    font: font('Caveat', 50, 700),
    colors: colors('#fff3e0', '#ffb35c', '#173039', '#6fbf8e', '#0c1b20'),
    shadow: 'soft',
    anim: motion('rise', 'fade', 'none', 800, 600, 200),
    sound: { ref: null, builtin: 'chime', volume: 55 },
    duration_ms: 7000,
    brand: 'edge',
    css: css(
      '.fa.f-pill{background:linear-gradient(135deg,#1d3a44,#132a31);border:1px solid #ffffff1f;box-shadow:0 18px 40px -16px #000c,0 0 60px -10px #ffb35c44;padding:10px 14px 10px 10px}',
      '.fa-media{border-radius:50%;background:#ffb35c;box-shadow:0 0 0 5px #ffb35c33}',
      '.fa-emblem{background:radial-gradient(circle at 35% 30%,#ffe2b8,#ffb35c 55%,#c97a2a)}',
      '.fa-emblem svg{fill:#3b2410;filter:none}',
      '.fa-media::before,.fa-media::after{content:"";position:absolute;left:40%;top:-30px;width:14px;height:40px;border-radius:50%;border:3px solid #fff3e0;border-color:#fff3e0 transparent transparent #fff3e0;opacity:0;animation:fc-steam 2.6s ease-out .6s 3}',
      '.fa-media::after{left:56%;animation-delay:1.4s}',
      '@keyframes fc-steam{0%{opacity:0;transform:translateY(12px) rotate(-10deg)}35%{opacity:.75}100%{opacity:0;transform:translateY(-26px) rotate(14deg)}}',
      '.fa-media{overflow:visible}',
      '.fa-body{display:block!important;font-family:"Hanken Grotesk Variable",sans-serif;font-size:19px;color:#cfe3dc;margin-top:2px}',
      '.f-pill .fa-text{padding:6px 34px 8px 14px}',
    ),
  },
  {
    raid: { title: '{name} brought {viewers_text} in from the rain', duration_ms: 8000 },
  },
)
