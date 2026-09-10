// Segment goal: the goal as ten blocks that light up, arcade style. The Spark is a small
// corner badge on the frame.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-segments',
    name: 'Segment goal',
    description: 'Ten blocks that light up as you get closer.',
    style: 'retro',
    motion: 'lively',
  },
  'goal',
  { w: 640, h: 80 },
  live.goal(),
  {
    variant: 'segments',
    accent: '#ffd23f',
    track: '#2a1446',
    text: '#fff7c2',
    radius: 0,
    font: 'JetBrains Mono',
    uppercase: true,
    brand: 'corner',
  },
)
