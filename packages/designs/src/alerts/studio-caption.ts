// Studio caption: an off-white card with a hairline border wipes in from the left like a
// broadcast caption. Light graphite type, a small red rule above the headline and a mono
// caption underneath. Nothing shouts. The Spark is a faint watermark at the right.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'studio-caption',
    name: 'Studio caption',
    description: 'A quiet off-white caption card: light graphite type, a red rule and a mono line.',
    style: 'minimal',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'left',
    media_size: 104,
    font: font('Hanken Grotesk', 42, 400, { letter_spacing: -0.02 }),
    colors: colors('#1c1d20', '#e0482f', '#f4f2ee', '#e0482f', '#1c1d20'),
    shadow: 'none',
    anim: motion('wipe', 'fade', 'none', 700, 450, 200),
    sound: { ref: null, builtin: 'chime', volume: 40 },
    duration_ms: 6500,
    brand: 'watermark',
    css: css(
      '.fa{gap:16px}',
      '.f-plate .fa-text{background:#f4f2ee;border:1px solid #d3cec5;border-radius:20px;padding:44px 64px 24px 32px;min-width:420px;box-shadow:0 24px 50px -26px #0009}',
      '.fa-text::before{content:"";position:absolute;left:32px;top:26px;width:44px;height:3px;background:#e0482f;transform-origin:left;animation:fc-rule .6s cubic-bezier(.2,.8,.2,1) .5s both}',
      '@keyframes fc-rule{from{transform:scaleX(0)}}',
      '.fa-title{line-height:1.12}',
      '.fa-title .hl{font-weight:600;color:#1c1d20;box-shadow:inset 0 -.12em #e0482f66}',
      '.fa-body{font-family:"JetBrains Mono Variable",monospace;font-size:15px;font-weight:500;text-transform:uppercase;letter-spacing:.16em;color:#77736b;opacity:1;margin-top:14px}',
      '.f-plate .fa-media{border-radius:18px;box-shadow:0 0 0 1px #d3cec5;background:#ffffff}',
      '.fa-emblem{background:#ffffff;color:#1c1d20}',
      '.fa-emblem svg{width:38%;height:38%;filter:none}',
      '.fa-spark.spot-watermark{color:#1c1d20;opacity:.06}',
    ),
  },
  {
    raid: { title: '{name} joined with {viewers_text}', duration_ms: 7500 },
  },
)
