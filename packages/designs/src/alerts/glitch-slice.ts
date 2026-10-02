// Glitch slice: an acid yellow slab wipes in with a hot red echo knocked out of register,
// the capitals jitter once, and two torn bars of signal cut across. The Spark rides the
// slab's far edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'glitch-slice',
    name: 'Glitch slice',
    description: 'An acid yellow slab with a red echo, jittering capitals and torn signal bars.',
    style: 'bold',
    motion: 'lively',
  },
  {
    frame: 'banner',
    layout: 'left',
    media_size: 120,
    font: font('Russo One', 46, 400, { uppercase: true }),
    colors: colors('#09090e', '#d0002a', '#fcee0a', '#ff2a4d', '#09090e'),
    shadow: 'none',
    anim: motion('wipe', 'wipe', 'wiggle', 450, 350, 150),
    sound: { ref: null, builtin: 'bass', volume: 65 },
    duration_ms: 6500,
    brand: 'edge',
    css: css(
      '.f-banner .fa-text{background:#fcee0a;border-left:0;border-radius:0;clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px));box-shadow:none;padding:16px 56px 16px 30px;filter:drop-shadow(10px 8px 0 #ff2a4d)}',
      '.f-banner .fa-text::after{width:46px;background:repeating-linear-gradient(135deg,#09090e 0 7px,transparent 7px 14px)}',
      '.fa-title{text-shadow:3px 0 #ff2a4d99,-2px 0 #00e5ff66}',
      '.fa-body{font-family:"JetBrains Mono Variable",monospace;font-size:18px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#09090e;opacity:1}',
      '.f-banner .fa-media{border-radius:0;transform:skewX(-9deg);background:#09090e;box-shadow:0 0 0 3px #fcee0a,8px 8px 0 0 #ff2a4d}',
      '.fa-emblem{background:#09090e;color:#fcee0a}',
      '.fa-emblem svg{filter:none}',
      '.fa-stage::before,.fa-stage::after{content:"";position:absolute;height:8px;background:#ff2a4d;animation:fc-tear .5s steps(4) .35s both}',
      '.fa-stage::before{left:90px;top:150px;width:220px}',
      '.fa-stage::after{right:110px;bottom:150px;width:160px;height:5px;background:#00e5ff;animation-delay:.5s}',
      '@keyframes fc-tear{0%{transform:translateX(-60px);opacity:0}50%{transform:translateX(30px);opacity:1}75%{transform:translateX(-10px)}}',
      '.fa-spark.spot-edge{color:#fcee0a}',
    ),
  },
  {
    raid: { title: '{name} hacked in with {viewers_text}', duration_ms: 8000 },
  },
)
