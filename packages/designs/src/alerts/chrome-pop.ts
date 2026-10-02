// Chrome pop: Y2K gloss. A chrome orb bounces in above a fat glossy white pill, the
// headline in liquid chrome capitals that pop letter by letter, a sparkle on each side.
// The Spark is a faint watermark etched into the pill.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'chrome-pop',
    name: 'Chrome pop',
    description: 'A bouncing chrome orb over a glossy pill, liquid chrome capitals and sparkles.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'none',
    layout: 'above',
    media_size: 130,
    font: font('Righteous', 46, 400, { uppercase: true, letter_spacing: 0.02 }),
    colors: colors('#1d1546', '#ff3fc8', '#ffffff', '#3456ff', '#1d1546'),
    shadow: 'none',
    anim: motion('bounce', 'shrink', 'pop', 750, 420, 300),
    sound: { ref: null, builtin: 'sparkle', volume: 60 },
    duration_ms: 6500,
    brand: 'watermark',
    css: css(
      '.fa{gap:6px}',
      '.f-none .fa-text{background:linear-gradient(180deg,#ffffff,#e9ecff);border:3px solid #ffffff;border-radius:999px;padding:20px 54px 22px;box-shadow:0 0 0 2px #b9c8ff,0 20px 40px -18px #3456ff99,inset 0 -8px 18px #c9d2ff}',
      '.fa-text::before{content:"";position:absolute;left:40px;right:40px;top:7px;height:14px;border-radius:99px;background:linear-gradient(180deg,#ffffffee,#ffffff00)}',
      '.fa-title .ch{background:linear-gradient(180deg,#9aa6c8 0%,#ffffff 38%,#5b6aa8 52%,#1d1546 58%,#8a94c8 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1px #1d154633}',
      '.fa-title .hl .ch{background:linear-gradient(180deg,#ffd0f3 0%,#ffffff 36%,#ff3fc8 54%,#a0128a 62%,#ff8fe0 100%);-webkit-background-clip:text;background-clip:text}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-weight:700;font-size:20px;color:#3a3270;opacity:1}',
      '.fa-media{border-radius:50%;background:radial-gradient(circle at 34% 26%,#ffffff 0 12%,#dfe6ff 22%,#7f8ff0 58%,#2a2a8a 100%);box-shadow:0 0 0 4px #ffffff,0 16px 30px -12px #3456ffaa;z-index:1}',
      '.fa-emblem{background:none;color:#ffffff}',
      '.fa-media::after{content:"";position:absolute;left:22%;top:12%;width:30%;height:18%;border-radius:50%;background:#ffffffcc}',
      '.fa-stage::before,.fa-stage::after{content:"";position:absolute;width:34px;height:34px;background:#ffffff;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);filter:drop-shadow(0 0 6px #ff3fc8);animation:fc-twinkle .6s cubic-bezier(.3,1.6,.5,1) .5s both}',
      '.fa-stage::before{left:150px;top:120px}',
      '.fa-stage::after{right:150px;bottom:110px;width:26px;height:26px;animation-delay:.7s}',
      '@keyframes fc-twinkle{from{transform:scale(0) rotate(-90deg)}}',
      '.fa-spark.spot-watermark{color:#3456ff;opacity:.07}',
    ),
  },
  {
    raid: { title: '{name} beamed in {viewers_text}', duration_ms: 8000 },
  },
)
