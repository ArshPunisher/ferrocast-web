// The app's cloud sync in the demo (`/pro/cloud`, API.md "Cloud sync"): off by default, needs
// the demo's account, syncs at once when turned on.

import type { CloudSyncView } from '../../cloud'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

export class DemoCloudSync {
  private view: Omit<CloudSyncView, 'signed_in'> = {
    sync: false,
    use_cloud_overlays: false,
    last_sync_at: null,
    error: null,
    notes: [],
    synced: 0,
    cloud_overlays: 0,
    running: false,
  }

  constructor(
    private readonly signedIn: () => boolean,
    private readonly counts: () => { docs: number; overlays: number },
  ) {}

  private out(): CloudSyncView {
    return clone({ ...this.view, signed_in: this.signedIn() })
  }

  private syncNow(): void {
    const c = this.counts()
    this.view.last_sync_at = Date.now()
    this.view.synced = c.docs
    this.view.cloud_overlays = c.overlays
    this.view.error = null
  }

  /** Demo hook: the web changed something this PC had changed too. */
  conflict(name: string): void {
    this.view.notes.unshift(
      `The web’s change to an overlay replaced this PC’s. Yours is kept as “${name} (this PC)”.`,
    )
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'pro' || seg[1] !== 'cloud') return NOT_MINE
    if (method === 'GET' && seg.length === 2) return this.out()
    if (method === 'POST' && seg[2] === 'sync' && seg.length === 3) {
      if (this.view.sync) this.syncNow()
      return this.out()
    }
    if (method === 'PUT' && seg.length === 2) {
      const b = requireObj(body)
      for (const k of Object.keys(b))
        if (k !== 'sync' && k !== 'use_cloud_overlays')
          throw new HttpError(400, 'invalid', `${k}: not a cloud sync setting.`)
      const sync = typeof b.sync === 'boolean' ? b.sync : undefined
      const use = typeof b.use_cloud_overlays === 'boolean' ? b.use_cloud_overlays : undefined
      if ((sync === true || use === true) && !this.signedIn())
        throw new HttpError(
          409,
          'signed_out',
          'Sign in to your Ferrocast account first.',
          'Cloud sync keeps your overlays, alerts and designs on your account. Sign in at the bottom of the sidebar.',
        )
      const turningOn = sync === true && !this.view.sync
      if (sync !== undefined) {
        this.view.sync = sync
        if (!sync) this.view.use_cloud_overlays = false
      }
      if (use !== undefined) this.view.use_cloud_overlays = use && this.view.sync
      if (turningOn) this.syncNow()
      return this.out()
    }
    return NOT_MINE
  }
}
