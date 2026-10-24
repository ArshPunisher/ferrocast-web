// Cut it from your stream (2.0, A2.4): the owner's pick 5A (24 Oct board). OBS's picture with a
// Camera box and a Game box to drag or resize, the four layouts, and the upright preview built
// from the same picture. API.md §4 "Cut from the stream".

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowsClockwise, CheckCircle, Info, Warning } from '@phosphor-icons/react'
import {
  checkCut,
  cutSlots,
  type CutBox,
  type CutConfig,
  type CutLayout,
  type CutView,
} from '@ferrocast/api'
import { Button, Skeleton, cx } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useResource } from '../../lib/hooks'
import { useGoLive } from './golive'

const LAYOUTS: { value: CutLayout; label: string }[] = [
  { value: 'camera_top', label: 'Camera on top' },
  { value: 'small_camera', label: 'Small camera' },
  { value: 'half_half', label: 'Half and half' },
  { value: 'game_only', label: 'Game only' },
]

type Part = 'camera' | 'game'
const PART_LABEL: Record<Part, string> = { camera: 'Camera', game: 'Game' }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Keeps a box inside the picture and not tiny. */
function fit(b: CutBox): CutBox {
  const w = clamp(b.w, 0.05, 1)
  const h = clamp(b.h, 0.05, 1)
  return { w, h, x: clamp(b.x, 0, 1 - w), y: clamp(b.y, 0, 1 - h) }
}

export function CutEditor({ cut, onSaved }: { cut: CutView; onSaved: () => void }) {
  const api = useGoLive()
  const picture = useResource(() => api.picture(), [api])
  const { run, busy } = useAction()
  const [draft, setDraft] = useState<CutConfig>(cut.config)
  const saved = JSON.stringify(cut.config)
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setDraft(cut.config)
  }
  const dirty = JSON.stringify(draft) !== saved
  const problem = checkCut(draft)
  const save = () =>
    void run('save', () => api.setVerticalCut(draft), { success: 'Layout saved.' }).then(
      (r) => r && onSaved(),
    )
  // The game first, so the (usually smaller) camera box is on top and can be grabbed.
  const parts: Part[] = draft.layout === 'game_only' ? ['game'] : ['game', 'camera']
  return (
    <Panel
      id="vertical-cut"
      title="Vertical layout"
      description="Drag the boxes onto your camera and your game. Arrow keys move a box; Shift and arrows resize it."
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowsClockwise size={15} />}
          onClick={picture.reload}
          busy={picture.loading}
        >
          New picture
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="flex flex-col gap-3">
            {picture.error && !picture.data ? (
              <LoadError error={picture.error} onRetry={picture.reload} />
            ) : !picture.data ? (
              <Skeleton className="aspect-video w-full" />
            ) : (
              <Frame
                image={picture.data.image}
                ratio={picture.data.width / Math.max(1, picture.data.height)}
                boxes={parts.map((p) => ({ part: p, box: draft[p] }))}
                onChange={(part, box) => setDraft({ ...draft, [part]: box })}
              />
            )}
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-[13.5px] font-semibold text-text">Layout</legend>
              <div className="flex flex-wrap gap-2">
                {LAYOUTS.map((l) => (
                  <label
                    key={l.value}
                    className={cx(
                      'flex w-[84px] cursor-pointer flex-col items-center gap-1.5 rounded-[10px] p-1.5 text-center text-[12px] font-semibold',
                      'has-[:focus-visible]:shadow-[var(--fc-focus)]',
                      draft.layout === l.value ? 'text-text' : 'text-text-3 hover:text-text-2',
                    )}
                  >
                    <input
                      type="radio"
                      name="cut-layout"
                      className="sr-only"
                      checked={draft.layout === l.value}
                      onChange={() => setDraft({ ...draft, layout: l.value })}
                    />
                    <Thumb layout={l.value} on={draft.layout === l.value} />
                    {l.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="flex flex-col items-center gap-2">
            {picture.data ? (
              <Preview
                cut={draft}
                image={picture.data.image}
                ratio={picture.data.width / Math.max(1, picture.data.height)}
              />
            ) : (
              <Skeleton className="aspect-[9/16] w-[120px]" />
            )}
            <span className="text-[12px] text-text-3">What phones see</span>
          </div>
        </div>
        {problem && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
            {problem.replace(/^\w+:\s*/, '')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            busy={busy === 'save'}
            disabled={!dirty || !!problem}
            onClick={save}
          >
            Save layout
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(cut.config)}>
              Undo changes
            </Button>
          )}
          <CutStatus cut={cut} />
        </div>
      </div>
    </Panel>
  )
}

/** What the cutter is doing, in one line (getting ffmpeg first, the first time). */
function CutStatus({ cut }: { cut: CutView }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const s = cut.state
  const f = cut.ffmpeg
  if (f.state === 'downloading')
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-text-2" role="status">
        Getting ffmpeg, once ({f.percent}%)
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="block h-full bg-arc" style={{ width: `${f.percent}%` }} />
        </span>
      </span>
    )
  if (f.state === 'failed' || f.state === 'missing')
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-warn">
        <Warning size={15} weight="fill" aria-hidden />
        {f.state === 'failed' ? f.reason : 'Cutting needs ffmpeg (about 25 MB, fetched once).'}
        <Button
          size="sm"
          busy={busy === 'ffmpeg'}
          onClick={() => void run('ffmpeg', () => api.getFfmpeg())}
        >
          {f.state === 'failed' ? 'Try again' : 'Get ffmpeg'}
        </Button>
      </span>
    )
  if (f.state === 'unsupported')
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-warn">
        <Warning size={15} weight="fill" aria-hidden />
        Install ffmpeg from ffmpeg.org; Ferrocast can’t fetch it for this computer.
      </span>
    )
  if (!s)
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-text-3">
        <Info size={15} aria-hidden />
        Tick a place on the left for it to start.
      </span>
    )
  if (s.state === 'running')
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ok">
        <CheckCircle size={15} weight="fill" aria-hidden />
        Making the vertical picture on {s.on}.
      </span>
    )
  if (s.state === 'failed')
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-danger">
        <Warning size={15} weight="fill" aria-hidden />
        {s.reason} It tries again by itself.
      </span>
    )
  return (
    <span className="text-[13px] text-text-3">
      {s.state === 'starting' ? 'Starting…' : 'Starts when OBS streams.'}
    </span>
  )
}

/** OBS's picture with the boxes on it. */
function Frame({
  image,
  ratio,
  boxes,
  onChange,
}: {
  image: string
  ratio: number
  boxes: { part: Part; box: CutBox }[]
  onChange: (part: Part, box: CutBox) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    part: Part
    mode: 'move' | 'size'
    x: number
    y: number
    box: CutBox
  } | null>(null)
  const down = (part: Part, mode: 'move' | 'size', box: CutBox) => (e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { part, mode, x: e.clientX, y: e.clientY, box }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    const r = ref.current?.getBoundingClientRect()
    if (!d || !r) return
    const dx = (e.clientX - d.x) / r.width
    const dy = (e.clientY - d.y) / r.height
    onChange(
      d.part,
      fit(
        d.mode === 'move'
          ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy }
          : { ...d.box, w: d.box.w + dx, h: d.box.h + dy },
      ),
    )
  }
  const key = (part: Part, box: CutBox) => (e: KeyboardEvent) => {
    const step = 0.01
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const d = dir[e.key]
    if (!d) return
    e.preventDefault()
    onChange(
      part,
      fit(
        e.shiftKey
          ? { ...box, w: box.w + d[0], h: box.h + d[1] }
          : { ...box, x: box.x + d[0], y: box.y + d[1] },
      ),
    )
  }
  return (
    <div
      ref={ref}
      className="relative w-full touch-none overflow-hidden rounded-[10px] bg-surface-3 select-none"
      style={{ aspectRatio: String(ratio) }}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <img
        src={image}
        alt="What’s on air in OBS"
        className="absolute inset-0 size-full"
        draggable={false}
      />
      {boxes.map(({ part, box }) => (
        <div
          key={part}
          role="group"
          tabIndex={0}
          aria-label={`${PART_LABEL[part]} box: arrow keys move it, Shift and arrows resize it`}
          onKeyDown={key(part, box)}
          onPointerDown={down(part, 'move', box)}
          className={cx(
            'absolute cursor-move rounded-[4px] border-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
            part === 'camera' ? 'border-accent bg-accent/10' : 'border-arc bg-arc/10',
          )}
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
        >
          <span
            className={cx(
              'absolute top-0 left-0 rounded-br-[5px] px-1.5 py-0.5 text-[11px] font-bold text-white',
              part === 'camera' ? 'bg-[#b35900]' : 'bg-[#05678c]',
            )}
          >
            {PART_LABEL[part]}
          </span>
          <span
            aria-hidden
            onPointerDown={down(part, 'size', box)}
            className={cx(
              'absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-[3px] border-2 bg-white',
              part === 'camera' ? 'border-accent' : 'border-arc',
            )}
          />
        </div>
      ))}
    </div>
  )
}

/** The upright picture, drawn from OBS's picture the way ffmpeg will cut it. */
function Preview({ cut, image, ratio }: { cut: CutConfig; image: string; ratio: number }) {
  const W = 120
  const H = (W * 16) / 9
  return (
    <div
      className="relative overflow-hidden rounded-[14px] border-[3px] border-text bg-surface-3"
      style={{ width: W, height: H }}
      role="img"
      aria-label="Preview of the vertical picture"
    >
      {cutSlots(cut).map((s) => {
        const box = cut[s.part]
        const sw = s.w * W
        const sh = s.h * H
        // The source picture in preview pixels; the box is scaled to cover its slot.
        const srcW = 1000
        const srcH = srcW / ratio
        const scale = Math.max(sw / (box.w * srcW), sh / (box.h * srcH))
        const bx = box.x * srcW * scale - (box.w * srcW * scale - sw) / 2
        const by = box.y * srcH * scale - (box.h * srcH * scale - sh) / 2
        return (
          <div
            key={s.part + s.y}
            className={cx(
              'absolute overflow-hidden',
              s.part === 'camera' && cut.layout === 'small_camera' && 'rounded-[6px]',
            )}
            style={{
              left: s.x * W,
              top: s.y * H,
              width: sw,
              height: sh,
              backgroundImage: `url("${image}")`,
              backgroundSize: `${srcW * scale}px ${srcH * scale}px`,
              backgroundPosition: `${-bx}px ${-by}px`,
            }}
          />
        )
      })}
    </div>
  )
}

/** A small drawing of a layout for its radio button. */
function Thumb({ layout, on }: { layout: CutLayout; on: boolean }) {
  const cam = 'bg-[#6a527a]'
  const game = 'bg-[#2f5a48]'
  return (
    <span
      aria-hidden
      className={cx(
        'relative grid aspect-[9/16] w-11 overflow-hidden rounded-[6px] border-[1.5px]',
        on ? 'border-arc shadow-[0_0_0_2px_var(--fc-arc)]' : 'border-line-strong',
        layout === 'camera_top' && 'grid-rows-[38%_1fr]',
        layout === 'half_half' && 'grid-rows-2',
      )}
    >
      {layout === 'camera_top' || layout === 'half_half' ? (
        <>
          <span className={cam} />
          <span className={game} />
        </>
      ) : (
        <span className={game}>
          {layout === 'small_camera' && (
            <span
              className={cx('absolute top-[6%] right-[8%] h-[18%] w-[40%] rounded-[3px]', cam)}
            />
          )}
        </span>
      )}
    </span>
  )
}
