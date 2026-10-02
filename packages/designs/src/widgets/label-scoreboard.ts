// Scoreboard label: the Floodlight board stub. The Spark sits in a notch.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-scoreboard',
    name: 'Scoreboard label',
    description: 'A black stub with an amber LED edge and tall stadium capitals.',
    style: 'bold',
    motion: 'still',
  },
  'label',
  { w: 480, h: 60 },
  live.label('latest_follower', 'New fan: {value}'),
  {
    variant: 'ticket',
    accent: '#ffc21a',
    text: '#ffffff',
    background: '#0b0c0ee6',
    radius: 4,
    font: 'Bebas Neue',
    font_size: 30,
    uppercase: true,
    brand: 'notch',
  },
)
