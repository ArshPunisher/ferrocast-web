// Gold goal: Emerald plate, gold hairlines and a thin gold bar. The Spark is an ornament on the top edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-gold',
    name: 'Gold goal',
    description: 'A thin gold bar under spaced serif capitals. Quiet luxury.',
    style: 'minimal',
    motion: 'smooth',
  },
  'goal',
  { w: 600, h: 96 },
  live.goal(),
  {
    variant: 'gold',
    accent: '#d9b45a',
    track: '#ffffff14',
    text: '#f4efe3',
    background: '#071a14e6',
    radius: 0,
    font: 'Cinzel',
    uppercase: true,
    brand: 'divider',
  },
)
