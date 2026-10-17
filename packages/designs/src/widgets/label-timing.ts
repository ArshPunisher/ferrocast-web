// Timing label: a Pit wall tower row. The Spark sits on the divider.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-timing',
    name: 'Timing label',
    description: 'A timing tower row: carbon, a red edge and italic capitals.',
    style: 'tech',
    motion: 'still',
  },
  'label',
  { w: 440, h: 56 },
  live.label('latest_sub', 'P1  {value}'),
  {
    variant: 'tag',
    accent: '#e10600',
    text: '#f5f5f7',
    background: '#15161be6',
    radius: 2,
    font: 'Oswald',
    font_size: 26,
    uppercase: true,
    brand: 'divider',
  },
)
