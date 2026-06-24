// Discord go-live settings in the demo, matching the engine (`crates/core/src/discord.rs`,
// `crates/engine/src/discord.rs`): same URL rules, the URL never comes back, and the test
// button's answers for a deleted webhook and rate limits.

import type { DiscordSettings } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

const HELP =
  'webhook_url: paste the webhook URL from Discord (Server Settings, Integrations, Webhooks, Copy Webhook URL). It starts with https://discord.com/api/webhooks/.'

/** The engine's check: Discord's own hosts, `/api/[vN/]webhooks/<id>/<token>`, nothing else. */
export function checkWebhook(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '')
  const m =
    /^https:\/\/(discord\.com|discordapp\.com)\/api\/(?:v\d+\/)?webhooks\/(\d{15,25})\/([A-Za-z0-9_-]{20,120})$/i.exec(
      url,
    )
  if (!m || url.length > 300) throw new HttpError(400, 'invalid', HELP)
  return url
}

export class DemoDiscord {
  private webhook: string | null = null
  private cfg = {
    enabled: true,
    template: '{name} is live on {platform}! {title|default:"Come hang out."} {url}',
    mention_everyone: false,
  }

  view(): DiscordSettings {
    const id = this.webhook?.split('/').at(-2) ?? ''
    return {
      has_webhook: this.webhook !== null,
      webhook_hint: this.webhook
        ? `${this.webhook.includes('discordapp.com') ? 'discordapp.com' : 'discord.com'} webhook …${id.slice(-4)}`
        : null,
      ...clone(this.cfg),
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'discord') return NOT_MINE
    if (seg.length === 1 && method === 'GET') return this.view()
    if (seg.length === 1 && method === 'PUT') {
      const b = requireObj(body)
      let hook: string | null | undefined
      if ('webhook_url' in b) {
        if (b.webhook_url === null) hook = null
        else if (typeof b.webhook_url === 'string') hook = checkWebhook(b.webhook_url)
        else throw new HttpError(400, 'invalid', 'webhook_url: must be text, or null to remove it.')
      }
      const next = { ...this.cfg }
      for (const k of ['enabled', 'mention_everyone'] as const)
        if (k in b) {
          if (typeof b[k] !== 'boolean')
            throw new HttpError(400, 'invalid', `${k}: must be true or false.`)
          next[k] = b[k]
        }
      if ('template' in b) {
        if (typeof b.template !== 'string')
          throw new HttpError(400, 'invalid', 'template: must be text.')
        next.template = b.template.trim()
      }
      if (!next.template || [...next.template].length > 1500)
        throw new HttpError(400, 'invalid', 'template: write a message of 1 to 1,500 characters.')
      if ((next.template.match(/{/g) ?? []).length !== (next.template.match(/}/g) ?? []).length)
        throw new HttpError(400, 'invalid', 'template: a "{" is never closed.')
      this.cfg = next
      if (hook !== undefined) this.webhook = hook
      return this.view()
    }
    if (seg.length === 2 && seg[1] === 'test' && method === 'POST') {
      if (!this.webhook)
        throw new HttpError(
          422,
          'unavailable',
          'Paste a Discord webhook URL first, then send a test.',
        )
      // Demo: a token ending in "gone" plays a deleted webhook, "slow" a rate limit.
      if (/gone$/i.test(this.webhook))
        throw new HttpError(
          422,
          'unavailable',
          'Discord says this webhook was deleted. Make a new one in Discord (Server Settings, Integrations, Webhooks) and paste it here.',
        )
      if (/slow$/i.test(this.webhook))
        throw new HttpError(
          429,
          'rate_limited',
          'Discord is limiting posts to this webhook. Try again in 3 seconds.',
          undefined,
          3,
        )
      return undefined
    }
    return NOT_MINE
  }
}
