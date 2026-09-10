// Neon social rotator: a dark pill with a glowing outline; your handles swap in turn with a
// short lift. The Spark is the little dot at the pill's end, like a live light.

import { box, brand, enter, rotator, sceneDesign, text } from '../kit'

export default sceneDesign(
  {
    slug: 'rotator-neon',
    name: 'Neon social rotator',
    description: 'Your handles in a glowing pill, one after another. Add it as its own source.',
    style: 'bold',
    motion: 'smooth',
  },
  'Social rotator',
  { w: 760, h: 180 },
  [
    box('pill', [20, 50, 720, 80], {
      shape: 'rect',
      fill: '#12052ee6',
      radius: 40,
      stroke: '#ff3ea5',
      stroke_width: 3,
      shadow: 'glow',
      ...enter('zoom', 0),
    }),
    box('icon', [36, 62, 56, 56], {
      shape: 'ellipse',
      fill: '#ff3ea5',
      fill2: '#2de2e6',
      angle: 135,
    }),
    text('at', [36, 62, 56, 56], {
      text: '@',
      font: 'Audiowide',
      size: 30,
      weight: 400,
      color: '#12052e',
      align: 'center',
    }),
    rotator(
      'handles',
      [110, 62, 560, 56],
      ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname', 'discord.gg/yourname'],
      { font: 'Audiowide', size: 30, weight: 400, color: '#fdf6ff', shadow: 'glow' },
      4,
    ),
    brand([684, 76, 28, 28], 'badge', '#2de2e6'),
  ],
)
