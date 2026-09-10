// Chevron goal: A slanted esports bar, striped fill, italic caps. The Spark sits in a notch on the top edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-chevron',
    name: 'Chevron goal',
    description: 'A slanted esports bar with a striped fill and italic capitals.',
    style: 'bold',
    motion: 'lively',
  },
  'goal',
  { w: 620, h: 96 },
  live.goal(),
  {
    variant: 'chevron',
    accent: '#ff2a1f',
    track: '#2a2d34',
    text: '#f5f5f5',
    background: '#0c0d10f0',
    font: 'Russo One',
    uppercase: true,
    brand: 'notch',
  },
)
