// Hazard label: the Glitch district tag. The Spark rides the far edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-hazard',
    name: 'Hazard label',
    description: 'A black tag with an acid yellow edge and blocky capitals.',
    style: 'bold',
    motion: 'still',
  },
  'label',
  { w: 440, h: 58 },
  live.label('latest_follower', 'Follow: {value}'),
  {
    variant: 'tag',
    accent: '#fcee0a',
    text: '#f4f4f6',
    background: '#09090ee6',
    radius: 0,
    font: 'Russo One',
    uppercase: true,
    brand: 'edge',
  },
)
