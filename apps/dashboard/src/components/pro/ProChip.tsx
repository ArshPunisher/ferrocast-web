// "Pro" marked calmly (DESIGN.md: an outline chip, never a colour shout or a lock screen).
// The visible word is short; screen readers hear the whole meaning.

import { Badge } from '@ferrocast/ui'

export function ProChip({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="Part of Ferrocast Pro" className={className}>
      <Badge tone="pro" title="Part of Ferrocast Pro. Everything free stays free.">
        <span aria-hidden="true">Pro</span>
      </Badge>
    </span>
  )
}
