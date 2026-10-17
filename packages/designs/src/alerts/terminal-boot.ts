// Terminal boot: a green-screen window opens with a title bar, the headline types itself
// out in glowing VT323 with a block cursor after it, the amount in warning amber, scan
// lines over the glass. The Spark sits in the window's corner like a system icon.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'terminal-boot',
    name: 'Terminal boot',
    description: 'A green-screen window: the headline types out in phosphor with a block cursor.',
    style: 'retro',
    motion: 'still',
  },
  {
    frame: 'pixel',
    layout: 'text',
    media_size: 100,
    font: font('VT323', 60, 400, { uppercase: true, letter_spacing: 0.02 }),
    colors: colors('#39ff6a', '#ffb000', '#04140a', '#1f9a45', '#000000'),
    shadow: 'none',
    anim: motion('fade', 'fade', 'type', 300, 300, 200),
    sound: { ref: null, builtin: 'coin', volume: 55 },
    duration_ms: 7000,
    brand: 'corner',
    css: css(
      '.f-pixel .fa-text{background:linear-gradient(180deg,#073017,#04140a);border:3px solid #1f9a45;border-radius:14px;box-shadow:0 0 0 6px #121512,0 0 40px -6px #39ff6a55;padding:58px 40px 24px;min-width:460px}',
      '.fa-text::before{content:"> incoming_event.log";position:absolute;left:0;right:0;top:0;height:38px;padding:7px 18px;font:400 26px/1 "VT323",monospace;letter-spacing:.06em;color:#04140a;background:#1f9a45}',
      '.fa-text::after{content:"";position:absolute;inset:38px 0 0;border-radius:0 0 12px 12px;background:repeating-linear-gradient(180deg,#00000055 0 2px,transparent 2px 5px);pointer-events:none}',
      '.fa-title{text-shadow:0 0 12px #39ff6aaa}',
      '.fa-title::after{content:"";display:inline-block;width:.45em;height:.8em;margin-left:.12em;vertical-align:-.05em;background:#39ff6a;box-shadow:0 0 10px #39ff6a;animation:fc-blink 1s steps(2) 1.2s 4}',
      '@keyframes fc-blink{50%{opacity:0}}',
      '.fa-title .hl{text-shadow:0 0 12px #ffb000aa}',
      '.fa-body{font-family:"VT323",monospace;font-size:30px;color:#b8ffcb;opacity:1}',
      '.fa-body::before{content:"$ ";color:#1f9a45}',
      '.fa-spark.spot-corner{right:12px;top:6px;width:26px;height:26px;filter:none;color:#04140a;z-index:2}',
    ),
  },
  {
    raid: { title: 'Raid detected: {name} + {viewers_text}', duration_ms: 8000 },
  },
)
