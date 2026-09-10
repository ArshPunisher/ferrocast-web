// Underline label: Words with an accent rule underneath. The Spark sits small above.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-underline',
    name: 'Underline label',
    description: 'No plate: clean words with a thick accent rule under them.',
    style: 'minimal',
    motion: 'still',
  },
  'label',
  { w: 420, h: 60 },
  live.label('latest_follower', 'Latest: {value}'),
  {
    variant: 'underline',
    accent: '#7ee0ff',
    text: '#ffffff',
    font: 'Space Grotesk',
    brand: 'divider',
  },
)
