// Gilded deco: an art-deco card in deep emerald with a gold double rule, fan corners and a
// single gold sheen. Spaced serif capitals for the name, an italic line under it. The
// Spark is a small ornament on the divider between them.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'gilded-deco',
    name: 'Gilded deco',
    description: 'Emerald and gold art deco: a double rule, fan corners and spaced serif capitals.',
    style: 'minimal',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'text',
    media_size: 120,
    font: font('Cinzel', 40, 700, { uppercase: true, letter_spacing: 0.08 }),
    colors: colors('#f4efe3', '#f6e3a1', '#071a14', '#d9b45a', '#000000'),
    shadow: 'soft',
    anim: motion('fade', 'fade', 'glow', 900, 600, 350),
    sound: { ref: null, builtin: 'chime', volume: 60 },
    duration_ms: 7500,
    brand: 'divider',
    css: css(
      '.f-plate .fa-text{background:radial-gradient(circle at 50% 0,#0f3326,#071a14 70%);border:2px solid #d9b45a;border-radius:0;padding:30px 84px 30px;box-shadow:inset 0 0 0 6px #071a14,inset 0 0 0 7px #d9b45a88,0 24px 50px -20px #000c;overflow:hidden;text-align:center}',
      '.fa-text::before,.fa-text::after{content:"";position:absolute;width:48px;height:48px;background:repeating-conic-gradient(from 90deg at 0 0,#d9b45a 0 5deg,transparent 5deg 11.25deg);-webkit-mask-image:radial-gradient(circle at 0 0,#000 68%,transparent 70%);mask-image:radial-gradient(circle at 0 0,#000 68%,transparent 70%)}',
      '.fa-text::before{left:10px;top:10px}',
      '.fa-text::after{right:10px;bottom:10px;scale:-1 -1}',
      '.fa-title .hl .ch{background:linear-gradient(180deg,#fff6cf,#d9b45a 60%,#a9822f);-webkit-background-clip:text;background-clip:text;color:transparent}',
      '.fa-body{font-family:"Playfair Display",serif;font-style:italic;font-size:24px;color:#e8dcc0}',
      '.fa-divider{color:#d9b45a}',
      '.fa-divider::before,.fa-divider::after{opacity:.8}',
    ),
  },
)
