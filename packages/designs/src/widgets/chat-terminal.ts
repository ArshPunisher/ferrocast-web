// Terminal chat: A console with scan lines. The Spark is a small badge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-terminal',
    name: 'Terminal chat',
    description: 'A console panel with mono lines and a prompt.',
    style: 'tech',
    motion: 'still',
  },
  'chat',
  { w: 500, h: 620 },
  live.chat(),
  {
    variant: 'terminal',
    accent: '#d4ff2a',
    text: '#e9fbe9',
    background: '#05070ae6',
    radius: 4,
    brand: 'badge',
  },
)
