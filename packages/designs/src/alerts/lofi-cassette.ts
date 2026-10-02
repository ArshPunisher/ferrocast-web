// Lo-fi cassette: a cream cassette label with amber and rose stripes, the headline in an
// italic serif that types itself on, and a tape reel for the art that turns once. The
// Spark sits between two hairlines on the label, like a side marker.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'lofi-cassette',
    name: 'Lo-fi cassette',
    description:
      'A cream cassette label, an italic serif that types on and a tape reel that turns.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'none',
    layout: 'right',
    media_size: 130,
    font: font('Playfair Display', 46, 700, { italic: true }),
    colors: colors('#1a1526', '#c2552f', '#f6e7d0', '#ffb86b', '#1a1526'),
    shadow: 'none',
    anim: motion('fade', 'fade', 'type', 700, 500, 250),
    sound: { ref: null, builtin: 'chime', volume: 50 },
    duration_ms: 7000,
    brand: 'divider',
    css: css(
      '.f-none .fa-text{background:#f6e7d0;border-radius:16px;padding:40px 36px 20px;box-shadow:0 22px 44px -20px #000d,0 0 70px -20px #ffb86b66;min-width:420px}',
      '.fa-text::before{content:"";position:absolute;left:0;right:0;top:14px;height:12px;background:linear-gradient(180deg,#ffb86b 0 8px,#f6e7d0 8px 9px,#e8a3a0 9px 12px)}',
      '.fa-text::after{content:"SIDE A";position:absolute;right:20px;top:-2px;font:600 12px/1 "JetBrains Mono Variable",monospace;letter-spacing:.24em;color:#8a7a6a;background:#f6e7d0;padding:4px 6px;border-radius:4px}',
      '.fa-divider{color:#8a7a6a;margin:12px 0 4px}',
      '.fa-body{font-family:"JetBrains Mono Variable",monospace;font-size:17px;font-style:normal;letter-spacing:.04em;color:#4a3d52}',
      '.fa-media{border-radius:50%;background:#1a1526;box-shadow:0 0 0 6px #3d2f4d,0 18px 36px -16px #000c;animation:fc-reel 2.4s cubic-bezier(.3,.1,.3,1) .2s both}',
      '.fa-media::before{content:"";position:absolute;inset:16%;border-radius:50%;background:repeating-conic-gradient(#3d2f4d 0 20deg,#251f3a 20deg 60deg);z-index:1}',
      '.fa-media::after{content:"";position:absolute;inset:40%;border-radius:50%;background:#f6e7d0;box-shadow:0 0 0 4px #ffb86b;z-index:2}',
      '.fa-emblem{opacity:0}',
      '@keyframes fc-reel{from{transform:rotate(-300deg)}}',
    ),
  },
  {
    raid: { title: '{name} brought {viewers_text} up to the loft', duration_ms: 8000 },
    follow: { title: '{name} pulled up a chair' },
  },
)
