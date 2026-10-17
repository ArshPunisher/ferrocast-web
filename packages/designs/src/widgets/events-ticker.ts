// Ticker events: A single-row ticker for the bottom of the screen. The Spark rides the right edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-ticker',
    name: 'Ticker events',
    description: 'One row of events for a bottom bar.',
    style: 'bold',
    motion: 'smooth',
  },
  'events',
  { w: 1200, h: 56 },
  live.events(),
  {
    variant: 'ticker',
    accent: '#ffa424',
    text: '#eef0f4',
    background: '#101216e6',
    font: 'Bricolage Grotesque',
    uppercase: true,
    brand: 'edge',
  },
)
