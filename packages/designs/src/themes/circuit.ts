// Circuit: Green signals racing along a circuit board, pulsing brighter with the music.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'circuit',
    name: 'Circuit',
    description:
      'Green signals racing along a circuit board, pulsing brighter with the music. Eight screens.',
    style: 'tech',
    motion: 'smooth',
  },
  preset: 'circuit',
  a: '#5dffc0',
  b: '#33d4ff',
  bg: '#04110d',
  ink: '#e6fff5',
  dim: '#9fd8c2',
  head: {
    font: 'Silkscreen',
    weight: 700,
    effect: 'glitch',
    color2: '#33d4ff',
    uppercase: true,
    spacing: 0.06,
  },
  timer: 'flip',
  music: 'pulse',
  layout: 'center',
  camFrame: { style: 'corners', label: 'Online' },
  sounds: { start: 'glitch', zero: 'chime', loop: 'hum' },
  mark: [1850, 940, 32, 32],
  speed: 1,
  density: 1,
  alert: 'builtin.lower-third',
})
