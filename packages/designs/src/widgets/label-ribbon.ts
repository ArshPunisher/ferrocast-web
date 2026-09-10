// Ribbon label: A notched ribbon banner. The Spark sits in a notch above it.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-ribbon',
    name: 'Ribbon label',
    description: 'A banner with notched ends, bold and centred.',
    style: 'bold',
    motion: 'still',
  },
  'label',
  { w: 460, h: 60 },
  live.label('latest_sub', 'New sub {value}'),
  {
    variant: 'ribbon',
    accent: '#e0218a',
    text: '#fff4e0',
    font: 'Baloo 2',
    brand: 'notch',
  },
)
