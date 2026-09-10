// Cassette now playing: a little tape with two reels and a handwritten label for the song,
// music bars bouncing beside it. The Spark is printed on the tape's label.

import { box, brand, pattern, sceneDesign, text } from '../kit'

export default sceneDesign(
  {
    slug: 'now-playing-cassette',
    name: 'Cassette now playing',
    description:
      'A little cassette with a handwritten song label and bouncing music bars. Type your song.',
    style: 'cozy',
    motion: 'lively',
  },
  'Now playing',
  { w: 700, h: 200 },
  [
    box('card', [10, 10, 680, 180], { shape: 'rect', fill: '#173039e6', radius: 26 }),
    box('tape', [30, 34, 190, 132], {
      shape: 'rect',
      fill: '#e8d8c3',
      fill2: '#cbb393',
      angle: 180,
      radius: 12,
    }),
    box('label', [44, 46, 162, 34], { shape: 'rect', fill: '#ffb35c', radius: 4 }),
    brand([174, 49, 28, 28], 'mark', '#3b2410'),
    box('window', [62, 92, 126, 48], { shape: 'rect', fill: '#2a1d16', radius: 24 }),
    box('reel-a', [70, 98, 36, 36], {
      shape: 'ellipse',
      fill: '#e8d8c3',
      stroke: '#2a1d16',
      stroke_width: 8,
    }),
    box('reel-b', [144, 98, 36, 36], {
      shape: 'ellipse',
      fill: '#e8d8c3',
      stroke: '#2a1d16',
      stroke_width: 8,
    }),
    text('cap', [244, 44, 330, 28], {
      text: 'Now playing',
      font: 'Hanken Grotesk',
      size: 18,
      weight: 700,
      color: '#9fc4b8',
      uppercase: true,
      letter_spacing: 0.14,
    }),
    text('song', [244, 72, 380, 52], {
      text: 'rain on the window',
      font: 'Caveat',
      size: 42,
      weight: 700,
      color: '#fff3e0',
    }),
    text('artist', [244, 124, 330, 30], {
      text: 'your playlist',
      font: 'Hanken Grotesk',
      size: 20,
      weight: 500,
      color: '#cfe3dc',
    }),
    pattern('eq', [600, 60, 60, 80], 'eq', '#ffb35c', { moving: true, scale: 0.5 }),
  ],
)
