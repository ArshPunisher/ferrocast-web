// Speech chat: Speech bubbles with tails. The Spark sits on the corner.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-speech',
    name: 'Speech chat',
    description: 'Speech bubbles with tails, the name above the words.',
    style: 'cozy',
    motion: 'smooth',
  },
  'chat',
  { w: 480, h: 640 },
  live.chat(),
  {
    variant: 'speech',
    accent: '#ffb35c',
    text: '#fff3e0',
    background: '#173039',
    radius: 18,
    brand: 'corner',
  },
)
