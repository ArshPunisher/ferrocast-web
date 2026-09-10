// Ring countdown: a five-minute countdown inside a glowing ring with a dashed orbit. The
// Spark sits inside the ring under the numbers.

import { box, brand, countdown, enter, sceneDesign, text } from '../kit'

export default sceneDesign(
  {
    slug: 'timer-ring',
    name: 'Ring countdown',
    description: 'A five-minute countdown inside a glowing ring. Starts when the source shows.',
    style: 'tech',
    motion: 'smooth',
  },
  'Countdown',
  { w: 480, h: 480 },
  [
    box('disc', [40, 40, 400, 400], {
      shape: 'ellipse',
      fill: '#0a1028e6',
      fill2: '#03040be6',
      angle: 180,
    }),
    box('orbit', [20, 20, 440, 440], {
      shape: 'ellipse',
      stroke: '#1fd1c155',
      stroke_width: 2,
      ...enter('zoom', 0, 'pulse'),
    }),
    box('ring', [52, 52, 376, 376], {
      shape: 'ellipse',
      stroke: '#1fd1c1',
      stroke_width: 10,
      shadow: 'glow',
    }),
    text('cap', [90, 150, 300, 30], {
      text: 'Starting in',
      font: 'Space Grotesk',
      size: 22,
      weight: 600,
      color: '#bcd2ff',
      align: 'center',
      uppercase: true,
      letter_spacing: 0.3,
    }),
    countdown(
      'time',
      [70, 180, 340, 110],
      300,
      '{time}',
      { font: 'Bebas Neue', size: 110, weight: 400, color: '#eef6ff', align: 'center' },
      'Live',
    ),
    brand([226, 310, 28, 28], 'mark', '#1fd1c1'),
  ],
)
