// Cloud mode in the demo (`?web=cloud`, ferrocast docs/CLOUD.md): the dashboard acts as the
// web dashboard of an account with no PC. The summary and "turn on" (`/v1/cloud…`), and the
// channels connected on the web (Twitch and Kick through the browser; YouTube is Pro).

import type { CloudChannel, CloudPlatform, CloudSummary } from '../../cloud'
import type { Account } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type Routed } from './host'

export type DemoCloudSetup = 'on' | 'off' | 'sleeping'

const MB = 1_000_000

export class DemoCloud {
  enabled: boolean
  sleeping: boolean
  private channels: CloudChannel[] = []

  constructor(
    setup: DemoCloudSetup,
    private readonly counts: () => { overlays: number; rules: number; designs: number },
  ) {
    this.enabled = setup !== 'off'
    this.sleeping = setup === 'sleeping'
    if (this.enabled)
      this.channels = [
        {
          platform: 'twitch',
          login: 'ashaplays',
          name: 'AshaPlays',
          avatar_url: null,
          connected_at: Date.now() - 6 * 86_400_000,
          error: null,
        },
      ]
  }

  /** Demo hook: a channel the platform signed out (the Cloud page shows why). */
  breakChannel(platform: CloudPlatform): void {
    const ch = this.channels.find((c) => c.platform === platform)
    if (ch)
      ch.error = {
        code: `${platform}_signed_out`,
        message:
          platform === 'kick'
            ? 'Kick signed Ferrocast out of this channel.'
            : 'Twitch says Ferrocast’s permission for this channel was removed.',
        hint: `Disconnect ${platform === 'kick' ? 'Kick' : 'Twitch'} and connect it again.`,
      }
  }

  summary(): CloudSummary {
    const c = this.counts()
    return {
      enabled: this.enabled,
      sleeping: this.sleeping,
      enabled_at: this.enabled ? Date.now() - 6 * 86_400_000 : null,
      overlay_origin: 'https://ferrocast-relay.clearcraftlabs.com',
      usage: this.enabled
        ? {
            bytes: 37_400_000,
            bytes_limit: 200 * MB,
            overlays: c.overlays,
            rules: c.rules,
            designs: c.designs,
          }
        : null,
      limits: {
        bytes: 200 * MB,
        file_bytes: 20 * MB,
        overlays: 50,
        rules: 200,
        designs: 100,
        history_days: 30,
        sleep_after_days: 30,
      },
      channels: clone(this.channels),
      features: { twitch: true, kick: true, youtube: true },
      // YouTube in cloud mode is Pro; the demo account is free.
      youtube: { available: true, pro: false, bot_on: false, channel: null },
    }
  }

  enable(): CloudSummary {
    this.enabled = true
    this.sleeping = false
    return this.summary()
  }

  /** The cloud's own calls (outside `/api/v1`), or `NOT_MINE`. */
  routeCloud(method: string, path: string): Routed {
    if (method === 'GET' && path === '/v1/cloud') return this.summary()
    if (method === 'POST' && path === '/v1/cloud/enable') return this.enable()
    return NOT_MINE
  }

  /** `/api/v1/accounts…` the cloud's way (the browser flow, YouTube is Pro). */
  route(method: string, seg: string[]): Routed {
    if (seg[0] !== 'accounts') return NOT_MINE
    if (!this.enabled)
      throw new HttpError(
        409,
        'cloud_off',
        'Cloud mode is off for this account.',
        'Turn on cloud mode on the Cloud page first. It’s free.',
      )
    const p = seg[1] as CloudPlatform | undefined
    if (method === 'GET' && seg.length === 1) {
      return this.channels
        .filter((c) => c.platform !== 'youtube')
        .map((c): Account => ({
          platform: c.platform,
          name: c.name ?? c.login,
          avatar_url: c.avatar_url,
          connected_at: c.connected_at,
          scopes_ok: true,
        }))
    }
    if (p === 'youtube')
      throw new HttpError(
        402,
        'pro_required',
        'YouTube in cloud mode is part of Ferrocast Pro.',
        'Twitch and Kick are free. YouTube keeps working in the app on your PC.',
      )
    if (p !== 'twitch' && p !== 'kick')
      throw new HttpError(
        404,
        'not_found',
        'Cloud mode connects Twitch and Kick.',
        'Pick Twitch or Kick.',
      )
    if (method === 'POST' && seg[2] === 'connect') {
      // The real one opens the platform's page; the demo comes back connected at once.
      this.channels = this.channels.filter((c) => c.platform !== p)
      this.channels.push({
        platform: p,
        login: p === 'kick' ? 'asha_kick' : 'ashaplays',
        name: p === 'kick' ? 'asha_kick' : 'AshaPlays',
        avatar_url: null,
        connected_at: Date.now(),
        error: null,
      })
      return { flow: 'browser', url: `#/cloud?connected=${p}` }
    }
    if (method === 'DELETE' && seg.length === 2) {
      if (!this.channels.some((c) => c.platform === p))
        throw new HttpError(
          404,
          'not_found',
          `${p === 'kick' ? 'Kick' : 'Twitch'} isn’t connected in cloud mode.`,
          'Connect it on the Cloud page.',
        )
      this.channels = this.channels.filter((c) => c.platform !== p)
      return undefined
    }
    return NOT_MINE
  }
}
