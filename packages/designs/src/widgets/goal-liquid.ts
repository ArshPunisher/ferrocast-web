// Liquid goal: A glossy tube with a bright meniscus. The Spark rides the right edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-liquid',
    name: 'Liquid goal',
    description: 'A fat glossy tube that fills like a drink, the numbers in the accent.',
    style: 'cozy',
    motion: 'smooth',
  },
  'goal',
  { w: 600, h: 100 },
  live.goal(),
  {
    variant: 'liquid',
    accent: '#ffb35c',
    track: '#0b1a1f',
    text: '#fff3e0',
    background: '#173039e6',
    radius: 22,
    font: 'Fredoka',
    brand: 'badge',
  },
)
