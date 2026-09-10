// Diya glow: a marigold-edged card that rises in warm light, a small flame flickering above
// the art, sparkles bursting once around the name. Festive without being loud. The Spark
// is notched into the card's top edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'diya-glow',
    name: 'Diya glow',
    description:
      'A marigold-edged card with a little flame and a burst of sparkles. For Diwali streams.',
    style: 'cozy',
    motion: 'lively',
    pro: true,
  },
  {
    frame: 'neon',
    layout: 'above',
    media_size: 130,
    font: font('Baloo 2', 48, 800),
    colors: colors('#fff4e0', '#ffd166', '#1a0d3a', '#ff9f1c', '#120a2e'),
    shadow: 'glow',
    anim: motion('magnet', 'lift', 'glow', 750, 500, 300),
    sound: { ref: null, builtin: 'sparkle', volume: 65 },
    duration_ms: 7500,
    brand: 'notch',
    css: css(
      '.f-neon .fa-text{background:linear-gradient(180deg,#24104d,#120a2e);border:3px solid #ff9f1c;border-radius:24px;box-shadow:0 0 0 6px #120a2e,0 0 0 9px #e0218a,0 0 40px #ff9f1c88;padding:20px 40px 22px}',
      '.f-neon .fa-media{border:0;box-shadow:none;border-radius:0 0 50% 50%;overflow:visible;background:none}',
      '.fa-emblem{border-radius:10px 10px 50% 50%/10px 10px 70% 70%;background:linear-gradient(180deg,#ffb347,#c2410c);color:#fff4e0;margin-top:30%;height:70%}',
      '.fa-media::before{content:"";position:absolute;left:50%;top:-6%;width:34px;height:56px;translate:-50% 0;background:radial-gradient(circle at 50% 70%,#fff8c4,#ffd166 40%,#ff6b00 75%);border-radius:50% 50% 50% 50%/60% 60% 40% 40%;box-shadow:0 0 30px #ffb347,0 0 60px #ff6b0088;animation:fc-flame .5s ease-in-out 14 alternate}',
      '@keyframes fc-flame{from{transform:scale(.92,1.05) rotate(-3deg)}to{transform:scale(1.05,.95) rotate(3deg)}}',
      '.fa-text::after{content:"";position:absolute;inset:-30px;background:radial-gradient(circle,#ffd166 2px,transparent 3px) 0 0/46px 46px;-webkit-mask-image:radial-gradient(closest-side,transparent 60%,#000 62%,transparent 100%);mask-image:radial-gradient(closest-side,transparent 60%,#000 62%,transparent 100%);opacity:0;animation:fc-burst 1.2s ease-out .6s both}',
      '@keyframes fc-burst{0%{opacity:1;transform:scale(.6)}100%{opacity:0;transform:scale(1.2)}}',
      '.fa-spark.spot-notch{background:#120a2e;border-color:#ff9f1c}',
    ),
  },
  {
    follow: { title: '{name} joined the celebration', body: 'शुभ दीपावली!' },
  },
)
