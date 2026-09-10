// Rewind VHS: a tape playing back. Chroma-split capitals, a PLAY tag and a timestamp in a
// terminal face, scan lines over everything and one tracking wobble on arrival. The Spark
// sits small in the top corner like a channel logo.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'rewind-vhs',
    name: 'Rewind VHS',
    description:
      'Tape playback: chroma-split capitals, a PLAY tag, scan lines and one tracking wobble.',
    style: 'retro',
    motion: 'lively',
  },
  {
    frame: 'none',
    layout: 'text',
    media_size: 120,
    font: font('VT323', 72, 400, { uppercase: true, letter_spacing: 0.04 }),
    colors: colors('#f4f4f4', '#ffe14d', '#000000', '#28dcff', '#000000'),
    shadow: 'none',
    anim: motion('fade', 'fade', 'none', 300, 300, 100),
    sound: { ref: null, builtin: 'whoosh', volume: 55 },
    duration_ms: 6500,
    brand: 'corner',
    css: css(
      '.fa-stage::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,#ffffff0d 0 2px,transparent 2px 5px);pointer-events:none}',
      '.f-none .fa-text{background:#000000b3;padding:46px 40px 22px;border-radius:0}',
      '.fa-text::before{content:"PLAY \\25B6\\00a0\\00a0SP 00:00:12";position:absolute;left:40px;top:14px;font:400 26px/1 "VT323",monospace;letter-spacing:.08em;color:#f4f4f4}',
      '.fa-title{text-shadow:3px 0 #ff2850b3,-3px 0 #28dcffb3;animation:fc-track .7s steps(6) .1s both}',
      '@keyframes fc-track{0%{transform:translateX(-14px) skewX(12deg)}30%{transform:translateX(10px) skewX(-8deg)}60%{transform:translateX(-4px)}}',
      '.fa-body{font-family:"VT323",monospace;font-size:34px;opacity:.9}',
      '.fa-spark.spot-corner{right:14px;top:10px;width:28px;height:28px;filter:none;opacity:.8}',
    ),
  },
)
