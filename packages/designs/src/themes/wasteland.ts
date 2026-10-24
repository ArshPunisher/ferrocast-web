// Wasteland: A burnt orange sky over a ruined skyline whose buildings jump to the beat. Starting soon is the board's combo C.
// Eight screens from the motion theme builder (fx-kit.ts).

import { fxTheme } from '../fx-kit'

export default fxTheme({
  meta: {
    slug: 'wasteland',
    name: 'Wasteland',
    description:
      'A burnt orange sky over a ruined skyline whose buildings jump to the beat. Eight screens.',
    style: 'bold',
    motion: 'lively',
  },
  preset: 'wasteland',
  a: '#ffb35c',
  b: '#a2471c',
  bg: '#2b1a12',
  ink: '#f3e1c4',
  dim: '#d9b48c',
  head: {
    font: 'Anton',
    weight: 400,
    effect: 'long_shadow',
    color2: '#1a0f0a',
    uppercase: true,
    spacing: 0.03,
  },
  timer: 'bar',
  music: 'wave',
  layout: 'skyline',
  camFrame: { style: 'notch', variant: 'stitch', label: 'Live' },
  sounds: { start: 'impact', zero: 'impact', loop: 'wind' },
  mark: [40, 40, 32, 32],
  speed: 1,
  density: 1,
  alert: 'builtin.comic-burst',
})
