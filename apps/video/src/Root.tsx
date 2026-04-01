import type React from 'react'
import { Composition } from 'remotion'
import { HeroLoop } from './compositions/HeroLoop'
import { AlertFires } from './compositions/AlertFires'
import { BanEverywhere } from './compositions/BanEverywhere'
import { SetupThreeClicks } from './compositions/SetupThreeClicks'
import { loadFonts } from './theme'

loadFonts()

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="HeroLoop"
      component={HeroLoop}
      durationInFrames={8 * 30}
      fps={30}
      width={1600}
      height={900}
    />
    <Composition
      id="AlertFires"
      component={AlertFires}
      durationInFrames={8 * 30}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="BanEverywhere"
      component={BanEverywhere}
      durationInFrames={9 * 30}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="SetupThreeClicks"
      component={SetupThreeClicks}
      durationInFrames={10 * 30}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="SetupThreeClicksPortrait"
      component={SetupThreeClicks}
      durationInFrames={10 * 30}
      fps={30}
      width={1080}
      height={1350}
    />
  </>
)
