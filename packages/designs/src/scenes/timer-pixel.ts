// Pixel loading countdown: an 8-bit LOADING line counting down over a stepped bar with
// drifting pixels. The Spark is a coin at the end of the bar.

import { brand, countdown, cut, pattern, sceneDesign } from '../kit'

export default sceneDesign(
  {
    slug: 'timer-pixel',
    name: 'Pixel loading countdown',
    description: 'An 8-bit LOADING countdown over a stepped bar. Starts when the source shows.',
    style: 'retro',
    motion: 'lively',
  },
  'Countdown',
  { w: 680, h: 200 },
  [
    cut('panel', [20, 20, 640, 160], 'steps', { fill: '#14142b' }),
    countdown(
      'time',
      [50, 40, 580, 60],
      300,
      'LOADING {time}',
      { font: 'Press Start 2P', size: 30, weight: 400, color: '#ffd23f', align: 'center' },
      'READY!',
    ),
    cut('bar', [60, 116, 520, 36], 'steps', { fill: '#3fb950' }),
    pattern('bar-px', [60, 116, 520, 36], 'pixels', '#ffffff', {
      moving: true,
      scale: 0.4,
      clip: 'steps',
    }),
    brand([598, 118, 32, 32], 'badge', '#ffd23f'),
  ],
)
