// Night Drive: A road into a neon city at night, the wave player glowing over it while your music plays. Starting soon is the board's combo B.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'night-drive',
    name: 'Night Drive',
    description:
      'A road into a neon city at night, the wave player glowing over it while your music plays. Eight screens.',
    style: 'retro',
    motion: 'smooth',
  },
  preset: 'nightdrive',
  a: '#ff3df0',
  b: '#33d4ff',
  bg: '#090418',
  ink: '#ffffff',
  dim: '#d9c8ff',
  head: { font: 'Monoton', weight: 400, effect: 'chrome', color2: '#33d4ff', spacing: 0.02 },
  timer: 'thin',
  music: 'wave',
  layout: 'panel',
  camFrame: { style: 'glow', radius: 18, label: 'On air' },
  sounds: { start: 'whoosh', zero: 'impact', loop: 'pad' },
  mark: [944, 1028, 32, 32],
  speed: 1,
  density: 1,
  alert: 'builtin.rewind-vhs',
})
