// A small, faithful copy of the relay's public tip page (crates/relay/src/tips/mod.rs
// `page`), drawn with the same palette the relay uses: the default look, or the streamer's
// Pro colours, avatar, banner and goal.

import type { tipPalette } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'

export type TipPalette = ReturnType<typeof tipPalette>

export interface PreviewGoal {
  title: string
  raised: string
  target: string
  pct: number
}

export function TipPreview({
  name,
  message,
  buttons,
  palette: p,
  avatarUrl,
  bannerUrl,
  goal,
}: {
  name: string
  message: string
  buttons: { label: string; hint: string }[]
  palette: TipPalette
  avatarUrl?: string | null
  bannerUrl?: string | null
  goal?: PreviewGoal | null
}) {
  return (
    <div
      data-testid="tip-preview"
      className="overflow-hidden rounded-[14px] border px-5 py-7 text-center transition-colors duration-300"
      style={{
        background: `radial-gradient(600px 300px at 50% 120%, ${p.glow} 0, ${p.bg} 62%)`,
        color: p.fg,
        borderColor: p.line,
      }}
    >
      <div className="mx-auto max-w-[320px]">
        {bannerUrl && (
          <img
            src={bannerUrl}
            alt=""
            className="mb-4 aspect-[3/1] w-full rounded-[12px] object-cover"
            style={{ background: p.surface }}
          />
        )}
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt=""
            className={cx(
              'relative mx-auto mb-3 size-16 rounded-full border-[3px] object-cover',
              bannerUrl && '-mt-11',
            )}
            style={{ borderColor: p.bg, background: p.surface }}
          />
        )}
        <p className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em] break-words">
          {name}
        </p>
        {message && (
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] break-words" style={{ color: p.muted }}>
            {message}
          </p>
        )}
        <div className="mt-5 grid gap-2">
          {buttons.length ? (
            buttons.map((b) => (
              <span
                key={b.label}
                className="flex items-center justify-between rounded-[12px] border px-4 py-3 text-left text-[13.5px] font-semibold"
                style={{ background: p.surface, borderColor: p.line }}
              >
                {b.label}
                <span className="text-[12.5px] font-normal" style={{ color: p.muted }}>
                  {b.hint}
                </span>
              </span>
            ))
          ) : (
            <span className="text-[13.5px]" style={{ color: p.muted }}>
              Tips aren’t set up yet.
            </span>
          )}
        </div>
        {goal && (
          <div
            className="mt-3 rounded-[12px] border px-4 py-3 text-left"
            style={{ background: p.surface, borderColor: p.line }}
          >
            <p className="flex flex-wrap justify-between gap-x-3 text-[13.5px] font-semibold">
              <span className="min-w-0 break-words">{goal.title}</span>
              <span className="font-normal" style={{ color: p.muted }}>
                {goal.raised} of {goal.target}
              </span>
            </p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full border"
              style={{ background: p.bg, borderColor: p.line }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(goal.pct, 2)}%`, background: p.accent }}
              />
            </div>
          </div>
        )}
        <p className="mx-auto mt-5 max-w-[36ch] text-[12.5px]" style={{ color: p.muted }}>
          Your name and message can show on stream. Payments go straight to the streamer through the
          provider you pick.
        </p>
      </div>
    </div>
  )
}
