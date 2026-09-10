// Ruler goal: Minimal: a hairline track with tick marks, the numbers large. The Spark is a faint watermark.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-ticks',
    name: 'Ruler goal',
    description: 'No plate: a hairline with a ruler under it and big numbers.',
    style: 'minimal',
    motion: 'still',
  },
  'goal',
  { w: 560, h: 80 },
  live.goal(),
  {
    variant: 'ticks',
    accent: '#ffffff',
    track: '#ffffff40',
    text: '#ffffff',
    muted: '#e6e8ee',
    font: 'Space Grotesk',
    brand: 'corner',
  },
)
