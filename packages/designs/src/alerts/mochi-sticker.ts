// Mochi sticker: a die-cut sticker that bounces on. Thick white outline, pastel fill, a
// round mochi face holding the event's icon, letters that bounce in one by one. The Spark
// is a little round badge stuck on the corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'mochi-sticker',
    name: 'Mochi sticker',
    description:
      'A die-cut pastel sticker with a little mochi face that bounces on. Sweet and loud.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'none',
    layout: 'above',
    media_size: 140,
    font: font('Fredoka', 46, 700),
    colors: colors('#5a3d5c', '#ff5fa8', '#fff1f8', '#9ff0d0', '#ffffff'),
    shadow: 'none',
    anim: motion('bounce', 'shrink', 'bounce', 800, 420, 250),
    sound: { ref: null, builtin: 'boing', volume: 65 },
    duration_ms: 6500,
    brand: 'badge',
    css: css(
      '.fa{gap:6px}',
      '.f-none .fa-text{background:#fff1f8;border-radius:34px;padding:26px 34px 20px;box-shadow:0 0 0 8px #fff,0 0 0 11px #ffc4e1,8px 12px 0 11px #5a3d5c22}',
      '.fa-media{border-radius:50%;overflow:visible;z-index:1;margin-bottom:-10px}',
      '.fa-emblem{border-radius:50%;background:radial-gradient(circle at 50% 40%,#ffffff,#ffe3f0 70%);box-shadow:0 0 0 7px #fff,0 0 0 10px #ffc4e1}',
      '.fa-emblem svg{fill:#ff5fa8;width:34%;height:34%;margin-top:22%;filter:none}',
      '.fa-media::before,.fa-media::after{content:"";position:absolute;top:34%;width:12px;height:16px;border-radius:50%;background:#5a3d5c;z-index:2}',
      '.fa-media::before{left:33%}',
      '.fa-media::after{right:33%}',
      '.fa-title .hl{color:#ff5fa8}',
      '.fa-body{color:#5a3d5c;font-weight:600;opacity:1}',
      '.fa-spark.spot-badge{background:#9ff0d0;color:#5a3d5c;box-shadow:0 0 0 4px #fff}',
    ),
  },
)
