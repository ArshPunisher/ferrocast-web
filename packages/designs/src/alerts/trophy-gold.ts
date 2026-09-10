// Trophy gold: for the moments that deserve it. Gold rays turn slowly behind the art, a
// dark plate with a gold rim, the amount glowing. Made for big tips and long resubs. The
// Spark is a small gold badge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'trophy-gold',
    name: 'Trophy gold',
    description: 'Gold rays turning behind the art and a gold-rimmed plate. For the big moments.',
    style: 'bold',
    motion: 'lively',
    pro: true,
  },
  {
    frame: 'plate',
    layout: 'above',
    media_size: 160,
    font: font('Oswald', 46, 700, { uppercase: true, letter_spacing: 0.02 }),
    colors: colors('#fff8e7', '#ffcf40', '#14100a', '#ffcf40', '#000000'),
    shadow: 'glow',
    anim: motion('zoom', 'zoom', 'glow', 650, 450, 300),
    sound: { ref: null, builtin: 'bass', volume: 70 },
    duration_ms: 8000,
    brand: 'badge',
    css: css(
      '.f-plate .fa-media{overflow:visible;border-radius:50%;box-shadow:0 0 0 5px #ffcf40,0 0 60px #ffcf4088}',
      '.fa-media::before{content:"";position:absolute;left:50%;top:50%;width:420px;height:420px;translate:-50% -50%;background:repeating-conic-gradient(#ffcf4055 0 8deg,transparent 8deg 22deg);-webkit-mask-image:radial-gradient(circle,#000 20%,transparent 65%);mask-image:radial-gradient(circle,#000 20%,transparent 65%);z-index:-1;animation:fc-rays 7s linear both}',
      '@keyframes fc-rays{from{transform:rotate(-40deg)}}',
      '.fa-emblem{background:radial-gradient(circle at 35% 30%,#fff2b0,#ffcf40 45%,#a06d00);color:#3a2600}',
      '.fa-emblem svg{filter:none}',
      '.f-plate .fa-text{background:linear-gradient(180deg,#221a0e,#14100a);border:2px solid #ffcf40;box-shadow:inset 0 0 0 5px #14100a,inset 0 0 0 6px #ffcf4066,0 24px 40px -20px #000}',
      '.fa-spark.spot-badge{background:#ffcf40;color:#14100a}',
    ),
  },
)
