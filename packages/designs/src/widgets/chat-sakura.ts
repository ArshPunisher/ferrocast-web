// Sakura chat: blush bubbles from the Sakura bloom theme. The Spark sits on the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-sakura',
    name: 'Sakura chat',
    description: 'Blush speech bubbles with plum words, soft and round.',
    style: 'cozy',
    motion: 'smooth',
  },
  'chat',
  { w: 480, h: 640 },
  live.chat(),
  {
    variant: 'speech',
    accent: '#d6457a',
    text: '#4a2342',
    background: '#ffe9f0',
    radius: 20,
    font: 'Hanken Grotesk',
    brand: 'corner',
  },
)
