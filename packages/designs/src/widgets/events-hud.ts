// HUD events: A terminal-style log. The Spark is a small badge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'events-hud',
    name: 'HUD events',
    description: 'Mono rows with a bracket and dashed rules, like a log.',
    style: 'tech',
    motion: 'still',
  },
  'events',
  { w: 400, h: 300 },
  live.events(),
  {
    variant: 'hud',
    accent: '#19f0ff',
    text: '#e9fbe9',
    background: '#05070a',
    font: 'Orbitron',
    uppercase: true,
    brand: 'badge',
  },
)
