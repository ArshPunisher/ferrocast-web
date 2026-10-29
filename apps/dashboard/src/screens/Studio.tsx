// Studio: Go live everywhere, the show, stream info, OBS and moments, one tab each (API.md §4
// "Studio" and "Go live everywhere").

import { Segmented } from '@ferrocast/ui'
import { PageHeader } from '../components/Panel'
import { useStudio } from '../components/studio/common'
import { GoLiveTab, GoingToLine } from '../components/studio/golive'
import { VerticalTab } from '../components/studio/vertical'
import {
  DontMissLane,
  MarkersPanel,
  MomentsSettings,
  MomentsTimeline,
} from '../components/studio/moments'
import { HealthPanel, ScenesPanel, SwitcherSettings } from '../components/studio/obs'
import { PreflightPanel, ShowPanel, ShowSettings } from '../components/studio/show'
import { StreamInfoEditor } from '../components/studio/stream-info'
import { useResource } from '../lib/hooks'
import { go, type StudioSection } from '../lib/router'
import { ThemeInObsCard } from '../components/design/theme-obs'
import { useWidePage } from '../lib/wide'
import { useUsesObs } from '../lib/picture'
import { useRigLists } from '../components/studio/rig-lists'

const TABS: { value: StudioSection; label: string }[] = [
  { value: 'golive', label: 'Go live' },
  // Second: what viewers see is set right after picking where to go (owner, 29 Oct).
  { value: 'info', label: 'Stream info' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'show', label: 'Show' },
  { value: 'obs', label: 'OBS' },
  { value: 'moments', label: 'Moments' },
]

export function Studio({ section = 'golive' }: { section?: StudioSection | undefined }) {
  const studio = useStudio()
  // The OBS and Vertical tabs only for those who stream from OBS: with Ferrocast's Studio the
  // vertical picture and its platforms are all in Go live (owner, 28 Oct).
  const usesObs = useUsesObs()
  const tabs = usesObs ? TABS : TABS.filter((t) => t.value !== 'obs' && t.value !== 'vertical')
  const info = useResource(() => studio.streamInfo(), [studio])
  const scenes = useResource(() => studio.obsScenes(), [studio])
  // The Show tab picks from the Studio's scenes and sounds (OBS's when OBS is the source).
  const rig = useRigLists()
  const switcher = useResource(() => studio.switcher(), [studio])
  // Every tab uses the window's full width, so switching tabs (or Ferrocast / OBS) never jumps.
  useWidePage()
  return (
    <div>
      <PageHeader
        title="Studio"
        description={
          usesObs
            ? 'Go live, set your title everywhere, run OBS, keep the big moments.'
            : 'Build your scenes, go live everywhere, set your title, keep the big moments.'
        }
        beside={
          <Segmented
            label="Studio section"
            className="max-w-full overflow-x-auto"
            value={
              section === 'engine' || (section === 'vertical' && !usesObs) ? 'golive' : section
            }
            options={tabs}
            onChange={(s) => go({ name: 'studio', section: s })}
          />
        }
      />
      {/* The Studio without OBS lives in Go live now ("engine" links from 2.1 previews land there). */}
      {/* An old link to Vertical lands in Go live when the Studio is the picture. */}
      {(section === 'golive' || section === 'engine' || (section === 'vertical' && !usesObs)) && (
        <GoLiveTab />
      )}
      {section === 'vertical' && usesObs && <VerticalTab />}
      {section === 'show' && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <GoingToLine />
            <ShowPanel presets={info.data?.presets ?? []} />
          </div>
          <div className="flex flex-col gap-5">
            <PreflightPanel />
            <ShowSettings presets={info.data?.presets ?? []} rig={rig} />
            {/* BRB, !scene and shortcuts: in the OBS tab for OBS, here for the Studio. */}
            {!usesObs && (
              <SwitcherSettings
                scenes={rig.scenes.data}
                inputs={rig.inputs.data}
                app={rig.app}
                cfg={switcher}
              />
            )}
          </div>
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
            <SwitcherSettings
              scenes={scenes.data}
              inputs={rig.inputs.data}
              app={rig.app}
              cfg={switcher}
            />
          </div>
        </div>
      )}
      {section === 'moments' && (
        <div className="flex flex-col gap-5">
          <MomentsTimeline />
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <MarkersPanel title="Moments" />
            <div className="flex min-w-0 flex-col gap-5">
              <DontMissLane />
              <MomentsSettings />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
