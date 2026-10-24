// Night Dunes: Calm dunes under a starry sky. Quiet type, a slow wave and plenty of room to breathe.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'night-dunes',
    name: 'Night Dunes',
    description:
      'Calm dunes under a starry sky. Quiet type, a slow wave and plenty of room to breathe. Eight screens.',
    style: 'minimal',
    motion: 'smooth',
  },
  preset: 'dunes',
  a: '#f2ead2',
  b: '#4b4a78',
  bg: '#060a1c',
  ink: '#f7f2e4',
  dim: '#c9c6dc',
  head: { font: 'Cinzel', weight: 700, effect: 'gradient', color2: '#9a98c8', spacing: 0.08 },
  timer: 'words',
  music: 'wave',
  layout: 'center',
  camFrame: { style: 'line', variant: 'circle', radius: 20 },
  sounds: { start: 'chime', zero: 'chime', loop: 'wind' },
  mark: [944, 70, 32, 32],
  speed: 0.7,
  density: 1,
  alert: 'builtin.minimal-lines',
})
