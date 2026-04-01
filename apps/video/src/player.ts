// The compositions as plain components, for embedding with @remotion/player later.
export { HeroLoop } from './compositions/HeroLoop'
export { AlertFires } from './compositions/AlertFires'
export { BanEverywhere } from './compositions/BanEverywhere'
export { SetupThreeClicks } from './compositions/SetupThreeClicks'

export const COMPOSITIONS = {
  HeroLoop: { durationInFrames: 240, fps: 30, width: 1600, height: 900 },
  AlertFires: { durationInFrames: 240, fps: 30, width: 1920, height: 1080 },
  BanEverywhere: { durationInFrames: 270, fps: 30, width: 1920, height: 1080 },
  SetupThreeClicks: { durationInFrames: 300, fps: 30, width: 1920, height: 1080 },
} as const
