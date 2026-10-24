// Neon Tunnel: A tunnel of neon rings rushing towards you, beating with your music, the wave low on screen. Starting soon is the board's combo D.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'neon-tunnel',
    name: 'Neon Tunnel',
    description:
      'A tunnel of neon rings rushing towards you, beating with your music, the wave low on screen. Eight screens.',
    style: 'bold',
    motion: 'lively',
  },
  preset: 'tunnel',
  a: '#b04dff',
  b: '#ffd1ff',
  bg: '#05030d',
  ink: '#ffffff',
  dim: '#e6ccff',
  head: { font: 'Audiowide', weight: 400, effect: 'neon', color2: '#ffd1ff', spacing: 0.03 },
  timer: 'ring',
  music: 'wave',
  layout: 'low',
  camFrame: { style: 'glow', radius: 22, label: 'Live' },
  sounds: { start: 'riser', zero: 'impact', loop: 'pad' },
  mark: [1850, 540, 32, 32],
  speed: 1.2,
  density: 1,
  alert: 'builtin.neon-sign',
})
