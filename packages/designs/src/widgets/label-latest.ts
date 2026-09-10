// Latest follower tag: a small plate with a molten tab. The Spark is the tab's ornament.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-latest',
    name: 'Latest follower tag',
    description: 'A small plate with a molten tab for your newest follower.',
    style: 'minimal',
    motion: 'still',
  },
  'label',
  { w: 460, h: 64 },
  live.label('latest_follower', 'Latest follower: {value}'),
  {
    variant: 'tag',
    accent: '#ffa424',
    text: '#eef0f4',
    background: '#101216',
    radius: 10,
    brand: 'badge',
  },
)
