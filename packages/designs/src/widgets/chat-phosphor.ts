// Phosphor chat: the Phosphor terminal log. The Spark is a faint watermark.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-phosphor',
    name: 'Phosphor chat',
    description: 'Green phosphor lines in VT323, like a chat log on an old monitor.',
    style: 'retro',
    motion: 'still',
  },
  'chat',
  { w: 480, h: 640 },
  live.chat(),
  {
    variant: 'terminal',
    accent: '#39ff6a',
    text: '#39ff6a',
    background: '#04140a',
    font: 'VT323',
    font_size: 22,
    brand: 'watermark',
  },
)
