// Ring goal: A circular meter beside the title. The Spark rides the right edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-ring',
    name: 'Ring goal',
    description: 'A round meter beside the title, in a soft pill.',
    style: 'minimal',
    motion: 'smooth',
    pro: true,
  },
  'goal',
  { w: 440, h: 96 },
  live.goal(),
  {
    variant: 'ring',
    accent: '#ffb8f0',
    track: '#ffffff26',
    text: '#ffffff',
    background: '#16182ee6',
    radius: 48,
    font: 'Space Grotesk',
    brand: 'edge',
  },
)
