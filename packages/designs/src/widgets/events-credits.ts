// Credits events: the Brutal mono credits list. The Spark sits on the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-credits',
    name: 'Credits events',
    description: 'Paper cards with black mono capitals and one signal orange edge.',
    style: 'minimal',
    motion: 'still',
  },
  'events',
  { w: 420, h: 320 },
  live.events(),
  {
    variant: 'cards',
    accent: '#ff3b00',
    text: '#0a0a0a',
    background: '#f2f0eb',
    radius: 0,
    font: 'JetBrains Mono',
    uppercase: true,
    brand: 'corner',
  },
)
