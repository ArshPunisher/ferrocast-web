// Glass card: a frosted panel that lets the game show through, the art on the left, calm
// type. A hairline divider separates headline and message, with the Spark at its centre.

import { alertDesign } from '../kit'

export default alertDesign(
  {
    slug: 'glass-card',
    name: 'Glass card',
    description: 'Frosted card, art on the left, a quiet divider. Calm and clean.',
    style: 'minimal',
    motion: 'smooth',
  },
  {
    frame: 'glass',
    layout: 'left',
    media: { kind: 'emblem', ref: null },
    media_size: 124,
    font: {
      family: 'Hanken Grotesk',
      source: 'bundled',
      size: 38,
      weight: 650,
      uppercase: false,
      italic: false,
      letter_spacing: -0.01,
    },
    colors: {
      text: '#ffffff',
      highlight: '#9fe8ff',
      plate: '#ffffff',
      accent: '#ffffff',
      outline: '#07080a',
    },
    plate: true,
    shadow: 'soft',
    anim: { in: 'zoom', out: 'zoom', text: 'none', in_ms: 520, out_ms: 420, text_delay_ms: 200 },
    sound: { ref: null, builtin: 'sparkle', volume: 60 },
    duration_ms: 6000,
    brand: 'divider',
  },
)
