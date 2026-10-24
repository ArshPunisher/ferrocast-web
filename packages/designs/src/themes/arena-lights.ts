// Arena Lights: Stadium floodlights sweeping a dark arena, flashing on the beat like a big match night.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'arena-lights',
    name: 'Arena Lights',
    description:
      'Stadium floodlights sweeping a dark arena, flashing on the beat like a big match night. Eight screens.',
    style: 'bold',
    motion: 'lively',
  },
  preset: 'arena',
  a: '#33d4ff',
  b: '#ff4fa3',
  bg: '#05070d',
  ink: '#ffffff',
  dim: '#bfd2e6',
  head: {
    font: 'Bebas Neue',
    weight: 400,
    effect: 'outline',
    color2: '#33d4ff',
    uppercase: true,
    spacing: 0.06,
  },
  timer: 'bar',
  music: 'pulse',
  layout: 'panel',
  camFrame: { style: 'double', variant: 'bulbs', label: 'Live' },
  sounds: { start: 'riser', zero: 'impact', loop: 'hum' },
  mark: [40, 940, 32, 32],
  speed: 1,
  density: 1,
  alert: 'builtin.cricket-sixer',
})
