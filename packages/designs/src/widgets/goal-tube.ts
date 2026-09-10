// Neon tube goal: A neon outline with a glowing fill. The Spark is a small mark on the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-tube',
    name: 'Neon tube goal',
    description: 'An outlined glass tube with a glowing fill, for dark scenes.',
    style: 'tech',
    motion: 'smooth',
  },
  'goal',
  { w: 600, h: 92 },
  live.goal(),
  {
    variant: 'tube',
    accent: '#2de2e6',
    track: '#12052e',
    text: '#fdf6ff',
    background: '#0b0221d9',
    radius: 8,
    font: 'Audiowide',
    uppercase: true,
    brand: 'corner',
  },
)
