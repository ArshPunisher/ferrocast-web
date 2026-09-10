// Esports banner: a slanted bar slams in from the left, heavy italic caps pop letter by
// letter, a bass hit. The Spark rides the banner's angled end cap.

import { alertDesign } from '../kit'

export default alertDesign(
  {
    slug: 'esports-banner',
    name: 'Esports banner',
    description: 'Slanted bar, heavy italic caps, a bass hit. Tournament energy.',
    style: 'bold',
    motion: 'bouncy',
  },
  {
    frame: 'banner',
    layout: 'left',
    media: { kind: 'emblem', ref: null },
    media_size: 128,
    font: {
      family: 'Anton',
      source: 'google',
      size: 46,
      weight: 400,
      uppercase: true,
      italic: true,
      letter_spacing: 0.02,
    },
    colors: {
      text: '#ffffff',
      highlight: '#ffd23f',
      plate: '#d9142f',
      accent: '#0e1014',
      outline: '#05060a',
    },
    plate: true,
    shadow: 'hard',
    anim: {
      in: 'slide_left',
      out: 'slide_right',
      text: 'pop',
      in_ms: 450,
      out_ms: 380,
      text_delay_ms: 150,
    },
    sound: { ref: null, builtin: 'bass', volume: 70 },
    duration_ms: 6000,
    brand: 'edge',
  },
  {
    raid: { title: 'Raid: {name} x {viewers}', body: 'The squad has arrived' },
  },
  [
    {
      event: 'gift',
      id: 'gift-bomb',
      name: 'Gift bombs (10+)',
      condition: { type: 'amount_at_least', value: 10, currency: null },
      look: {
        colors: {
          text: '#ffffff',
          highlight: '#33d4ff',
          plate: '#0e1014',
          accent: '#d9142f',
          outline: '#05060a',
        },
        duration_ms: 8000,
      },
    },
  ],
)
