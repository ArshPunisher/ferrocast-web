// Bubble goal: the Chrome bubble pill. The Spark is a small badge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-bubble',
    name: 'Bubble goal',
    description: 'A glossy white pill with a magenta fill, Y2K style.',
    style: 'playful',
    motion: 'smooth',
  },
  'goal',
  { w: 600, h: 100 },
  live.goal(),
  {
    variant: 'liquid',
    accent: '#ff3fc8',
    track: '#dfe4ff',
    text: '#1d1546',
    background: '#ffffffd9',
    radius: 32,
    font: 'Righteous',
    brand: 'badge',
  },
)
