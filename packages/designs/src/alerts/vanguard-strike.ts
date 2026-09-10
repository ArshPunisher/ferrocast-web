// Vanguard strike: a hard red slash cuts across, the headline slams in on a black slab in
// heavy italic capitals, speed stripes trail off the end. The Spark is notched into the
// slab's top edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'vanguard-strike',
    name: 'Vanguard strike',
    description:
      'A red slash, a black slab and heavy italic capitals that slam in. Match-day energy.',
    style: 'bold',
    motion: 'lively',
  },
  {
    frame: 'banner',
    layout: 'text',
    media_size: 120,
    font: font('Russo One', 46, 400, { uppercase: true, italic: true }),
    colors: colors('#f5f5f5', '#ff2a1f', '#0c0d10', '#ff2a1f', '#000000'),
    shadow: 'hard',
    anim: motion('slide_left', 'slide_right', 'pop', 420, 360, 160),
    sound: { ref: null, builtin: 'bass', volume: 70 },
    duration_ms: 6000,
    brand: 'notch',
    css: css(
      '.fa-stage::before{content:"";position:absolute;left:-10%;right:-10%;top:47%;height:120px;translate:0 -50%;background:linear-gradient(90deg,transparent,#e10600 20% 80%,transparent);transform:skewY(-6deg);transform-origin:0 50%;animation:fc-slash .5s cubic-bezier(.2,.9,.2,1) .05s both}',
      '@keyframes fc-slash{from{transform:skewY(-6deg) scaleX(0)}}',
      '.f-banner .fa-text{background:#0c0d10;border-left:12px solid #ff2a1f;padding:18px 70px 20px 34px;box-shadow:12px 12px 0 #00000088}',
      '.f-banner .fa-text::after{width:56px;background:repeating-linear-gradient(115deg,#ff2a1f 0 8px,transparent 8px 16px)}',
      '.fa-body{font-family:"Teko",sans-serif;font-size:30px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:#c9ccd3;margin-top:2px}',
      '.fa-spark.spot-notch{background:#0c0d10;border-color:#ff2a1f;border-radius:0}',
    ),
  },
  {
    raid: { title: '{name} raids with {viewers_text}', duration_ms: 8000 },
    tip: { title: '{name} drops {amount}' },
  },
)
