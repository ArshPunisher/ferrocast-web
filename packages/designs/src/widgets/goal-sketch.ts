// Sketch goal: Hand-drawn outline, hatched fill. The Spark is doodled in the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-sketch',
    name: 'Sketch goal',
    description: 'Drawn by hand: wobbly outlines and a hatched fill.',
    style: 'playful',
    motion: 'still',
  },
  'goal',
  { w: 600, h: 104 },
  live.goal(),
  {
    variant: 'sketch',
    accent: '#ff7eb6',
    track: '#ffffff',
    text: '#1d2b53',
    background: '#ffffff',
    radius: 12,
    font: 'Caveat Brush',
    brand: 'corner',
  },
)
