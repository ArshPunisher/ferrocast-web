// Candy goal: Candy stripes in a white outline. The Spark is a round badge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-candy',
    name: 'Candy goal',
    description: 'Two-tone candy stripes inside a soft white outline. Sweet.',
    style: 'playful',
    motion: 'bouncy',
  },
  'goal',
  { w: 600, h: 100 },
  live.goal(),
  {
    variant: 'candy',
    accent: '#ff5fa8',
    track: '#ffe3f0',
    text: '#5a3d5c',
    background: '#ffffff',
    radius: 26,
    font: 'Fredoka',
    brand: 'badge',
  },
)
