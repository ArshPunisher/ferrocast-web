// Event cards: recent supporters as stacked glass cards with a coloured edge per kind. The
// Spark is a faint watermark behind the list.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-cards',
    name: 'Event cards',
    description: 'Recent supporters as stacked cards with a coloured edge.',
    style: 'minimal',
    motion: 'smooth',
  },
  'events',
  { w: 400, h: 320 },
  live.events(),
  {
    variant: 'cards',
    accent: '#33d4ff',
    text: '#eef0f4',
    background: '#101216e6',
    radius: 12,
    brand: 'watermark',
  },
)
