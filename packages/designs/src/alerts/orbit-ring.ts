// Orbit ring: the art becomes a small planet with a tilted ring sweeping round it, the
// words float beside it on a dark band with a starfield. The Spark is a faint watermark.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'orbit-ring',
    name: 'Orbit ring',
    description: 'The art as a ringed planet, the words drifting beside it over a starfield.',
    style: 'tech',
    motion: 'smooth',
  },
  {
    frame: 'none',
    layout: 'left',
    media_size: 150,
    font: font('Bebas Neue', 60, 400, { letter_spacing: 0.04 }),
    colors: colors('#eef6ff', '#1fd1c1', '#070a18', '#ff9f5a', '#000000'),
    shadow: 'soft',
    anim: motion('slide_right', 'fade', 'wave', 800, 500, 300),
    sound: { ref: null, builtin: 'whoosh', volume: 60 },
    duration_ms: 7000,
    brand: 'watermark',
    css: css(
      '.fa{gap:34px}',
      '.fa-media{overflow:visible;border-radius:50%}',
      '.fa-emblem{border-radius:50%;background:radial-gradient(circle at 32% 30%,#ffd0a8,#ff9f5a 40%,#8a3b1d 85%);box-shadow:0 0 50px #ff9f5a66}',
      '.fa-emblem svg{fill:#2a1206;filter:none;opacity:.8}',
      '.fa-media::after{content:"";position:absolute;left:-28%;top:38%;width:156%;height:26%;border-radius:50%;border:4px solid #1fd1c1;border-top-color:transparent;rotate:-14deg;animation:fc-orbit 1.2s cubic-bezier(.2,.8,.2,1) .2s both}',
      '@keyframes fc-orbit{from{opacity:0;transform:scaleX(.2)}}',
      '.f-none .fa-text{background:linear-gradient(90deg,#070a18f0,#070a1880);border-left:3px solid #1fd1c1;border-radius:0 18px 18px 0;padding:16px 34px 18px 26px;background-image:radial-gradient(#ffffff55 1px,transparent 1.5px),linear-gradient(90deg,#070a18f0,#070a1880);background-size:38px 38px,auto}',
      '.fa-body{font-family:"Space Grotesk",sans-serif;font-size:22px;color:#bcd2ff}',
    ),
  },
)
