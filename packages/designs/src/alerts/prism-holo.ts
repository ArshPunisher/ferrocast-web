// Prism holo: a clear glass card with an iridescent edge and a sheen that sweeps across
// once, airy grotesk type. The Spark is a faint watermark etched into the glass.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'prism-holo',
    name: 'Prism holo',
    description:
      'Clear glass with an iridescent edge and a sheen that sweeps across. Airy and calm.',
    style: 'minimal',
    motion: 'smooth',
  },
  {
    frame: 'glass',
    layout: 'over',
    media_size: 150,
    font: font('Space Grotesk', 44, 700, { letter_spacing: -0.02 }),
    colors: colors('#ffffff', '#a8f0ff', '#1a1c2e', '#ffb8f0', '#0e0f1a'),
    shadow: 'soft',
    anim: motion('zoom', 'zoom', 'none', 700, 500, 300),
    sound: { ref: null, builtin: 'sparkle', volume: 60 },
    duration_ms: 7000,
    brand: 'watermark',
    css: css(
      '.fa.lay-over .fa-media{width:520px;height:260px;border-radius:28px;background:conic-gradient(from 200deg at 50% 50%,#a8f0ff,#ffb8f0,#fff3a8,#c8ffde,#a8f0ff);opacity:.9}',
      '.fa-emblem{background:none;color:#ffffff}',
      '.fa-emblem svg{width:24%;height:24%;margin-top:-18%;filter:drop-shadow(0 6px 16px #0004)}',
      '.f-glass .fa-text{background:#0e0f1a99;border:1px solid #ffffff55;border-radius:22px;overflow:hidden;margin-bottom:16px;backdrop-filter:none}',
      '.fa-text::after{content:"";position:absolute;top:-20%;bottom:-20%;left:0;width:30%;background:linear-gradient(90deg,transparent,#ffffff66,transparent);transform:translateX(420%) skewX(-18deg);animation:fc-holo-sweep 1.4s cubic-bezier(.45,0,.25,1) .5s both}',
      '@keyframes fc-holo-sweep{from{transform:translateX(-160%) skewX(-18deg)}}',
      '.fa-title .hl{color:#ffffff;text-shadow:0 0 18px #a8f0ffcc}',
      '.fa-body{color:#e6e8ff}',
    ),
  },
)
