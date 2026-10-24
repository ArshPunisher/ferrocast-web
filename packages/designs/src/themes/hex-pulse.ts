// Hex Pulse: A honeycomb grid that pulses out from the middle, with a heartbeat that jumps to your music. Starting soon is the board's combo A.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'hex-pulse',
    name: 'Hex Pulse',
    description:
      'A honeycomb grid that pulses out from the middle, with a heartbeat that jumps to your music. Eight screens.',
    style: 'tech',
    motion: 'lively',
  },
  preset: 'hex',
  a: '#ffa424',
  b: '#33d4ff',
  bg: '#0a0d14',
  ink: '#ffffff',
  dim: '#c2c8d4',
  head: { font: 'Orbitron', weight: 900, effect: 'neon', uppercase: true, spacing: 0.04 },
  timer: 'digital',
  music: 'pulse',
  layout: 'band',
  camFrame: { style: 'corners', variant: 'hud', label: 'Live' },
  sounds: { start: 'riser', zero: 'impact', loop: 'hum' },
  mark: [1850, 40, 32, 32],
  speed: 1,
  density: 1,
  alert: 'builtin.esports-banner',
})
