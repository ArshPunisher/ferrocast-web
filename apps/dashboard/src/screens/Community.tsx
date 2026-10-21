import { useEffect } from 'react'
import { PageHeader } from '../components/Panel'
import { PointsSection } from '../components/community/points'
import { PollPanel } from '../components/community/polls'
import { GiveawayPanel } from '../components/community/giveaways'
import { WelcomePanel } from '../components/community/welcome'
import { GoalsPanel } from '../components/community/goals'
import { isCloud } from '../lib/boot'
import { useLive } from '../lib/store'

/** Things that involve the audience: polls, giveaways, goals, points, new faces. In cloud
 * mode (no PC) points and new faces stay in the app (they need its viewer database). */
export function Community({ section }: { section?: string | undefined }) {
  const cloud = isCloud(useLive((s) => s.conn))
  useEffect(() => {
    if (section) document.getElementById(`community-${section}`)?.scrollIntoView({ block: 'start' })
  }, [section])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Community"
        description={
          cloud
            ? 'Polls, giveaways and goals for the people who show up. The cloud bot posts them in chat while it’s on.'
            : 'Reward the people who show up, on Twitch, YouTube and Kick.'
        }
      />
      <section id="community-live" aria-label="Live with chat" className="scroll-mt-20">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <div id="community-polls" className="scroll-mt-20">
            <PollPanel />
          </div>
          <div id="community-giveaway" className="scroll-mt-20">
            <GiveawayPanel />
          </div>
        </div>
      </section>
      <section id="community-goals" aria-label="Goals" className="scroll-mt-20">
        <GoalsPanel />
      </section>
      {!cloud && (
        <>
          <section
            id="community-points"
            aria-labelledby="community-points-title"
            className="scroll-mt-20"
          >
            <h2
              id="community-points-title"
              className="mb-3 font-display text-lg font-semibold tracking-tight text-text"
            >
              Points
            </h2>
            <PointsSection />
          </section>
          <section id="community-welcome" aria-label="New faces" className="scroll-mt-20">
            <WelcomePanel />
          </section>
        </>
      )}
    </div>
  )
}
