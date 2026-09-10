// Bracket label: Cyber brackets around mono caps. The Spark is a small hex badge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-bracket',
    name: 'Bracket label',
    description: 'HUD brackets on both ends and mono capitals.',
    style: 'tech',
    motion: 'still',
  },
  'label',
  { w: 460, h: 52 },
  live.label('latest_follower', 'New follower {value}'),
  {
    variant: 'bracket',
    accent: '#d4ff2a',
    text: '#e9fbe9',
    background: '#05070acc',
    font: 'Orbitron',
    uppercase: true,
    brand: 'badge',
  },
)
