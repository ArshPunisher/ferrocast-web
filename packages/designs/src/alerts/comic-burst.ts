// Comic burst: a starburst explodes behind the art, the caption panel is inked and tilted,
// letters bounce in. The Spark is a little sticker badge slapped on the panel's corner.

import { alertDesign } from '../kit'

export default alertDesign(
  {
    slug: 'comic-burst',
    name: 'Comic burst',
    description: 'Starburst, inked caption, bouncy letters. Loud in the best way.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'comic',
    layout: 'above',
    media: { kind: 'emblem', ref: null },
    media_size: 140,
    title: '{name} just followed!',
    font: {
      family: 'Bangers',
      source: 'google',
      size: 40,
      weight: 800,
      uppercase: true,
      italic: false,
      letter_spacing: 0.01,
    },
    colors: {
      text: '#141008',
      highlight: '#e8173c',
      plate: '#ffe14a',
      accent: '#33d4ff',
      outline: '#141008',
    },
    plate: true,
    shadow: 'none',
    outline: 0,
    anim: { in: 'pop', out: 'shrink', text: 'bounce', in_ms: 520, out_ms: 380, text_delay_ms: 250 },
    sound: { ref: null, builtin: 'boing', volume: 70 },
    duration_ms: 6000,
    brand: 'badge',
  },
  {
    follow: { title: '{name} just followed!' },
    raid: { title: 'Raid! {name} brings {viewers_text}', body: 'Everybody say hi' },
    tip: { title: 'Ka-ching! {name} tipped {amount}' },
  },
)
