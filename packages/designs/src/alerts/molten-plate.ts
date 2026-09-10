// Molten plate: the Ferrocast default. A dark plate with a molten top edge, the event's art
// above it, the name and amount in molten. The Spark climbs out of the plate's corner.

import { alertDesign } from '../kit'

export default alertDesign(
  {
    slug: 'molten-plate',
    name: 'Molten plate',
    description: 'Dark plate, molten name, the art above. Reads on any game.',
    style: 'bold',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'above',
    media: { kind: 'emblem', ref: null },
    media_size: 150,
    font: {
      family: 'Bricolage Grotesque',
      source: 'bundled',
      size: 42,
      weight: 800,
      uppercase: false,
      italic: false,
      letter_spacing: -0.015,
    },
    colors: {
      text: '#eef0f4',
      highlight: '#ffa424',
      plate: '#101216',
      accent: '#33d4ff',
      outline: '#07080a',
    },
    plate: true,
    shadow: 'soft',
    anim: { in: 'magnet', out: 'sink', text: 'wave', in_ms: 650, out_ms: 450, text_delay_ms: 300 },
    sound: { ref: null, builtin: 'chime', volume: 70 },
    duration_ms: 6500,
    brand: 'corner',
  },
  {},
  [
    {
      event: 'tip',
      id: 'tip-big',
      name: 'Big tips',
      condition: { type: 'amount_at_least', value: 1000, currency: null },
      look: {
        font: {
          family: 'Bricolage Grotesque',
          source: 'bundled',
          size: 52,
          weight: 800,
          uppercase: false,
          italic: false,
          letter_spacing: -0.02,
        },
        media_size: 180,
        anim: { in: 'pop', out: 'sink', text: 'glow', in_ms: 600, out_ms: 450, text_delay_ms: 250 },
        sound: { ref: null, builtin: 'bass', volume: 75 },
        duration_ms: 9000,
      },
    },
    {
      event: 'resub',
      id: 'resub-year',
      name: 'A year or more',
      condition: { type: 'months_at_least', months: 12 },
      look: {
        colors: {
          text: '#eef0f4',
          highlight: '#33d4ff',
          plate: '#101216',
          accent: '#ffa424',
          outline: '#07080a',
        },
        anim: {
          in: 'bounce',
          out: 'sink',
          text: 'bounce',
          in_ms: 700,
          out_ms: 450,
          text_delay_ms: 300,
        },
      },
    },
  ],
)
