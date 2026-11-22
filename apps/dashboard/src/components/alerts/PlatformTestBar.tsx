import { PLATFORM_LABEL, type Platform } from '@ferrocast/api'
import { Lightning } from '@phosphor-icons/react'
import { Button, PlatformMark, cx } from '@ferrocast/ui'

const TEST_PLATFORMS: readonly Platform[] = ['twitch', 'youtube', 'kick', 'tips']

export function PlatformTestBar({
  selected,
  statusText,
  onTestPlatform,
  onTestOnStream,
  busy = false,
}: {
  selected: Platform
  statusText: string | null
  onTestPlatform: (platform: Platform) => void
  onTestOnStream: () => void
  busy?: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-control border border-line bg-surface-1 p-3 shadow-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="fc-label">Test alert in preview</span>
        <Button
          size="sm"
          variant="primary"
          icon={<Lightning size={14} weight="fill" />}
          busy={busy}
          onClick={onTestOnStream}
        >
          Test on stream
        </Button>
      </div>

      <div
        role="group"
        aria-label="Test alert by platform"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {TEST_PLATFORMS.map((p) => {
          const active = selected === p
          const label = PLATFORM_LABEL[p]
          return (
            <button
              key={p}
              type="button"
              data-platform-test={p}
              aria-pressed={active}
              onClick={() => onTestPlatform(p)}
              className={cx(
                'fc-press inline-flex h-9 items-center justify-center gap-1.5 rounded-control border px-2.5 text-[13px] font-semibold transition-colors focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                active
                  ? 'border-accent-line bg-accent-soft text-text'
                  : 'border-line bg-surface-2 text-text-2 hover:border-line-strong hover:text-text',
              )}
            >
              <PlatformMark platform={p} size={13} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {statusText && (
        <p className="text-[12.5px] font-medium text-text-2" aria-live="polite">
          {statusText}
        </p>
      )}
    </div>
  )
}
