// OBS auto-detect in the demo: it "finds" OBS's settings on a computer that has OBS set
// up, like the engine reading `plugin_config/obs-websocket/config.json`.

import type { ObsDetect, ObsState } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, type Routed } from './host'

export class DemoObsDetect {
  constructor(
    /** Whether this demo machine "has OBS" (a fresh install's demo does). */
    private readonly installed: () => boolean,
    /** Ferrocast follows OBS's settings already (nothing typed by the streamer). */
    private readonly following: () => boolean,
    private readonly use: (port: number) => ObsState,
  ) {}

  private view(): ObsDetect {
    return this.installed()
      ? {
          found: true,
          port: 4455,
          has_password: true,
          server_enabled: true,
          in_use: this.following(),
          reason: null,
        }
      : {
          found: false,
          port: null,
          has_password: false,
          server_enabled: false,
          in_use: false,
          reason: 'OBS’s settings aren’t on this computer. Is OBS 28 or newer installed here?',
        }
  }

  route(method: string, seg: string[]): Routed {
    if (seg[0] !== 'obs' || seg[1] !== 'detect' || seg.length !== 2) return NOT_MINE
    if (method === 'GET') return this.view()
    if (method === 'POST') {
      const v = this.view()
      if (!v.found || v.port === null)
        throw new HttpError(422, 'unavailable', v.reason ?? 'OBS’s settings weren’t found.')
      return this.use(v.port)
    }
    return NOT_MINE
  }
}
