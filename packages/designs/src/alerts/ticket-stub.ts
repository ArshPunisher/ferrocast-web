// Ticket stub: an admission ticket that slides in. Bites out of both ends, a perforated
// stub that reads ADMIT ONE, the name stamped big. The Spark rides the far edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'ticket-stub',
    name: 'Ticket stub',
    description: 'An admission ticket with a perforated ADMIT ONE stub. Slides in, letters pop.',
    style: 'retro',
    motion: 'bouncy',
  },
  {
    frame: 'plate',
    layout: 'left',
    media_size: 110,
    font: font('Bebas Neue', 58, 400, { letter_spacing: 0.03 }),
    colors: colors('#2b1a12', '#d7263d', '#ffe7b8', '#2b1a12', '#2b1a12'),
    shadow: 'none',
    anim: motion('slide_right', 'slide_left', 'pop', 600, 400, 250),
    sound: { ref: null, builtin: 'coin', volume: 60 },
    duration_ms: 6500,
    brand: 'edge',
    css: css(
      '.fa{gap:0;filter:drop-shadow(0 14px 18px #0008)}',
      '.f-plate .fa-text{background:#ffe7b8;border:0;border-radius:6px;box-shadow:none;padding:20px 40px 20px 34px;-webkit-mask:radial-gradient(circle at 100% 50%,transparent 18px,#000 19px);mask:radial-gradient(circle at 100% 50%,transparent 18px,#000 19px)}',
      '.fa-text::before{content:"";position:absolute;left:0;top:10px;bottom:10px;border-left:3px dashed #2b1a1255}',
      '.f-plate .fa-media{width:150px;height:auto;align-self:stretch;border-radius:6px;box-shadow:none;background:#d7263d;-webkit-mask:radial-gradient(circle at 0 50%,transparent 18px,#000 19px);mask:radial-gradient(circle at 0 50%,transparent 18px,#000 19px)}',
      '.fa-media::after{content:"ADMIT ONE";position:absolute;inset:0;display:grid;place-items:center;writing-mode:vertical-rl;rotate:180deg;font:400 30px/1 "Bebas Neue",sans-serif;letter-spacing:.2em;color:#ffe7b8}',
      '.fa-emblem{display:none}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-weight:600}',
      '.fa-spark{color:#2b1a12}',
    ),
  },
)
