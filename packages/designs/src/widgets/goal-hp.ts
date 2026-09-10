// Health bar goal: An RPG health bar in pixel type. The Spark is a coin-like badge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'goal-hp',
    name: 'Health bar goal',
    description: 'A retro health bar with stepped ends and a highlight row.',
    style: 'retro',
    motion: 'lively',
  },
  'goal',
  { w: 560, h: 110 },
  live.goal(),
  {
    variant: 'hp',
    accent: '#ff4d6d',
    track: '#3a1020',
    text: '#ffffff',
    background: '#14142b',
    radius: 0,
    font: 'Press Start 2P',
    uppercase: true,
    brand: 'badge',
  },
)
