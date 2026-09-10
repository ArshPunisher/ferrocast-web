// Neon label: A neon-outlined sign. The Spark sits on the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-neon',
    name: 'Neon label',
    description: 'Dark glass with a glowing outline and glowing words.',
    style: 'bold',
    motion: 'still',
  },
  'label',
  { w: 440, h: 56 },
  live.label('latest_sub', 'Sub: {value}'),
  {
    variant: 'neon',
    accent: '#ff3ea5',
    text: '#fdf6ff',
    background: '#12052ee6',
    radius: 8,
    font: 'Audiowide',
    uppercase: true,
    brand: 'corner',
  },
)
