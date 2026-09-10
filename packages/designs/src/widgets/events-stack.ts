// Stack events: Newest event large over an accent rule. The Spark sits in a notch on top.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-stack',
    name: 'Stack events',
    description: 'The newest is big, older ones step back.',
    style: 'minimal',
    motion: 'smooth',
  },
  'events',
  { w: 400, h: 300 },
  live.events(),
  {
    variant: 'stack',
    accent: '#ffb8f0',
    text: '#ffffff',
    font: 'Space Grotesk',
    brand: 'corner',
  },
)
