// Flip-board countdown: two dark tiles split across the middle like a departure board, the
// numbers in mono capitals, a caption tab on top. The Spark is a badge on the tab.

import { box, brand, countdown, sceneDesign, text } from '../kit'

export default sceneDesign(
  {
    slug: 'timer-flip',
    name: 'Flip-board countdown',
    description: 'A departure-board countdown with split tiles. Starts when the source shows.',
    style: 'retro',
    motion: 'still',
  },
  'Countdown',
  { w: 720, h: 260 },
  [
    box('tab', [40, 20, 280, 50], { shape: 'rect', fill: '#ffd23f', radius: 8 }),
    text('cap', [56, 24, 240, 42], {
      text: 'Departing in',
      font: 'Oswald',
      size: 26,
      weight: 600,
      color: '#1a1a1a',
      uppercase: true,
      letter_spacing: 0.08,
    }),
    brand([280, 30, 30, 30], 'badge', '#1a1a1a'),
    box('board', [40, 70, 640, 170], {
      shape: 'rect',
      fill: '#1a1a1a',
      radius: 14,
      shadow: 'soft',
    }),
    box('tile-a', [60, 90, 290, 130], {
      shape: 'rect',
      fill: '#2b2b2b',
      fill2: '#202020',
      angle: 180,
      radius: 8,
    }),
    box('tile-b', [370, 90, 290, 130], {
      shape: 'rect',
      fill: '#2b2b2b',
      fill2: '#202020',
      angle: 180,
      radius: 8,
    }),
    countdown(
      'time',
      [60, 90, 600, 130],
      300,
      '{time}',
      {
        font: 'JetBrains Mono',
        size: 110,
        weight: 700,
        color: '#f5f5f5',
        align: 'center',
        letter_spacing: 0.1,
      },
      'Boarding',
    ),
    box('split', [60, 154, 600, 3], { shape: 'rect', fill: '#000000' }),
  ],
)
