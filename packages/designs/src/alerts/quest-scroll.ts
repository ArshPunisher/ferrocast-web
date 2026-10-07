// Quest scroll: a parchment notice in a thin gilded frame drops onto the table and the
// headline inks itself on in carved capitals, wine red for the name. Iron studs pin the
// corners and a red wax seal sits at the foot. The Spark rests in a gold notch on top.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'quest-scroll',
    name: 'Quest scroll',
    description:
      'A parchment notice in a gilded frame, carved capitals that ink on and a wax seal.',
    style: 'retro',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'text',
    media_size: 110,
    font: font('Cinzel', 40, 800),
    colors: colors('#2b1d10', '#7a1f1a', '#efe0bb', '#d4a94a', '#2b1d10'),
    shadow: 'none',
    anim: motion('drop', 'fade', 'type', 700, 500, 250),
    sound: { ref: null, builtin: 'chime', volume: 55 },
    duration_ms: 7500,
    brand: 'notch',
    css: css(
      '.f-plate .fa-text{background:radial-gradient(ellipse at 50% 40%,#f6ead0,#efe0bb 55%,#d9bf8a);border:0;border-radius:4px;padding:40px 54px 46px;min-width:460px;max-width:600px;text-align:center;box-shadow:0 0 0 3px #2b1d10,0 0 0 7px #d4a94a,0 0 0 9px #8f6a22,0 28px 50px -20px #000e}',
      '.fa-text::before{content:"";position:absolute;inset:8px;border:1px solid #7a1f1a55;background:radial-gradient(circle at 10px 10px,#4a4d52 0 5px,#1c1d20 6px,transparent 7px),radial-gradient(circle at calc(100% - 10px) 10px,#4a4d52 0 5px,#1c1d20 6px,transparent 7px),radial-gradient(circle at 10px calc(100% - 10px),#4a4d52 0 5px,#1c1d20 6px,transparent 7px),radial-gradient(circle at calc(100% - 10px) calc(100% - 10px),#4a4d52 0 5px,#1c1d20 6px,transparent 7px);pointer-events:none}',
      '.fa-text::after{content:"";position:absolute;left:50%;bottom:-30px;width:56px;height:56px;translate:-50% 0;border-radius:46% 54% 50% 50%;background:radial-gradient(circle at 38% 34%,#c43a34,#7a1210 70%);box-shadow:0 6px 12px -4px #000c;animation:fc-seal .5s cubic-bezier(.3,1.6,.5,1) 1.1s both}',
      '@keyframes fc-seal{from{transform:scale(1.8);opacity:0}}',
      '.fa-title{line-height:1.2;letter-spacing:.02em}',
      '.fa-body{font-family:"Playfair Display",serif;font-style:italic;font-size:22px;font-weight:500;color:#5a4128;opacity:1;margin-top:12px}',
      '.fa-spark.spot-notch{background:#2b1d10;border-color:#d4a94a;color:#efe0bb;top:-30px}',
    ),
  },
  {
    follow: { title: '{name} joined the party' },
    tip: { title: '{name} offers {amount} in tribute' },
    superchat: { title: '{name} offers {amount} in tribute' },
    raid: { title: '{name} rides in with {viewers_text}', duration_ms: 8500 },
  },
)
