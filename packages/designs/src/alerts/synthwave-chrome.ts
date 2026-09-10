// Synthwave chrome: a striped sunset disc behind the art, chrome capitals on a neon-edged
// night panel with a horizon line. The Spark is a small notch on the panel's top edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'synthwave-chrome',
    name: 'Synthwave chrome',
    description:
      'A striped sunset disc, chrome capitals and a neon horizon. Drive-at-night energy.',
    style: 'retro',
    motion: 'smooth',
  },
  {
    frame: 'neon',
    layout: 'above',
    media_size: 150,
    font: font('Audiowide', 40, 400, { uppercase: true, letter_spacing: 0.02 }),
    colors: colors('#fdf6ff', '#ff5fbf', '#12052e', '#2de2e6', '#0b0221'),
    shadow: 'none',
    anim: motion('rise', 'sink', 'wave', 700, 450, 300),
    sound: { ref: null, builtin: 'whoosh', volume: 65 },
    duration_ms: 7000,
    brand: 'notch',
    css: css(
      '.f-neon .fa-text{background:linear-gradient(180deg,#1d0848,#0b0221 70%);border:2px solid #2de2e6;border-radius:6px;padding:18px 34px 22px;box-shadow:0 0 16px #2de2e6aa,inset 0 0 26px #ff3ea533}',
      '.fa-text::after{content:"";position:absolute;left:8%;right:8%;bottom:9px;height:2px;background:linear-gradient(90deg,transparent,#ff3ea5,#2de2e6,#ff3ea5,transparent)}',
      '.f-neon .fa-media{border-radius:50%;border:0;box-shadow:0 0 40px #ff2975aa;overflow:hidden}',
      '.fa-emblem{background:linear-gradient(180deg,#ffd319 10%,#ff8c42 45%,#ff2975 80%)}',
      '.fa-emblem svg{fill:#12052e;filter:none;width:38%;height:38%;margin-top:-14%}',
      '.fa-media::after{content:"";position:absolute;inset:56% 0 0;background:repeating-linear-gradient(180deg,#0b0221 0 5px,transparent 5px 12px)}',
      '.fa-title .hl .ch{background:linear-gradient(180deg,#ffffff 0%,#ffc4ec 46%,#ff3ea5 50%,#ffe3f6 86%);-webkit-background-clip:text;background-clip:text;color:transparent}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;text-transform:none;color:#c9f7f8}',
      '.fa-spark.spot-notch{background:#0b0221;border-color:#2de2e6}',
    ),
  },
  {
    raid: { anim: motion('zoom', 'fade', 'glow', 600, 400, 200), duration_ms: 8000 },
  },
  [
    {
      event: 'tip',
      id: 'tip-big',
      name: 'Big tips',
      condition: { type: 'amount_at_least', value: 1000, currency: null },
      look: {
        media_size: 190,
        duration_ms: 9500,
        anim: motion('pop', 'sink', 'glow', 650, 450, 250),
      },
    },
  ],
)
