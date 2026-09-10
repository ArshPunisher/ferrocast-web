// Notebook chat: A ruled page with a margin line. The Spark sits in a notch on top.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-paper',
    name: 'Notebook chat',
    description: 'A ruled notebook page, names highlighted in marker.',
    style: 'playful',
    motion: 'still',
    pro: true,
  },
  'chat',
  { w: 500, h: 640 },
  live.chat(),
  {
    variant: 'paper',
    accent: '#ffe14d',
    text: '#1d2b53',
    background: '#ffffff',
    radius: 6,
    font: 'Caveat',
    font_size: 26,
    brand: 'notch',
  },
)
