// Kraft label: the Café corner paper tag. The Spark sits on the tag's edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-kraft',
    name: 'Kraft tag label',
    description: 'A kraft paper tag with espresso brown words and a sage notch.',
    style: 'cozy',
    motion: 'still',
  },
  'label',
  { w: 440, h: 60 },
  live.label('latest_follower', 'New regular: {value}'),
  {
    variant: 'tag',
    accent: '#7d9a7a',
    text: '#3b2417',
    background: '#dcbf94',
    radius: 6,
    font: 'Hanken Grotesk',
    brand: 'edge',
  },
)
