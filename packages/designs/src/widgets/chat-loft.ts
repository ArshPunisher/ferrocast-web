// Loft chat: warm plates from the Lo-fi loft theme. The Spark is a small badge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-loft',
    name: 'Loft chat',
    description: 'Warm plates on a plum night, cream words and an amber edge.',
    style: 'cozy',
    motion: 'smooth',
  },
  'chat',
  { w: 480, h: 640 },
  live.chat(),
  {
    variant: 'plates',
    accent: '#ffb86b',
    text: '#f6e7d0',
    background: '#2a2340',
    radius: 14,
    font: 'Hanken Grotesk',
    brand: 'badge',
  },
)
