// Pixel arcade: a stepped pixel border, mono caps typed out letter by letter, a coin sound.
// The Spark sits in a notch cut into the top of the border, like a cabinet's badge.

import { alertDesign } from '../kit'

export default alertDesign(
  {
    slug: 'pixel-arcade',
    name: 'Pixel arcade',
    description: 'Stepped pixel border, typed caps, a coin drop. Insert coin.',
    style: 'retro',
    motion: 'lively',
  },
  {
    frame: 'pixel',
    layout: 'above',
    media: { kind: 'emblem', ref: null },
    media_size: 120,
    font: {
      family: 'JetBrains Mono',
      source: 'bundled',
      size: 30,
      weight: 800,
      uppercase: true,
      italic: false,
      letter_spacing: 0.02,
    },
    colors: {
      text: '#fff7c2',
      highlight: '#ffd23f',
      plate: '#1a0b2e',
      accent: '#ff3fa4',
      outline: '#05060a',
    },
    plate: true,
    shadow: 'hard',
    anim: { in: 'drop', out: 'wipe', text: 'type', in_ms: 480, out_ms: 360, text_delay_ms: 250 },
    sound: { ref: null, builtin: 'coin', volume: 65 },
    duration_ms: 6500,
    brand: 'notch',
  },
  {
    follow: { title: 'New player: {name}' },
    raid: { title: '{name} + {viewers_text} joined', body: 'Player 2 has entered' },
  },
)
