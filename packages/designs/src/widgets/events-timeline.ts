// Timeline events: A rail with dots; the newest dot is bigger. The Spark is a faint watermark.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-timeline',
    name: 'Timeline events',
    description: 'A rail with a dot for every event, no plates.',
    style: 'minimal',
    motion: 'smooth',
  },
  'events',
  { w: 380, h: 300 },
  live.events(),
  {
    variant: 'timeline',
    accent: '#1fd1c1',
    text: '#eef6ff',
    font: 'Space Grotesk',
    brand: 'watermark',
  },
)
