// Lower third: a broadcast news strap. A red LIVE tag, the headline on a white bar, the
// message on a dark bar under it, both sliding in from the side in turn. The Spark sits
// in the corner of the tag.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'lower-third',
    name: 'Lower third',
    description: 'A broadcast news strap: LIVE tag, a white headline bar and a dark message bar.',
    style: 'minimal',
    motion: 'smooth',
  },
  {
    frame: 'banner',
    layout: 'right',
    media_size: 96,
    font: font('Oswald', 42, 600, { uppercase: true }),
    colors: colors('#111418', '#c8102e', '#ffffff', '#c8102e', '#111418'),
    shadow: 'none',
    anim: motion('slide_right', 'slide_right', 'none', 550, 400, 250),
    sound: { ref: null, builtin: 'chime', volume: 50 },
    duration_ms: 6500,
    brand: 'corner',
    css: css(
      '.fa{gap:0;align-items:stretch}',
      '.f-banner .fa-text{transform:none;border-left:0;border-radius:0;padding:0;background:none}',
      '.f-banner .fa-text>*{transform:none}',
      '.f-banner .fa-text::after{display:none}',
      '.fa-title{background:#ffffff;padding:10px 28px 10px 22px;line-height:1.1}',
      '.fa-body{display:block;background:#111418;color:#ffffff;margin:0;padding:8px 28px 9px 22px;font-family:"Hanken Grotesk Variable",sans-serif;font-size:20px;opacity:1;animation:fc-sub .45s cubic-bezier(.2,.8,.2,1) .45s both}',
      '@keyframes fc-sub{from{transform:translateX(-30px);opacity:0}}',
      '.fa-body:empty{display:block}',
      '.f-banner .fa-media{transform:none;border-radius:0;width:96px;height:auto;background:#c8102e}',
      '.fa-media::after{content:"LIVE";position:absolute;inset:auto 0 10px;text-align:center;font:700 18px/1 "Oswald",sans-serif;letter-spacing:.2em;color:#fff}',
      '.fa-emblem{background:#c8102e;height:70%}',
      '.fa-emblem svg{filter:none;width:40%;height:40%}',
      '.fa-spark.spot-corner{right:-70px;top:8px;width:22px;height:22px;filter:none;color:#ffffff;z-index:2}',
    ),
  },
)
