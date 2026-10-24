// Studio: Go live everywhere, the show, stream info, OBS and moments, one tab each (API.md §4
// "Studio" and "Go live everywhere").

import { Segmented } from '@ferrocast/ui'
import { ModeSwitch } from '../components/ModeSwitch'
import { PageHeader } from '../components/Panel'
import { useStudio } from '../components/studio/common'
import { GoLiveTab, GoingToLine } from '../components/studio/golive'
import { VerticalTab } from '../components/studio/vertical'
import { MarkersPanel, MomentsSettings } from '../components/studio/moments'
import { HealthPanel, ScenesPanel, SwitcherSettings } from '../components/studio/obs'
import { PreflightPanel, ShowPanel, ShowSettings } from '../components/studio/show'
import { StreamInfoEditor } from '../components/studio/stream-info'
import { useResource } from '../lib/hooks'
import { go, type StudioSection } from '../lib/router'
import { ThemeInObsCard } from '../components/design/theme-obs'

const TABS: { value: StudioSection; label: string }[] = [
  { value: 'golive', label: 'Go live' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'show', label: 'Show' },
  { value: 'info', label: 'Stream info' },
  { value: 'obs', label: 'OBS' },
  { value: 'moments', label: 'Moments' },
]

export function Studio({ section = 'golive' }: { section?: StudioSection | undefined }) {
  const studio = useStudio()
  const info = useResource(() => studio.streamInfo(), [studio])
  const scenes = useResource(() => studio.obsScenes(), [studio])
  const switcher = useResource(() => studio.switcher(), [studio])
  return (
    <div>
      <PageHeader
        title="Studio"
        description="Go live, set your title everywhere, run OBS, keep the big moments."
        actions={<ModeSwitch screen="studio" />}
      />
      <Segmented
        label="Studio section"
        className="mb-5 max-w-full overflow-x-auto"
        value={section}
        options={TABS}
        onChange={(s) => go({ name: 'studio', section: s })}
      />
      {section === 'golive' && <GoLiveTab />}
      {section === 'vertical' && <VerticalTab />}
      {section === 'show' && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <GoingToLine />
            <ShowPanel />
            <PreflightPanel />
          </div>
          <ShowSettings presets={info.data?.presets ?? []} scenes={scenes.data} />
        </div>
      )}
      {section === 'info' && <StreamInfoEditor view={info} />}
      {section === 'obs' && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <HealthPanel />
            <ScenesPanel scenes={scenes} cfg={switcher.data} />
          </div>
          <div className="flex flex-col gap-5">
            <ThemeInObsCard />
            <SwitcherSettings scenes={scenes.data} cfg={switcher} />
          </div>
        </div>
      )}
      {section === 'moments' && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <MarkersPanel title="Markers this stream" />
          <MomentsSettings />
        </div>
      )}
    </div>
  )
}
