// Neon kanban: a back-street shop sign flickers on. A dark board ringed by a magenta tube
// wipes in, a tall cyan side sign spells LIVE down its edge, and the name glows like fresh
// neon over wet tarmac. The Spark hangs off the board's far edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'neon-kanban',
    name: 'Neon kanban',
    description:
      'A back-street shop sign: a magenta tube board, a tall cyan side sign and glowing capitals.',
    style: 'bold',
    motion: 'lively',
  },
  {
    frame: 'neon',
    layout: 'left',
    media_size: 120,
    font: font('Teko', 62, 500, { uppercase: true, letter_spacing: 0.03 }),
    colors: colors('#f4f1ff', '#29e3ff', '#0d0a1a', '#ff2e88', '#0d0a1a'),
    shadow: 'none',
    anim: motion('wipe', 'fade', 'glow', 500, 400, 200),
    sound: { ref: null, builtin: 'whoosh', volume: 60 },
    duration_ms: 7000,
    brand: 'edge',
    css: css(
      '.f-neon .fa-text{background:#0d0a1af0;border-radius:14px;padding:18px 34px 20px 92px;min-width:400px;min-height:156px;display:flex;flex-direction:column;justify-content:center;text-align:left}',
      '.fa-text::before{content:"L\\A I\\A V\\A E";white-space:pre;position:absolute;left:16px;top:12px;bottom:12px;width:50px;display:flex;align-items:center;justify-content:center;border:2px solid #29e3ff;border-radius:6px;font:500 34px/0.92 "Teko",sans-serif;color:#d9fbff;text-shadow:0 0 8px #29e3ff,0 0 20px #29e3ff;box-shadow:0 0 14px #29e3ff88,inset 0 0 10px #29e3ff55;animation:fc-flick .9s steps(1) .4s both}',
      '@keyframes fc-flick{0%{opacity:0}20%{opacity:1}30%{opacity:.2}45%{opacity:1}55%{opacity:.4}}',
      '.fa-title{line-height:.95;color:#fff3fa;text-shadow:0 0 10px #ff2e88aa}',
      '.fa-title .hl{color:#d9fbff;text-shadow:0 0 10px #29e3ff,0 0 26px #29e3ff}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-size:20px;font-weight:600;color:#d7d0f2;opacity:1;text-transform:none;margin-top:10px}',
      '.f-neon .fa-media{border-radius:12px;border-color:#ff2e88;box-shadow:0 0 18px #ff2e88}',
      '.fa-emblem{background:radial-gradient(circle at 50% 30%,#3a1f5a,#0d0a1a);color:#ff6fb1}',
      '.fa-emblem svg{filter:drop-shadow(0 0 8px #ff2e88)}',
      '.fa-spark.spot-edge{color:#29e3ff;filter:drop-shadow(0 0 8px #29e3ff)}',
    ),
  },
  {
    follow: { title: '{name} walked in off the street' },
    raid: { title: '{name} rolled in with {viewers_text}', duration_ms: 8000 },
  },
)
