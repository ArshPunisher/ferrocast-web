// Chip label: A pill with a glowing dot. The Spark sits on the right edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-chip',
    name: 'Chip label',
    description: 'A pill with a glowing status dot. Small and tidy.',
    style: 'minimal',
    motion: 'still',
  },
  'label',
  { w: 420, h: 56 },
  live.label('latest_follower', 'Latest  {value}'),
  {
    variant: 'chip',
    accent: '#33d4ff',
    text: '#eef0f4',
    background: '#101216e6',
    radius: 28,
    brand: 'edge',
  },
)
