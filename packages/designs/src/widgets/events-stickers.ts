// Sticker events: Tilted sticker cards. The Spark sits on the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-stickers',
    name: 'Sticker events',
    description: 'Little tilted cards with ink edges.',
    style: 'playful',
    motion: 'bouncy',
  },
  'events',
  { w: 380, h: 340 },
  live.events(),
  {
    variant: 'stickers',
    accent: '#ff5fa8',
    text: '#5a3d5c',
    background: '#ffffff',
    radius: 14,
    font: 'Fredoka',
    brand: 'corner',
  },
)
