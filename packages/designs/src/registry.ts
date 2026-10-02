// Every built-in design, in gallery order. To add one: write a file (one design each) under
// alerts/, themes/ or widgets/, import it here, and run `pnpm --filter @ferrocast/designs test`.
// See docs/CONTRIBUTING-designs.md. Future packs append to this list; ids never change once shipped.

import type { Design } from '@ferrocast/api'
import moltenPlate from './alerts/molten-plate'
import neonSign from './alerts/neon-sign'
import comicBurst from './alerts/comic-burst'
import glassCard from './alerts/glass-card'
import pixelArcade from './alerts/pixel-arcade'
import esportsBanner from './alerts/esports-banner'
import forge from './themes/forge'
import arcadeNight from './themes/arcade-night'
import goalBar from './widgets/goal-bar'
import goalSegments from './widgets/goal-segments'
import labelLatest from './widgets/label-latest'
import labelTop from './widgets/label-top'
import eventList from './widgets/event-list'
import chatBox from './widgets/chat-box'
import synthwaveChrome from './alerts/synthwave-chrome'
import synthwaveDrive from './themes/synthwave-drive'
import overclockHud from './alerts/overclock-hud'
import chaiSteam from './alerts/chai-steam'
import doodleNote from './alerts/doodle-note'
import questDialog from './alerts/quest-dialog'
import vanguardStrike from './alerts/vanguard-strike'
import prismHolo from './alerts/prism-holo'
import gildedDeco from './alerts/gilded-deco'
import mochiSticker from './alerts/mochi-sticker'
import orbitRing from './alerts/orbit-ring'
import diyaGlow from './alerts/diya-glow'
import midnightHowl from './alerts/midnight-howl'
import rewindVhs from './alerts/rewind-vhs'
import ticketStub from './alerts/ticket-stub'
import minimalLines from './alerts/minimal-lines'
import inkBrush from './alerts/ink-brush'
import paperCollage from './alerts/paper-collage'
import holiSplash from './alerts/holi-splash'
import canopyLeaf from './alerts/canopy-leaf'
import polaroidSnap from './alerts/polaroid-snap'
import speechBubble from './alerts/speech-bubble'
import trophyGold from './alerts/trophy-gold'
import lowerThird from './alerts/lower-third'
import marqueeBulbs from './alerts/marquee-bulbs'
import snowfallRibbon from './alerts/snowfall-ribbon'
import cricketSixer from './alerts/cricket-sixer'
import confettiPop from './alerts/confetti-pop'
import goalChevron from './widgets/goal-chevron'
import goalLiquid from './widgets/goal-liquid'
import goalTube from './widgets/goal-tube'
import goalTicks from './widgets/goal-ticks'
import goalCandy from './widgets/goal-candy'
import goalSketch from './widgets/goal-sketch'
import goalGold from './widgets/goal-gold'
import goalHp from './widgets/goal-hp'
import goalRing from './widgets/goal-ring'
import labelChip from './widgets/label-chip'
import labelBracket from './widgets/label-bracket'
import labelRibbon from './widgets/label-ribbon'
import labelSticker from './widgets/label-sticker'
import labelTicket from './widgets/label-ticket'
import labelUnderline from './widgets/label-underline'
import labelNeon from './widgets/label-neon'
import eventsTimeline from './widgets/events-timeline'
import eventsHud from './widgets/events-hud'
import eventsStickers from './widgets/events-stickers'
import eventsTicker from './widgets/events-ticker'
import eventsStack from './widgets/events-stack'
import chatSpeech from './widgets/chat-speech'
import chatTerminal from './widgets/chat-terminal'
import chatPaper from './widgets/chat-paper'
import chatGlass from './widgets/chat-glass'
import chatNeon from './widgets/chat-neon'
import rotatorNeon from './scenes/rotator-neon'
import rotatorRibbon from './scenes/rotator-ribbon'
import rotatorMinimal from './scenes/rotator-minimal'
import timerRing from './scenes/timer-ring'
import timerFlip from './scenes/timer-flip'
import timerPixel from './scenes/timer-pixel'
import nowPlayingCassette from './scenes/now-playing-cassette'
import nowPlayingVinyl from './scenes/now-playing-vinyl'
import overclock from './themes/overclock'
import chaiRain from './themes/chai-rain'
import doodleDesk from './themes/doodle-desk'
import pixelQuest from './themes/pixel-quest'
import vanguard from './themes/vanguard'
import prism from './themes/prism'
import gilded from './themes/gilded'
import mochiPop from './themes/mochi-pop'
import deepSpace from './themes/deep-space'
import diwaliLights from './themes/diwali-lights'
import midnightManor from './themes/midnight-manor'
import lofiCassette from './alerts/lofi-cassette'
import lofiLoft from './themes/lofi-loft'
import glitchSlice from './alerts/glitch-slice'
import glitchDistrict from './themes/glitch-district'
import chromePop from './alerts/chrome-pop'
import chromeBubble from './themes/chrome-bubble'
import sakuraPetal from './alerts/sakura-petal'
import sakuraBloom from './themes/sakura-bloom'
import terminalBoot from './alerts/terminal-boot'
import phosphorTerminal from './themes/phosphor-terminal'
import scoreboardFlash from './alerts/scoreboard-flash'
import floodlight from './themes/floodlight'
import pitBoard from './alerts/pit-board'
import pitWall from './themes/pit-wall'
import brutalStamp from './alerts/brutal-stamp'
import brutalMono from './themes/brutal-mono'
import chatLoft from './widgets/chat-loft'
import labelHazard from './widgets/label-hazard'
import goalBubble from './widgets/goal-bubble'
import chatSakura from './widgets/chat-sakura'
import chatPhosphor from './widgets/chat-phosphor'
import labelScoreboard from './widgets/label-scoreboard'
import labelTiming from './widgets/label-timing'
import eventsCredits from './widgets/events-credits'

export const BUILTINS: readonly Design[] = [
  moltenPlate,
  neonSign,
  comicBurst,
  glassCard,
  pixelArcade,
  esportsBanner,
  forge,
  arcadeNight,
  goalBar,
  goalSegments,
  labelLatest,
  labelTop,
  eventList,
  chatBox,
  synthwaveChrome,
  synthwaveDrive,
  overclockHud,
  chaiSteam,
  doodleNote,
  questDialog,
  vanguardStrike,
  prismHolo,
  gildedDeco,
  mochiSticker,
  orbitRing,
  diyaGlow,
  midnightHowl,
  overclock,
  chaiRain,
  doodleDesk,
  pixelQuest,
  vanguard,
  prism,
  gilded,
  mochiPop,
  deepSpace,
  diwaliLights,
  midnightManor,
  rewindVhs,
  ticketStub,
  minimalLines,
  inkBrush,
  paperCollage,
  holiSplash,
  canopyLeaf,
  polaroidSnap,
  speechBubble,
  trophyGold,
  lowerThird,
  marqueeBulbs,
  snowfallRibbon,
  cricketSixer,
  confettiPop,
  goalChevron,
  goalLiquid,
  goalTube,
  goalTicks,
  goalCandy,
  goalSketch,
  goalGold,
  goalHp,
  goalRing,
  labelChip,
  labelBracket,
  labelRibbon,
  labelSticker,
  labelTicket,
  labelUnderline,
  labelNeon,
  eventsTimeline,
  eventsHud,
  eventsStickers,
  eventsTicker,
  eventsStack,
  chatSpeech,
  chatTerminal,
  chatPaper,
  chatGlass,
  chatNeon,
  rotatorNeon,
  rotatorRibbon,
  rotatorMinimal,
  timerRing,
  timerFlip,
  timerPixel,
  nowPlayingCassette,
  nowPlayingVinyl,
  lofiCassette,
  lofiLoft,
  glitchSlice,
  glitchDistrict,
  chromePop,
  chromeBubble,
  sakuraPetal,
  sakuraBloom,
  terminalBoot,
  phosphorTerminal,
  scoreboardFlash,
  floodlight,
  pitBoard,
  pitWall,
  brutalStamp,
  brutalMono,
  chatLoft,
  labelHazard,
  goalBubble,
  chatSakura,
  chatPhosphor,
  labelScoreboard,
  labelTiming,
  eventsCredits,
]
