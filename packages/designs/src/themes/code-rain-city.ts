// Code Rain City: Green code pouring down over a city of towers, falling faster when the music kicks in.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'code-rain-city',
    name: 'Code Rain City',
    description:
      'Green code pouring down over a city of towers, falling faster when the music kicks in. Eight screens.',
    style: 'tech',
    motion: 'lively',
  },
  preset: 'coderain',
  a: '#3cff8c',
  b: '#d7ffe6',
  bg: '#020806',
  ink: '#d7ffe6',
  dim: '#8fd9ad',
  head: {
    font: 'JetBrains Mono',
    weight: 800,
    effect: 'glitch',
    color2: '#3cff8c',
    spacing: -0.01,
  },
  timer: 'digital',
  music: 'wave',
  layout: 'low',
  camFrame: { style: 'corners', variant: 'hud', label: 'Live' },
  sounds: { start: 'glitch', zero: 'glitch', loop: 'hum' },
  mark: [1600, 40, 32, 32],
  speed: 1,
  density: 1,
  alert: 'builtin.ticket-stub',
})
