// Top tip ticker: the night's top tip in a slanted bar, esports style. The Spark rides the
// bar's angled end.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-top',
    name: 'Top tip ticker',
    description: 'The night’s top tip in a slanted bar.',
    style: 'bold',
    motion: 'still',
  },
  'label',
  { w: 520, h: 64 },
  live.label('top_tip_session', 'Top tip: {value}'),
  {
    variant: 'ticker',
    accent: '#ffd23f',
    text: '#ffffff',
    background: '#d9142f',
    radius: 4,
    uppercase: true,
    brand: 'edge',
  },
)
