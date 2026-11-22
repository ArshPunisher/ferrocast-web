import type { ClipKind } from '@ferrocast/api'

export const KIND_LABEL: Record<ClipKind, string> = {
  replay: 'Replay',
  vertical: 'Vertical',
  recording: 'Recording',
  edit: 'Edit',
}
