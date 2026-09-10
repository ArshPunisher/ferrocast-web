// Sticker label: A tilted white sticker with an ink edge. The Spark is doodled on the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-sticker',
    name: 'Sticker label',
    description: 'A white sticker with a thick ink edge and a little tilt.',
    style: 'playful',
    motion: 'still',
  },
  'label',
  { w: 420, h: 60 },
  live.label('latest_follower', 'new pal: {value}'),
  {
    variant: 'sticker',
    accent: '#ff7eb6',
    text: '#1d2b53',
    background: '#ffffff',
    radius: 12,
    font: 'Caveat Brush',
    font_size: 28,
    brand: 'corner',
  },
)
