// Quest log events: the Tavern quest timeline in wine red ink. The Spark sits in the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-quest-log',
    name: 'Quest log events',
    description: 'A quest log timeline: dark ink entries on parchment with wine red pins.',
    style: 'retro',
    motion: 'still',
  },
  'events',
  { w: 440, h: 320 },
  live.events(),
  {
    variant: 'timeline',
    accent: '#7a1f1a',
    text: '#2b1d10',
    background: '#efe0bb',
    radius: 4,
    font: 'Hanken Grotesk',
    brand: 'corner',
  },
)
