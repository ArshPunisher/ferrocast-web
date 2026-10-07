// Abyss glow: a deep-water glass card rises from below with an aqua bioluminescent rim, the
// headline rolls in like a slow wave and a trail of bubbles floats up past it. The art is
// a round porthole of glowing water. The Spark drifts on the card's far edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'abyss-glow',
    name: 'Abyss glow',
    description:
      'Deep-water glass with an aqua glowing rim, a slow wave headline and rising bubbles.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'glass',
    layout: 'above',
    media_size: 116,
    font: font('Bricolage Grotesque', 46, 500, { letter_spacing: -0.01 }),
    colors: colors('#e8fbff', '#5ef2e0', '#04263a', '#c69bff', '#020b16'),
    shadow: 'none',
    anim: motion('rise', 'sink', 'wave', 900, 600, 300),
    sound: { ref: null, builtin: 'sparkle', volume: 50 },
    duration_ms: 7000,
    brand: 'edge',
    css: css(
      '.fa{gap:14px}',
      '.f-glass .fa-text{background:linear-gradient(180deg,#0a4560e0,#04263af0);border:1.5px solid #5ef2e099;border-radius:28px;padding:26px 44px 24px;box-shadow:0 0 34px -6px #5ef2e077,inset 0 1px 0 #e8fbff55,0 26px 50px -22px #000e;backdrop-filter:none}',
      '.fa-title .hl{text-shadow:0 0 18px #5ef2e0aa}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-size:20px;font-weight:500;color:#b9e6ee;opacity:1}',
      '.f-glass .fa-media{border-radius:50%;border:3px solid #5ef2e0;box-shadow:0 0 0 6px #04263a,0 0 30px #5ef2e088}',
      '.fa-emblem{background:radial-gradient(circle at 50% 20%,#7ff6e8,#127a86 45%,#020b16);color:#e8fbff}',
      '.fa-stage::before,.fa-stage::after{content:"";position:absolute;border-radius:50%;border:2px solid #e8fbffaa;background:#e8fbff1a;animation:fc-rise 2.2s cubic-bezier(.2,.6,.3,1) .3s both}',
      '.fa-stage::before{left:70px;top:170px;width:22px;height:22px;box-shadow:24px -48px 0 -6px #e8fbff33,-10px -96px 0 -8px #e8fbff33}',
      '.fa-stage::after{right:60px;top:220px;width:16px;height:16px;animation-delay:.7s;box-shadow:-18px -56px 0 -4px #e8fbff33}',
      '@keyframes fc-rise{from{transform:translateY(140px);opacity:0}}',
      '.fa-spark.spot-edge{color:#5ef2e0;filter:drop-shadow(0 0 8px #5ef2e0)}',
    ),
  },
  {
    follow: { title: '{name} dove in' },
    raid: { title: '{name} surfaced with {viewers_text}', duration_ms: 8000 },
  },
)
