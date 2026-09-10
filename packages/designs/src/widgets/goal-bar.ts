// Molten goal bar: a slim track that fills with molten, the numbers in mono. The Spark sits in
// the bar's right end cap.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-molten',
    name: 'Molten goal bar',
    description: 'A slim molten fill with the count beside it.',
    style: 'bold',
    motion: 'smooth',
  },
  'goal',
  { w: 640, h: 72 },
  live.goal(),
  {
    variant: 'bar',
    accent: '#ffa424',
    track: '#16191e',
    text: '#eef0f4',
    radius: 10,
    brand: 'edge',
  },
)
