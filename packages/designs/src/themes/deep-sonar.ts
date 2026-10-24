// Deep Sonar: Sonar rings pinging through deep water, a calm blue world that pulses with the beat.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'deep-sonar',
    name: 'Deep Sonar',
    description:
      'Sonar rings pinging through deep water, a calm blue world that pulses with the beat. Eight screens.',
    style: 'minimal',
    motion: 'smooth',
  },
  preset: 'sonar',
  a: '#50dcff',
  b: '#a0f0ff',
  bg: '#010a10',
  ink: '#dff8ff',
  dim: '#9cc8d8',
  head: {
    font: 'Oswald',
    weight: 600,
    effect: 'neon',
    color2: '#a0f0ff',
    uppercase: true,
    spacing: 0.1,
  },
  timer: 'thin',
  music: 'pulse',
  layout: 'band',
  camFrame: { style: 'glow', radius: 16, label: 'Live' },
  sounds: { start: 'whoosh', zero: 'chime', loop: 'rain' },
  mark: [1850, 320, 32, 32],
  speed: 0.8,
  density: 1,
  alert: 'builtin.glass-card',
})
