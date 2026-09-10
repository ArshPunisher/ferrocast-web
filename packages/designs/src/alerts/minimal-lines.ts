// Minimal lines: no plate at all. Clean white type with a soft shadow, a hairline that draws
// across, the name in the accent. For streamers who want the game to stay the star. The
// Spark sits between two hairlines.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'minimal-lines',
    name: 'Minimal lines',
    description: 'No plate: clean type, a hairline that draws across, the name in one accent.',
    style: 'minimal',
    motion: 'smooth',
  },
  {
    frame: 'none',
    layout: 'text',
    media_size: 100,
    font: font('Space Grotesk', 48, 600, { letter_spacing: -0.02 }),
    colors: colors('#ffffff', '#7ee0ff', '#00000000', '#ffffff', '#000000'),
    shadow: 'soft',
    anim: motion('wipe', 'fade', 'none', 700, 400, 200),
    sound: { ref: null, builtin: 'chime', volume: 45 },
    duration_ms: 6000,
    brand: 'divider',
    css: css(
      '.f-none .fa-text{padding:10px 0}',
      '.fa-title{text-shadow:0 2px 2px #000000e6,0 0 18px #00000080}',
      '.fa-body{text-transform:uppercase;letter-spacing:.24em;font-size:16px;font-weight:600;text-shadow:0 1px 2px #000000e6}',
      '.fa-divider{margin:14px 0 10px;color:#ffffff}',
      '.fa-divider::before,.fa-divider::after{opacity:.75;transform-origin:center;animation:fc-line .8s cubic-bezier(.2,.8,.2,1) .4s both}',
      '@keyframes fc-line{from{transform:scaleX(0)}}',
    ),
  },
)
