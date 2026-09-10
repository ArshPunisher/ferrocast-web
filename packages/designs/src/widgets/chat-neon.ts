// Neon chat: A neon bar beside each message. The Spark rides the edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-neon',
    name: 'Neon chat',
    description: 'A glowing bar beside every line, names that glow.',
    style: 'bold',
    motion: 'smooth',
  },
  'chat',
  { w: 480, h: 640 },
  live.chat(),
  {
    variant: 'neon',
    accent: '#2de2e6',
    text: '#fdf6ff',
    background: '#0b0221d9',
    radius: 8,
    brand: 'edge',
  },
)
