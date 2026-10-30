// How a stream starts (owner's pick D1/P1, 30 Oct): three ready-made styles instead of a
// checklist. The style is read from the show settings, and picking one writes them; the Go live
// button then runs the show (anything but "just go live").

import type { ShowConfig } from '@ferrocast/api'

export type ShowStyle = 'just' | 'countdown' | 'full'

export const STYLES: { id: ShowStyle; title: string; blurb: string }[] = [
  { id: 'just', title: 'Just go live', blurb: 'Straight to your stream. Nothing switches.' },
  {
    id: 'countdown',
    title: 'Countdown first',
    blurb: 'A Starting screen with a countdown, then your stream.',
  },
  {
    id: 'full',
    title: 'Full show',
    blurb: 'Countdown, alerts, bot, Discord post and a thank-you at the end.',
  },
]

export const DEFAULT_THANKS = 'Thanks for hanging out! Big love to {thanks}. See you next stream.'

/** Which style the settings are. */
export function styleOf(c: ShowConfig): ShowStyle {
  // An ending or a Discord post is a show even without a countdown (CodeRabbit): Go live must
  // run it.
  if (c.discord || c.ending_scene) return 'full'
  if (!c.starting_scene && c.countdown_s === 0) return 'just'
  return 'countdown'
}

const find = (names: string[], re: RegExp) => names.find((n) => re.test(n)) ?? null

/** The settings for `style`, keeping the scenes and countdown already picked, else guessing them
 * from the scenes' names. Going live always streams; ending always stops it. */
export function applyStyle(c: ShowConfig, style: ShowStyle, names: string[]): ShowConfig {
  const base: ShowConfig = { ...c, start_stream: true, stop_stream: true }
  if (style === 'just') {
    return {
      ...base,
      starting_scene: null,
      countdown_s: 0,
      live_scene: null,
      ending_scene: null,
      discord: false,
    }
  }
  const starting = c.starting_scene ?? find(names, /start|soon|wait|intro/i)
  const live =
    c.live_scene ?? find(names, /main|game|live|play/i) ?? names.find((n) => n !== starting) ?? null
  const shared = {
    ...base,
    starting_scene: starting,
    countdown_s: c.countdown_s || 300,
    live_scene: live,
    alerts_on: true,
    bot_on: true,
  }
  if (style === 'countdown') return { ...shared, discord: false, ending_scene: null }
  return {
    ...shared,
    discord: true,
    replay_buffer: true,
    ending_scene: c.ending_scene ?? find(names, /end|outro|bye/i),
    recap_message: c.recap_message ?? DEFAULT_THANKS,
  }
}

/** The route a style takes, as scene names (a countdown shown as m:ss). */
export function routeOf(c: ShowConfig): string[] {
  const style = styleOf(c)
  if (style === 'just') return ['Your scene']
  const m = Math.floor(c.countdown_s / 60)
  const s = String(c.countdown_s % 60).padStart(2, '0')
  const out = [c.starting_scene ?? 'Your scene']
  if (c.countdown_s > 0) out.push(`${m}:${s}`)
  if (c.live_scene) out.push(c.live_scene)
  if (style === 'full' && c.ending_scene) out.push(c.ending_scene)
  return out
}
