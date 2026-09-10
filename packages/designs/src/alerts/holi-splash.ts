// Holi splash: clouds of colour powder burst out behind a bright card, rounded type in
// hot pink and the name in deep blue. For Holi streams. The Spark sits on the corner.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'holi-splash',
    name: 'Holi splash',
    description: 'Clouds of colour powder burst behind a bright card. For Holi streams.',
    style: 'playful',
    motion: 'bouncy',
    pro: true,
  },
  {
    frame: 'none',
    layout: 'above',
    media_size: 130,
    font: font('Baloo 2', 50, 800),
    colors: colors('#3a0d4a', '#1f4fff', '#ffffff', '#ff2e93', '#3a0d4a'),
    shadow: 'none',
    anim: motion('zoom', 'zoom', 'pop', 600, 450, 250),
    sound: { ref: null, builtin: 'sparkle', volume: 65 },
    duration_ms: 7000,
    brand: 'corner',
    css: css(
      '.fa-stage::before{content:"";position:absolute;left:50%;top:50%;width:760px;height:430px;translate:-50% -50%;background:radial-gradient(circle at 20% 40%,#ff2e93cc 0 16%,transparent 30%),radial-gradient(circle at 78% 34%,#ffd60acc 0 14%,transparent 28%),radial-gradient(circle at 60% 78%,#00c2ffcc 0 15%,transparent 29%),radial-gradient(circle at 34% 80%,#7cff4fcc 0 12%,transparent 25%),radial-gradient(circle at 50% 18%,#9b5cffcc 0 12%,transparent 24%);filter:blur(6px);animation:fc-powder 1s cubic-bezier(.2,.8,.2,1) both}',
      '@keyframes fc-powder{from{transform:scale(.3);opacity:0}}',
      '.f-none .fa-text{background:#ffffff;border-radius:28px;padding:20px 36px 22px;box-shadow:0 0 0 6px #ff2e93,0 18px 30px -12px #0006}',
      '.fa-media{border-radius:50%;box-shadow:0 0 0 6px #fff}',
      '.fa-emblem{background:conic-gradient(#ff2e93,#ffd60a,#00c2ff,#7cff4f,#9b5cff,#ff2e93)}',
      '.fa-body{color:#6a2a7a;font-weight:600}',
    ),
  },
  {
    follow: { title: '{name} joined the colours', body: 'Happy Holi!' },
  },
)
