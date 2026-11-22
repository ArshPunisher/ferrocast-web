// One clip, open: it plays, and below it Trim, Captions, YouTube and Details (rename, Trash).
// Everything that makes a file starts a background job; the original is never changed.

import { useRef, useState } from 'react'
import { Trash, WarningCircle } from '@phosphor-icons/react'
import {
  clipLength,
  clipNameProblem,
  clipSize,
  type Clip,
  type ClipJob,
  type ClipsApi,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  Segmented,
  Skeleton,
  toast,
} from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useClient, useResource } from '../../../lib/hooks'
import { KIND_LABEL } from './labels'
import { CaptionsSection } from './captions-section'
import { Thumb, useThumb, type ThumbState } from './thumb'
import { TrimSection } from './trim-section'
import { UploadSection } from './upload-section'

type Section = 'trim' | 'captions' | 'youtube' | 'details'

export function ClipDialog({
  api,
  clip,
  id,
  ffmpegReady,
  youtubeConnected,
  jobs,
  onJobStarted,
  onChanged,
  onRenamed,
  onClose,
  onDeleted,
}: {
  api: ClipsApi
  /** The clip as the library lists it (null: it isn't listed). */
  clip: Clip | null
  id: string
  ffmpegReady: boolean
  youtubeConnected: boolean
  jobs: ClipJob[]
  onJobStarted: () => void
  onChanged: () => void
  onRenamed: (id: string) => void
  onClose: () => void
  onDeleted: () => void
}) {
  const client = useClient()
  const video = useRef<HTMLVideoElement>(null)
  const [section, setSection] = useState<Section>('trim')
  const [playable, setPlayable] = useState(true)
  const probe = useResource(() => api.probe(id), [api, id], { enabled: ffmpegReady })
  const asked = useThumb(api, clip ?? { id, size: 0, modified: 0 }, clip !== null && ffmpegReady)
  const thumb: ThumbState = ffmpegReady ? asked : { status: 'none' }
  const playhead = () => {
    const v = video.current
    return v && playable && Number.isFinite(v.currentTime) ? v.currentTime * 1000 : null
  }
  const seek = (ms: number) => {
    if (video.current && playable) video.current.currentTime = ms / 1000
  }
  const started = () => {
    onJobStarted()
    onClose()
  }
  if (!clip) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Clip"
        size="sm"
        footer={<Button onClick={onClose}>Close</Button>}
      >
        <p role="alert" className="flex items-start gap-2 text-[15px] text-text">
          <WarningCircle size={20} className="mt-px shrink-0 text-warn" aria-hidden="true" />
          That clip isn't in the folder any more. It may have been moved, renamed or deleted.
        </p>
      </Dialog>
    )
  }
  const vertical = clip.kind === 'vertical' || (probe.data?.height ?? 0) > (probe.data?.width ?? 1)
  return (
    <Dialog
      open
      onClose={onClose}
      title={clip.name}
      size="xl"
      description={
        <>
          {KIND_LABEL[clip.kind]} · {clipSize(clip.size)}
          {probe.data?.duration_ms != null && <> · {clipLength(probe.data.duration_ms)}</>}
          {probe.data?.width != null && probe.data.height != null && (
            <>
              {' '}
              · {probe.data.width}×{probe.data.height}
            </>
          )}
        </>
      }
    >
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className={vertical ? 'mx-auto w-full max-w-[300px]' : 'w-full'}>
            {playable ? (
              <video
                ref={video}
                src={client.clipFileUrl(id)}
                controls
                playsInline
                preload="metadata"
                aria-label={`Preview of ${clip.name}`}
                onError={() => setPlayable(false)}
                className={`w-full rounded-[10px] bg-black ${vertical ? 'aspect-[9/16] object-contain' : 'aspect-video'}`}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <Thumb state={thumb} vertical={vertical} />
                <p role="status" className="text-[13.5px] text-text-3">
                  This clip can't be played here (its format may not be supported by this window).
                  You can still trim by typing times, and every other tool works.
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Segmented
            label="What to do with this clip"
            value={section}
            onChange={setSection}
            className="max-w-full flex-wrap"
            options={[
              { value: 'trim', label: 'Trim' },
              { value: 'captions', label: 'Captions' },
              { value: 'youtube', label: 'YouTube' },
              { value: 'details', label: 'Details' },
            ]}
          />
          {probe.error != null && ffmpegReady && probe.data === null ? (
            <LoadError error={probe.error} onRetry={probe.reload} />
          ) : probe.loading && probe.data === null && ffmpegReady ? (
            <div className="flex flex-col gap-2" aria-label="Reading the clip">
              <Skeleton className="h-10" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <>
              {section === 'trim' && (
                <TrimSection
                  api={api}
                  clip={clip}
                  probe={probe.data}
                  playhead={playhead}
                  seek={seek}
                  ffmpegReady={ffmpegReady}
                  onStarted={started}
                />
              )}
              {section === 'captions' && (
                <CaptionsSection
                  api={api}
                  clip={clip}
                  jobs={jobs}
                  playhead={playhead}
                  ffmpegReady={ffmpegReady}
                  onStarted={onJobStarted}
                  onChanged={onChanged}
                />
              )}
              {section === 'youtube' && (
                <UploadSection
                  api={api}
                  clip={clip}
                  probe={probe.data}
                  jobs={jobs}
                  connected={youtubeConnected}
                  onStarted={onJobStarted}
                />
              )}
              {section === 'details' && (
                <DetailsSection
                  api={api}
                  clip={clip}
                  onRenamed={onRenamed}
                  onChanged={onChanged}
                  onDeleted={onDeleted}
                />
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function DetailsSection({
  api,
  clip,
  onRenamed,
  onChanged,
  onDeleted,
}: {
  api: ClipsApi
  clip: Clip
  onRenamed: (id: string) => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const { busy, run } = useAction()
  const [name, setName] = useState(clip.name)
  const [confirm, setConfirm] = useState(false)
  const problem = name === clip.name ? null : clipNameProblem(name)
  const rename = async () => {
    const r = await run('rename', () => api.rename(clip.id, name), { success: 'Renamed.' })
    if (r) {
      onChanged()
      onRenamed(r.id)
    }
  }
  const trash = async () => {
    setConfirm(false)
    const ok = await run('trash', () => api.remove(clip.id).then(() => true as const))
    if (ok) {
      toast({
        tone: 'ok',
        message: `${clip.name} is in the Trash.`,
        hint: 'Take it out of the Trash to get it back.',
      })
      onDeleted()
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!problem && name !== clip.name) void rename()
        }}
      >
        <Field
          label="Name"
          error={problem}
          hint="The file's name, without .mp4. Its captions are renamed with it."
        >
          {(p) => (
            <Input
              {...p}
              value={name}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div>
          <Button
            type="submit"
            variant="outline"
            busy={busy === 'rename'}
            disabled={name === clip.name || problem !== null}
          >
            Rename
          </Button>
        </div>
      </form>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14.5px]">
        <dt className="text-text-3">File</dt>
        <dd className="min-w-0 break-all text-text">{clip.id}</dd>
        <dt className="text-text-3">Kind</dt>
        <dd className="text-text">
          <Badge>{KIND_LABEL[clip.kind]}</Badge>
        </dd>
        <dt className="text-text-3">Size</dt>
        <dd className="text-text">{clipSize(clip.size)}</dd>
      </dl>
      <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
        <Button
          variant="danger-ghost"
          icon={<Trash size={17} aria-hidden="true" />}
          busy={busy === 'trash'}
          onClick={() => setConfirm(true)}
        >
          Move to Trash
        </Button>
        <p className="text-[13.5px] text-text-3">
          It goes to the Trash (Recycle Bin), not gone for good.
        </p>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Move ${clip.name} to the Trash?`}
        description="Its captions go with it. You can take it back out of the Trash."
        confirm="Move to Trash"
        onConfirm={() => void trash()}
      />
    </div>
  )
}
