import { useEffect } from 'react'
import { PageHeader } from '../components/Panel'
import { PointsSection } from '../components/community/points'

/** Things that involve the audience: points (and, later, polls and giveaways). */
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
      <section id="community-points" aria-labelledby="community-points-title" className="scroll-mt-20">
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
