// Orbit: A warm planet with moons on slow orbits and a starfield that drifts with your music.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'orbit',
    name: 'Orbit',
    description:
      'A warm planet with moons on slow orbits and a starfield that drifts with your music. Eight screens.',
    style: 'playful',
    motion: 'smooth',
  },
  preset: 'orbit',
  a: '#ffb070',
  b: '#8ab4ff',
  bg: '#04040a',
  ink: '#fff1e4',
  dim: '#d6c8bb',
  head: { font: 'Righteous', weight: 400, effect: 'gradient', color2: '#ff7a59', spacing: 0 },
  timer: 'ring',
  music: 'pulse',
  layout: 'center',
  camFrame: { style: 'line', variant: 'circle', radius: 24 },
  sounds: { start: 'whoosh', zero: 'chime', loop: 'pad' },
  mark: [240, 40, 32, 32],
  speed: 0.8,
  density: 1,
  alert: 'builtin.marquee-bulbs',
})
