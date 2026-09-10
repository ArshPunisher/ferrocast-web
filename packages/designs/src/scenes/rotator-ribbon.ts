// Ribbon social rotator: a red ribbon with folded tails; handles change in the middle in tall
// capitals. The Spark is a small badge pinned to the ribbon's end.

import { box, brand, cut, rotator, sceneDesign } from '../kit'

export default sceneDesign(
  {
    slug: 'rotator-ribbon',
    name: 'Ribbon social rotator',
    description: 'A folded ribbon banner with your handles changing in the middle.',
    style: 'retro',
    motion: 'smooth',
  },
  'Social rotator',
  { w: 800, h: 180 },
  [
    cut('tail-l', [20, 70, 120, 70], 'ribbon', { fill: '#8e0d24' }),
    cut('tail-r', [660, 70, 120, 70], 'ribbon', { fill: '#8e0d24' }),
    box('fold-l', [100, 120, 40, 20], { shape: 'triangle', fill: '#4a0612' }, { rotation: 180 }),
    box('fold-r', [660, 120, 40, 20], { shape: 'triangle', fill: '#4a0612' }, { rotation: 180 }),
    box('band', [100, 40, 600, 84], {
      shape: 'rect',
      fill: '#e01e3c',
      fill2: '#b3122e',
      angle: 180,
      shadow: 'soft',
    }),
    rotator(
      'handles',
      [120, 44, 560, 76],
      ['TWITCH.TV/YOURNAME', 'YOUTUBE @YOURNAME', 'X @YOURNAME', 'DISCORD.GG/YOURNAME'],
      {
        font: 'Bebas Neue',
        size: 52,
        weight: 400,
        color: '#fff6e8',
        align: 'center',
        letter_spacing: 0.06,
      },
      4,
    ),
    brand([666, 30, 30, 30], 'badge', '#ffd166'),
  ],
)
