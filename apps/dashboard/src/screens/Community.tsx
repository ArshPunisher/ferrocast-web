import { useEffect } from 'react'
import { PageHeader } from '../components/Panel'
import { PointsSection } from '../components/community/points'
import { PollPanel } from '../components/community/polls'
import { GiveawayPanel } from '../components/community/giveaways'
import { WelcomePanel } from '../components/community/welcome'
import { GoalsPanel } from '../components/community/goals'
import { isCloud } from '../lib/boot'
import { useLive } from '../lib/store'
import { useWidePage } from '../lib/wide'

/** Things that involve the audience: polls, giveaways, goals, points, new faces. In cloud
 * mode (no PC) points and new faces stay in the app (they need its viewer database).
 * Layout (owner's pick A1, 27 Oct): Poll, Giveaway and Goals as equal cards; below, the top
 * viewers across most of the width, Points and New faces beside them. Long lists and
 * settings open in a side panel, so no card scrolls inside itself. */
export function Community({ section }: { section?: string | undefined }) {
  const cloud = isCloud(useLive((s) => s.conn))
  useWidePage()
  useEffect(() => {
    if (section) document.getElementById(`community-${section}`)?.scrollIntoView({ block: 'start' })
  }, [section])
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Community"
        description={
          cloud
            ? 'Polls, giveaways and goals for the people who show up. The cloud bot posts them in chat while it’s on.'
            : 'Reward the people who show up, on Twitch, YouTube and Kick.'
        }
      />
      <section
        id="community-live"
        aria-label="Live with chat"
        className="grid scroll-mt-20 grid-cols-1 items-stretch gap-5 md:grid-cols-2 2xl:grid-cols-3"
      >
        <div id="community-polls" className="scroll-mt-20">
          <PollPanel />
        </div>
        <div id="community-giveaway" className="scroll-mt-20">
          <GiveawayPanel />
        </div>
        <div id="community-goals" className="scroll-mt-20 md:col-span-2 2xl:col-span-1">
          <GoalsPanel />
        </div>
      </section>
      {!cloud && (
        <section id="community-points" aria-label="Points" className="scroll-mt-20">
          <PointsSection beside={<WelcomePanel />} />
        </section>
      )}
    </div>
  )
}
