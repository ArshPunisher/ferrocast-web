// Neon sign: a glowing tube outline for dark scenes. The text itself glows, the art sits in a
// tube ring on the left, and the Spark is etched faintly into the glass like a maker's mark.

import { alertDesign } from '../kit'

export default alertDesign(
  {
    slug: 'neon-sign',
    name: 'Neon sign',
    description: 'A glowing tube sign that flickers on. Made for dark games.',
    style: 'bold',
    motion: 'lively',
  },
  {
    frame: 'neon',
    layout: 'left',
    media: { kind: 'emblem', ref: null },
    media_size: 120,
    font: {
      family: 'Bricolage Grotesque',
      source: 'bundled',
      size: 44,
      weight: 700,
      uppercase: false,
      italic: false,
      letter_spacing: 0,
    },
    colors: {
      text: '#f4fbff',
      highlight: '#ff4fd8',
      plate: '#060810',
      accent: '#33d4ff',
      outline: '#05060a',
    },
    plate: true,
    shadow: 'glow',
    anim: { in: 'flip', out: 'fade', text: 'glow', in_ms: 600, out_ms: 400, text_delay_ms: 350 },
    sound: { ref: null, builtin: 'whoosh', volume: 65 },
    duration_ms: 6500,
    brand: 'watermark',
  },
  {
    raid: {
      anim: { in: 'zoom', out: 'fade', text: 'glow', in_ms: 500, out_ms: 400, text_delay_ms: 200 },
    },
  },
  [
    {
      event: 'bits',
      id: 'bits-big',
      name: '1,000 bits and up',
      condition: { type: 'amount_at_least', value: 1000, currency: null },
      look: {
        colors: {
          text: '#f4fbff',
          highlight: '#ffd23f',
          plate: '#060810',
          accent: '#ff4fd8',
          outline: '#05060a',
        },
        duration_ms: 8500,
      },
    },
  ],
)
