import { useEffect } from 'react'
import { PageHeader } from '../components/Panel'
import { PointsSection } from '../components/community/points'
import { PollPanel } from '../components/community/polls'
import { GiveawayPanel } from '../components/community/giveaways'

/** Things that involve the audience: polls, giveaways, points. */
export function Community({ section }: { section?: string | undefined }) {
  useEffect(() => {
    if (section) document.getElementById(`community-${section}`)?.scrollIntoView({ block: 'start' })
  }, [section])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Community"
        description="Reward the people who show up. Everything here works the same on Twitch, YouTube and Kick."
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
    </div>
  )
}
