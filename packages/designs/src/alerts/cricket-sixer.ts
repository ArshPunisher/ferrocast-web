// Cricket sixer: a stadium scoreboard flashes up. A seam-stitched ball for the art, the
// headline in tall scoreboard capitals on pitch green, a big call for tips and raids.
// The Spark is a faint watermark on the board.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'cricket-sixer',
    name: 'Cricket sixer',
    description:
      'A stadium scoreboard with a stitched ball: tips are sixes, raids are a full house.',
    style: 'bold',
    motion: 'lively',
  },
  {
    frame: 'banner',
    layout: 'above',
    media_size: 120,
    font: font('Teko', 64, 600, { uppercase: true, letter_spacing: 0.02 }),
    colors: colors('#ffffff', '#ffd100', '#0e3b24', '#ffd100', '#04170d'),
    shadow: 'hard',
    anim: motion('zoom', 'fade', 'pop', 500, 400, 200),
    sound: { ref: null, builtin: 'bass', volume: 70 },
    duration_ms: 6500,
    brand: 'watermark',
    css: css(
      '.f-banner .fa-text{transform:none;border-left:0;border-radius:10px;padding:16px 40px 18px;background:linear-gradient(180deg,#14532f,#0e3b24);box-shadow:0 0 0 4px #ffd100,0 0 0 8px #04170d}',
      '.f-banner .fa-text>*{transform:none}',
      '.f-banner .fa-text::after{width:auto;left:0;right:0;top:auto;height:6px;background:repeating-linear-gradient(90deg,#ffd100 0 18px,transparent 18px 30px)}',
      '.f-banner .fa-media{transform:none;border-radius:50%;box-shadow:0 0 0 4px #04170d}',
      '.fa-emblem{background:radial-gradient(circle at 35% 30%,#ff6b6b,#c1121f 55%,#6a040f)}',
      '.fa-emblem svg{display:none}',
      '.fa-media::after{content:"";position:absolute;left:47%;top:6%;bottom:6%;width:6%;border-left:2px dashed #fff;border-right:2px dashed #fff;border-radius:50%}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-size:22px;text-transform:none}',
    ),
  },
  {
    tip: { title: 'SIX! {name} sends {amount}' },
    superchat: { title: 'SIX! {name} sends {amount}' },
    raid: { title: 'Full house: {name} brings {viewers_text}' },
    follow: { title: '{name} walks out to bat' },
  },
)
