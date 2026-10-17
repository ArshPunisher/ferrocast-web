// Marquee bulbs: a theatre marquee. Rows of bulbs chase round a deep red sign, the
// headline in an outlined neon face, the name in gold. Showtime. The Spark is a small
// badge under the sign.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'marquee-bulbs',
    name: 'Marquee bulbs',
    description: 'A theatre marquee: bulbs chase round a red sign, outlined neon capitals.',
    style: 'retro',
    motion: 'lively',
  },
  {
    frame: 'neon',
    layout: 'over',
    media_size: 150,
    font: font('Monoton', 40, 400, { uppercase: true, letter_spacing: 0.04 }),
    colors: colors('#fff4d6', '#ffd23f', '#5c0a14', '#ffd23f', '#2a0308'),
    shadow: 'none',
    anim: motion('drop', 'lift', 'pop', 650, 450, 300),
    sound: { ref: null, builtin: 'sparkle', volume: 60 },
    duration_ms: 7500,
    brand: 'badge',
    css: css(
      '.fa.lay-over .fa-media{display:none}',
      '.f-neon .fa-text{margin:0;background:radial-gradient(circle at 50% 0,#8a1220,#5c0a14 70%);border:0;border-radius:18px;padding:44px 56px 40px;box-shadow:0 20px 40px -16px #000c}',
      '.fa-text::before{content:"";position:absolute;inset:10px;border-radius:12px;background:radial-gradient(circle,#ffd23f 4px,#ffd23f00 5px) 0 0/26px 26px;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;padding:10px;filter:drop-shadow(0 0 6px #ffd23f);animation:fc-chase .5s steps(2) 10}',
      '@keyframes fc-chase{50%{opacity:.45}}',
      '.fa-title .hl{text-shadow:0 0 12px #ffd23f}',
      '.fa-body{font-family:"Righteous",sans-serif;font-size:22px;color:#ffd9a8}',
    ),
  },
)
