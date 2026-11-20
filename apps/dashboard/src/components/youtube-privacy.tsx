import { InfoTip, Segmented, Skeleton } from '@ferrocast/ui'
import type { YoutubePrivacy } from '@ferrocast/api'
import { useAction, useClient, useResource } from '../lib/hooks'
import { useLive } from '../lib/store'
import { LoadError } from './Panel'
import { Group, Row } from './settings-kit'

const PRIVACY_NAME: Record<YoutubePrivacy, string> = {
  public: 'Public',
  unlisted: 'Unlisted',
  private: 'Private',
}

/**
 * Who can watch the live video Ferrocast makes on YouTube. Only with YouTube connected, and
 * only when the engine has the setting (an older one makes every video public and would ignore
 * the choice). One line; what each option means is behind the (i).
 */
export function YoutubePrivacyGroup() {
  const connected = useLive((s) => s.connectors?.youtube?.state === 'connected')
  return connected ? <YoutubePrivacyRows /> : null
}

function YoutubePrivacyRows() {
  const client = useClient()
  const res = useResource((c) => c.settings())
  const { run } = useAction()
  const data = res.data
  if (!res.error && data && data.youtube_privacy === undefined) return null
  const choose = (youtube_privacy: YoutubePrivacy) => {
    if (!data) return
    res.set({ ...data, youtube_privacy })
    void run('yt-privacy', () => client.saveSettings({ ...data, youtube_privacy }), {
      success: `New YouTube lives will be ${PRIVACY_NAME[youtube_privacy].toLowerCase()}.`,
    }).then((ok) => {
      // Not saved: the control goes back to what the engine has.
      if (!ok) res.reload()
    })
  }
  return (
    <Group title="YouTube">
      {res.error ? (
        <LoadError error={res.error} onRetry={res.reload} />
      ) : !data ? (
        <Skeleton className="h-16" />
      ) : (
        <Row
          label={
            <span className="inline-flex items-center gap-1">
              Who can watch new lives
              <InfoTip label="About who can watch new lives">
                Applies to the video Ferrocast makes when you go live, and the vertical one. A live
                you set up in YouTube Studio keeps its own setting. Public: anyone. Unlisted: only
                people with the link. Private: only you, so viewers can’t watch.
              </InfoTip>
            </span>
          }
          control={
            <Segmented
              label="Who can watch new YouTube lives"
              value={data.youtube_privacy ?? 'public'}
              onChange={choose}
              options={[
                { value: 'public', label: PRIVACY_NAME.public },
                { value: 'unlisted', label: PRIVACY_NAME.unlisted },
                { value: 'private', label: PRIVACY_NAME.private },
              ]}
            />
          }
        />
      )}
    </Group>
  )
}
