// Minimal social rotator: no plate. A small caption, an accent rule and your handles in clean
// type with a soft shadow, swapping in turn. The Spark sits on the rule.

import { box, brand, rotator, sceneDesign, text } from '../kit'

export default sceneDesign(
  {
    slug: 'rotator-minimal',
    name: 'Minimal social rotator',
    description:
      'Clean type and an accent rule, your handles swapping in turn. Stays out of the way.',
    style: 'minimal',
    motion: 'smooth',
  },
  'Social rotator',
  { w: 640, h: 180 },
  [
    text('cap', [30, 40, 400, 30], {
      text: 'Follow along',
      font: 'Space Grotesk',
      size: 18,
      weight: 600,
      color: '#ffffff',
      uppercase: true,
      letter_spacing: 0.3,
      shadow: 'soft',
    }),
    box('rule', [30, 76, 80, 4], { shape: 'rect', fill: '#7ee0ff' }),
    brand([118, 64, 28, 28], 'mark', '#ffffff'),
    rotator(
      'handles',
      [30, 92, 590, 56],
      ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'],
      {
        font: 'Space Grotesk',
        size: 38,
        weight: 600,
        color: '#ffffff',
        shadow: 'soft',
        letter_spacing: -0.01,
      },
      5,
    ),
  ],
)
