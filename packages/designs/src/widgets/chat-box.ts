// Chat bubbles: each message on its own rounded plate with the name in the viewer's colour.
// The Spark sits on the panel's bottom edge.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'chat-bubbles',
    name: 'Chat bubbles',
    description: 'Every message on its own plate, easy to read over any game.',
    style: 'cozy',
    motion: 'smooth',
  },
  'chat',
  { w: 520, h: 640 },
  live.chat(),
  {
    variant: 'plates',
    accent: '#ffa424',
    text: '#eef0f4',
    background: '#101216e6',
    radius: 14,
    brand: 'edge',
  },
)
