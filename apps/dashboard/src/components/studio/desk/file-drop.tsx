// Files dragged onto the Studio become sources, as in OBS: a picture an Image source, a video
// or a sound a Media Source, added on top of the scene being edited and named after the file.
// The app window takes the drop (that's how the file's path is known) and passes it on as a
// `ferrocast:drop` event.

import { useEffect, useState } from 'react'
import { FileArrowDown } from '@phosphor-icons/react'
import { describeError } from '@ferrocast/api'
import { toast } from '@ferrocast/ui'
import { useDesk } from './common'

const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tga', 'psd', 'jxr']
const MEDIA = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'm4v',
  'avi',
  'flv',
  'ts',
  'mts',
  'm2ts',
  'mpg',
  'mpeg',
  'mp3',
  'wav',
  'aac',
  'm4a',
  'ogg',
  'opus',
  'flac',
]

/** The source a dropped file makes, or null for a file the Studio can't show. */
export function sourceFor(
  path: string,
): { kind: string; name: string; settings: Record<string, unknown> } | null {
  const file = path.split(/[\\/]/).pop() ?? path
  const dot = file.lastIndexOf('.')
  const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : ''
  const name = (dot > 0 ? file.slice(0, dot) : file).slice(0, 100) || 'File'
  if (IMAGES.includes(ext)) return { kind: 'image_source', name, settings: { file: path } }
  if (MEDIA.includes(ext))
    return { kind: 'ffmpeg_source', name, settings: { local_file: path, is_local_file: true } }
  return null
}

interface DropDetail {
  kind: 'enter' | 'over' | 'drop' | 'leave'
  paths?: string[]
}

/** Listens for files dropped on the window while the Studio shows; the node is the hint. */
export function FileDrop() {
  const { api, scene, refresh } = useDesk()
  const [over, setOver] = useState<number | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<DropDetail>).detail
      if (d.kind === 'enter') {
        const n = (d.paths ?? []).filter((p) => sourceFor(p)).length
        setOver(n)
      } else if (d.kind === 'leave') setOver(null)
      else if (d.kind === 'drop') {
        setOver(null)
        void add(d.paths ?? [])
      }
    }
    const add = async (paths: string[]) => {
      if (!scene) return
      const made = paths.map(sourceFor)
      const skipped = made.filter((m) => !m).length
      let added = 0
      for (const m of made) {
        if (!m) continue
        // Names are unique: "clip", then "clip 2", "clip 3"…
        for (let i = 1; i <= 20; i++) {
          const name = i === 1 ? m.name : `${m.name} ${i}`
          try {
            await api.addSource(scene, { ...m, name }, true)
            added++
            break
          } catch (err) {
            const d = describeError(err)
            if (i === 20 || !/taken|exists|already/i.test(`${d.message} ${d.hint ?? ''}`)) {
              toast({ tone: 'error', message: `${m.name} couldn't be added.`, hint: d.message })
              break
            }
          }
        }
      }
      if (added) refresh()
      if (skipped)
        toast({
          tone: 'warn',
          message:
            skipped === 1
              ? "One file isn't a picture, video or sound."
              : `${skipped} files aren't pictures, videos or sounds.`,
          hint: 'Those can be added from + in Sources.',
        })
    }
    window.addEventListener('ferrocast:drop', on)
    return () => window.removeEventListener('ferrocast:drop', on)
  }, [api, scene, refresh])
  if (over === null) return null
  return (
    <div
      aria-hidden
      // A hint at the bottom, clear of the picture; marked so the preview cuts round it if a
      // small window puts them together.
      data-over-preview
      className="pointer-events-none fixed bottom-[calc(1.25rem+var(--fc-statusbar,0px))] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-panel border-2 border-dashed border-arc bg-surface-1 px-5 py-3 shadow-pop"
    >
      <FileArrowDown size={26} weight="duotone" className="shrink-0 text-accent-text" />
      <span className="flex flex-col">
        <b className="font-display text-[16px]">
          {over > 0 ? `Drop to add to ${scene}` : 'Only pictures, videos and sounds'}
        </b>
        <span className="text-[13.5px] text-text-2">
          {over > 1 ? `${over} sources, each on top` : 'A source on top of the scene'}
        </span>
      </span>
    </div>
  )
}
