// Paper collage: a ransom-note headline. Every letter is its own scrap of paper, tilted and
// mixed in colour, on a torn sheet with a strip of tape. The Spark is a round sticker.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'paper-collage',
    name: 'Paper collage',
    description:
      'A ransom-note headline: every letter its own scrap of paper on a torn, taped sheet.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'plate',
    layout: 'above',
    media_size: 120,
    font: font('Anton', 44, 400, { uppercase: true }),
    colors: colors('#111111', '#111111', '#f5f5f0', '#ff4f2e', '#111111'),
    shadow: 'none',
    anim: motion('pop', 'shrink', 'pop', 520, 380, 200),
    sound: { ref: null, builtin: 'boing', volume: 60 },
    duration_ms: 7000,
    brand: 'badge',
    css: css(
      '.f-plate .fa-text{background:#f5f5f0;border:0;box-shadow:0 16px 26px -12px #000a;border-radius:0;padding:30px 34px 26px;clip-path:polygon(0 3%,8% 0,22% 2%,40% 0,61% 3%,80% 0,100% 2%,99% 30%,100% 62%,98% 100%,76% 97%,52% 100%,30% 97%,9% 100%,1% 98%,0 60%)}',
      '.fa-title .ch{padding:0 .08em;margin:0 .02em;background:#fff;box-shadow:1px 2px 0 #0003}',
      '.fa-title .ch:nth-child(3n){background:#111;color:#fff;rotate:-4deg}',
      '.fa-title .ch:nth-child(3n+1){background:#ffe14d;rotate:3deg}',
      '.fa-title .ch:nth-child(4n){background:#ff4f2e;color:#fff;rotate:-2deg;font-family:"Bebas Neue",sans-serif}',
      '.fa-title .ch:nth-child(5n){background:#7bd3ff;rotate:5deg}',
      '.fa-body{font-family:"Caveat",cursive;font-size:30px;font-weight:700;margin-top:14px}',
      '.f-plate .fa-media{border-radius:0;rotate:-5deg;box-shadow:0 0 0 8px #fff,4px 8px 12px #0006}',
      '.fa-emblem{background:#ff4f2e}',
      '.fa-spark.spot-badge{background:#ffe14d;color:#111}',
    ),
  },
)
