// Glass chat: Clear glass cards. The Spark is a faint watermark.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-glass',
    name: 'Glass chat',
    description: 'Clear cards with a bright top edge, airy and calm.',
    style: 'minimal',
    motion: 'smooth',
  },
  'chat',
  { w: 480, h: 640 },
  live.chat(),
  {
    variant: 'glass',
    accent: '#a8f0ff',
    text: '#ffffff',
    background: '#0e0f1a',
    radius: 18,
    font: 'Space Grotesk',
    brand: 'watermark',
  },
)
