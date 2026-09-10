// Vinyl now playing: a record with grooves and a coloured label, the song in bold beside it
// on a glass strip. The Spark sits on the record's label.

import { box, brand, pattern, sceneDesign, text } from '../kit'

export default sceneDesign(
  {
    slug: 'now-playing-vinyl',
    name: 'Vinyl now playing',
    description: 'A record with grooves beside the song on a glass strip. Type your song.',
    style: 'minimal',
    motion: 'smooth',
    pro: true,
  },
  'Now playing',
  { w: 700, h: 200 },
  [
    box('strip', [90, 46, 590, 108], {
      shape: 'rect',
      fill: '#ffffff1f',
      fill2: '#ffffff0a',
      angle: 135,
      radius: 54,
      stroke: '#ffffff40',
      stroke_width: 1,
    }),
    box('record', [10, 10, 180, 180], {
      shape: 'ellipse',
      fill: '#111111',
      fill2: '#2a2a2a',
      angle: 135,
      shadow: 'soft',
    }),
    box('grooves', [10, 10, 180, 180], {
      shape: 'ellipse',
      pattern: 'rings',
      fill: '#ffffff14',
      pattern_scale: 0.3,
    }),
    box('label', [66, 66, 68, 68], {
      shape: 'ellipse',
      fill: '#ffb8f0',
      fill2: '#a8f0ff',
      angle: 135,
    }),
    brand([86, 86, 28, 28], 'mark', '#111111'),
    text('cap', [220, 58, 400, 26], {
      text: 'Now playing',
      font: 'Space Grotesk',
      size: 16,
      weight: 600,
      color: '#a8f0ff',
      uppercase: true,
      letter_spacing: 0.3,
    }),
    text('song', [220, 84, 440, 44], {
      text: 'midnight drive',
      font: 'Space Grotesk',
      size: 34,
      weight: 700,
      color: '#ffffff',
    }),
    text('artist', [220, 124, 400, 26], {
      text: 'your playlist',
      font: 'Space Grotesk',
      size: 18,
      weight: 400,
      color: '#e6e8ff',
    }),
    pattern('eq', [610, 70, 44, 60], 'eq', '#ffb8f0', { moving: true, scale: 0.45 }),
  ],
)
