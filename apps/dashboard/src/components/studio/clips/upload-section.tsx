// Send the clip to your own YouTube channel, as a video or a Short, through the YouTube
// connection you already made. Private unless you pick otherwise.

import { useState } from 'react'
import { YoutubeLogo } from '@phosphor-icons/react'
import {
  DAILY_UPLOADS,
  UPLOAD_MAX_DESCRIPTION,
  UPLOAD_MAX_TITLE,
  jobActive,
  shortsProblem,
  uploadProblem,
  type Clip,
  type ClipJob,
  type ClipProbe,
  type ClipsApi,
  type YoutubePrivacy,
} from '@ferrocast/api'
import { Button, Field, Input, InfoTip, Select, Switch, Textarea } from '@ferrocast/ui'
import { useAction } from '../../../lib/hooks'
import { go } from '../../../lib/router'
import { JobRow } from './jobs-panel'

const PRIVACY: [YoutubePrivacy, string, string][] = [
  ['private', 'Private', 'Only you can watch it.'],
  ['unlisted', 'Unlisted', 'Anyone with the link can watch it.'],
  ['public', 'Public', 'Anyone can find and watch it.'],
]

const num = (n: number) => new Intl.NumberFormat().format(n)

/** Tags typed as "a, b, c". */
export function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function UploadSection({
  api,
  clip,
  probe,
  jobs,
  connected,
  onStarted,
}: {
  api: ClipsApi
  clip: Clip
  probe: ClipProbe | null
  jobs: ClipJob[]
  connected: boolean
  onStarted: () => void
}) {
  const { busy, run } = useAction()
  const [title, setTitle] = useState(clip.name.slice(0, UPLOAD_MAX_TITLE))
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [privacy, setPrivacy] = useState<YoutubePrivacy>('private')
  const [kids, setKids] = useState(false)
  const [shorts, setShorts] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const job = sent ? jobs.find((j) => j.id === sent) : undefined
  const sending = job ? jobActive(job) : false
  const input = { title, description, tags: parseTags(tags), privacy }
  const problem = uploadProblem(input)
  const shortsNote = shortsProblem(probe ?? undefined)
  const go2 = async () => {
    const j = await run('upload', () =>
      api.upload(clip.id, {
        title: title.trim(),
        ...(description.trim() ? { description } : {}),
        tags: input.tags,
        privacy,
        made_for_kids: kids,
        shorts: shorts && !shortsNote,
      }),
    )
    if (j) {
      setSent(j.id)
      onStarted()
    }
  }
  if (!connected) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <YoutubeLogo size={30} className="text-text-3" aria-hidden="true" />
        <p className="text-[16px] font-bold text-text">YouTube isn't connected.</p>
        <p className="max-w-[52ch] text-[14.5px] text-text-3">
          Connect your channel once in Settings, then you can send clips here. Nothing is sent
          without you pressing the button.
        </p>
        <Button variant="outline" onClick={() => go({ name: 'settings', section: 'accounts' })}>
          Open Accounts
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Title"
        error={title.trim() && problem && /title/i.test(problem) ? problem : null}
      >
        {(p) => (
          <Input
            {...p}
            value={title}
            maxLength={UPLOAD_MAX_TITLE}
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <Field label="Description" optional>
        {(p) => (
          <Textarea
            {...p}
            value={description}
            rows={3}
            maxLength={UPLOAD_MAX_DESCRIPTION}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who can watch" hint="Starts private, so nothing goes public by accident.">
          {(p) => (
            <Select
              {...p}
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as YoutubePrivacy)}
            >
              {PRIVACY.map(([v, l, d]) => (
                <option key={v} value={v}>
                  {l}: {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tags" optional hint="Separate with commas.">
          {(p) => (
            <Input
              {...p}
              value={tags}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTags(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Switch
        checked={shorts && !shortsNote}
        onChange={setShorts}
        disabled={shortsNote !== null}
        label="Send as a Short"
        description={
          shortsNote ??
          'For a tall or square clip of up to 3 minutes. Ferrocast adds #Shorts to the description so YouTube treats it as one.'
        }
      />
      {shortsNote && <p className="-mt-2 text-[13.5px] text-text-3">{shortsNote}</p>}
      <Switch
        checked={kids}
        onChange={setKids}
        label="Made for kids"
        description="YouTube asks this of every video. Turn it on only if the video is made for children."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={<YoutubeLogo size={17} weight="fill" aria-hidden="true" />}
          busy={busy === 'upload' || sending}
          disabled={problem !== null}
          onClick={() => void go2()}
        >
          Send to YouTube
        </Button>
        <span className="flex items-center gap-1 text-[14px] text-text-3">
          One of {num(DAILY_UPLOADS)} uploads a day
          <InfoTip label="About YouTube's daily upload limit">
            YouTube lets an app send about {num(DAILY_UPLOADS)} videos a day by default, apart from
            the allowance other requests share. It resets after midnight Pacific time.
          </InfoTip>
        </span>
      </div>
      <p
        aria-live="polite"
        role={problem && !/title/i.test(problem) ? 'alert' : undefined}
        className="min-h-5 text-[14.5px] font-semibold text-danger"
      >
        {problem && !/title/i.test(problem) ? problem : null}
      </p>
      {job && (
        <ul aria-label="This upload">
          <JobRow job={job} onCancel={(id) => void api.cancelJob(id).then(onStarted)} />
        </ul>
      )}
    </div>
  )
}
