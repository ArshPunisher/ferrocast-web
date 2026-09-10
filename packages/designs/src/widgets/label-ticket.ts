// Ticket label: An admission stub. The Spark is a faint watermark on the paper.

import { live, widgetDesign } from '../kit'

export default widgetDesign(
  {
    slug: 'label-ticket',
    name: 'Ticket label',
    description: 'A ticket stub with bites out of the ends and a perforation.',
    style: 'retro',
    motion: 'still',
    pro: true,
  },
  'label',
  { w: 460, h: 60 },
  live.label('top_tip_session', 'Top tip {value}'),
  {
    variant: 'ticket',
    accent: '#d7263d',
    text: '#2b1a12',
    background: '#ffe7b8',
    radius: 6,
    font: 'Bebas Neue',
    font_size: 30,
    brand: 'watermark',
  },
)
