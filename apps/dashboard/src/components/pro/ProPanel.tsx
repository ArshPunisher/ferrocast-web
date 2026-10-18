// Wraps one Pro feature's section (API.md §9). Hidden unless the feature is on this relay
// and Pro is active or on sale; on sale but not Pro, one calm line and a link to
// Settings › Pro (no nagging, no lock screen); Pro, the feature itself.

import type { ReactNode } from 'react'
import { proApi, proPanelState, type ProFeature, type ProView } from '@ferrocast/api'
import { Panel } from '../Panel'
import { useResource } from '../../lib/hooks'
import { href } from '../../lib/router'
import { ProChip } from './ProChip'

export const PRO_LINE = 'Runs on Ferrocast’s servers, part of Pro.'

type Props = {
  title: ReactNode
  /** Leave out to show by the Pro and sale state alone. */
  feature?: ProFeature
  id?: string
  className?: string
  children: ReactNode
}

/** The panel for a known status (`null` while it loads: nothing shows). */
export function ProPanelView({ pro, feature, title, id, className, children }: Props & { pro: ProView | null }) {
  const state = proPanelState(pro, feature)
  if (state === 'hidden') return null
  return (
    <Panel
      title={title}
      actions={<ProChip />}
      {...(id ? { id } : {})}
      {...(className ? { className } : {})}
    >
      {state === 'open' ? (
        children
      ) : (
        <p className="text-sm text-text-2" data-testid="pro-line">
          {PRO_LINE}{' '}
          <a
            href={href({ name: 'settings', section: 'pro' })}
            className="font-semibold text-accent-text underline-offset-2 hover:underline"
          >
            Settings › Pro
          </a>
        </p>
      )}
    </Panel>
  )
}

/** Loads this install's Pro (the engine keeps it 10 minutes, so this is cheap) and shows the panel. */
export function ProPanel(props: Props) {
  // A failed check shows nothing: Pro extras simply aren't offered (R-01).
  const res = useResource((c) => proApi(c).status())
  return <ProPanelView {...props} pro={res.error ? null : res.data} />
}
