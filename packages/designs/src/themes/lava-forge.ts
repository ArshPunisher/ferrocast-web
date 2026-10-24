// Lava Forge: Cracks of lava glowing under dark rock, sparks rising with every beat.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'lava-forge',
    name: 'Lava Forge',
    description:
      'Cracks of lava glowing under dark rock, sparks rising with every beat. Eight screens.',
    style: 'bold',
    motion: 'lively',
  },
  preset: 'forge',
  a: '#ff6a00',
  b: '#ffd9a8',
  bg: '#0c0807',
  ink: '#ffe6c8',
  dim: '#d8b08a',
  head: {
    font: 'Russo One',
    weight: 400,
    effect: 'extrude',
    color2: '#7a2a00',
    uppercase: true,
    spacing: 0.02,
  },
  timer: 'digital',
  music: 'pulse',
  layout: 'band',
  camFrame: { style: 'notch', variant: 'brush', label: 'Live' },
  sounds: { start: 'impact', zero: 'impact', loop: 'hum' },
  mark: [1850, 760, 32, 32],
  speed: 1,
  density: 1,
  alert: 'builtin.trophy-gold',
})
