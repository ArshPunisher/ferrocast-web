import {
  ENGINE_BLENDS,
  ENGINE_DEINTERLACE,
  ENGINE_SCALE_FILTERS,
  resolveTransitionFromScenes,
  type AutoConfigAppliedSummary,
  type AutoConfigCandidate,
  type AutoConfigMode,
  type AutoConfigRecommendation,
  type AutoConfigState,
  type EncodeBudget,
  type EngineBlend,
  type EngineClipboard,
  type EngineDeinterlace,
  type EncoderFamily,
  type EngineFilter,
  type EngineImportPreview,
  type EngineImportReport,
  type EngineImportSkip,
  type EngineItem,
  type EngineLevel,
  type EngineMonitor,
  type EngineNamedTransition,
  type EngineObsCollection,
  type EngineOption,
  type EnginePasteResult,
  type EngineRecordStats,
  type EngineScaleFilter,
  type EngineSettings,
  type EngineShelf,
  type EngineShow,
  type EngineSourceUse,
  type EngineStats,
  type EngineStudioOptions,
  type EngineStreamStats,
  type EngineTransform,
  type EngineTransition,
  type EngineTransitionMatrixRule,
  type LimitedBy,
  type NewEngineSource,
  type RollbackTrigger,
  type StillResult,
} from '../../studio-engine'
import type { Service, UploadCheck } from '../../golive'
import { HttpError } from '../http-error'
import { clone, requireObj, type DemoHost } from './host'

type DemoOptIn = Pick<EngineOption, 'key' | 'label' | 'kind'> & {
  help?: string
  visible?: boolean
  enabled?: boolean
  min?: number | null
  max?: number | null
  step?: number | null
  slider?: boolean
  suffix?: string
  default?: unknown
  choices?: string[]
  values?: (string | number | boolean)[]
}

function demoOpt(over: DemoOptIn): EngineOption {
  const out: EngineOption = {
    key: over.key,
    label: over.label,
    kind: over.kind,
    help: over.help ?? '',
    visible: over.visible ?? true,
    enabled: over.enabled ?? true,
    min: over.min ?? null,
    max: over.max ?? null,
    step: over.step ?? null,
    slider: over.slider ?? false,
    suffix: over.suffix ?? '',
    choices: over.choices ?? [],
    values: over.values ?? [],
    group: [],
  }
  if (over.default !== undefined) out.default = over.default
  return out
}

const DEMO_FILTER_OPTIONS: Record<string, EngineOption[]> = {
  noise_suppress_filter_v2: [
    demoOpt({
      key: 'method',
      label: 'Method',
      kind: 'list',
      choices: ['RNNoise (good)', 'Speex (light)'],
      values: ['rnnoise', 'speex'],
      default: 'rnnoise',
    }),
    demoOpt({
      key: 'suppress_level',
      label: 'Suppression level',
      kind: 'int',
      min: -60,
      max: 0,
      step: 1,
      slider: true,
      suffix: ' dB',
      default: -30,
    }),
  ],
  expander_filter: [
    demoOpt({
      key: 'presets',
      label: 'Preset',
      kind: 'list',
      choices: ['Expander', 'Gate'],
      values: ['expander', 'gate'],
      default: 'expander',
    }),
    demoOpt({
      key: 'ratio',
      label: 'Ratio',
      kind: 'float',
      min: 1,
      max: 20,
      step: 0.1,
      slider: true,
      suffix: ':1',
      default: 2,
    }),
    demoOpt({
      key: 'threshold',
      label: 'Threshold',
      kind: 'float',
      min: -60,
      max: 0,
      step: 0.1,
      slider: true,
      suffix: ' dB',
      default: -40,
    }),
    demoOpt({
      key: 'attack_time',
      label: 'Attack',
      kind: 'int',
      min: 1,
      max: 100,
      step: 1,
      suffix: ' ms',
      default: 10,
    }),
    demoOpt({
      key: 'release_time',
      label: 'Release',
      kind: 'int',
      min: 1,
      max: 1000,
      step: 1,
      suffix: ' ms',
      default: 50,
    }),
    demoOpt({
      key: 'output_gain',
      label: 'Output Gain',
      kind: 'float',
      min: -32,
      max: 32,
      step: 0.1,
      slider: true,
      suffix: ' dB',
      default: 0,
    }),
    demoOpt({
      key: 'detector',
      label: 'Detection',
      kind: 'list',
      choices: ['RMS', 'Peak'],
      values: ['RMS', 'peak'],
      default: 'RMS',
    }),
  ],
  noise_gate_filter: [
    demoOpt({
      key: 'open_threshold',
      label: 'Open threshold',
      kind: 'float',
      min: -96,
      max: 0,
      step: 0.5,
      slider: true,
      suffix: ' dB',
      default: -26,
    }),
    demoOpt({
      key: 'close_threshold',
      label: 'Close threshold',
      kind: 'float',
      min: -96,
      max: 0,
      step: 0.5,
      slider: true,
      suffix: ' dB',
      default: -32,
    }),
    demoOpt({ key: 'attack_time', label: 'Attack', kind: 'int', min: 1, max: 500, step: 1, suffix: ' ms', default: 25 }),
    demoOpt({ key: 'hold_time', label: 'Hold', kind: 'int', min: 1, max: 1000, step: 1, suffix: ' ms', default: 200 }),
    demoOpt({ key: 'release_time', label: 'Release', kind: 'int', min: 1, max: 1000, step: 1, suffix: ' ms', default: 150 }),
  ],
  compressor_filter: [
    demoOpt({
      key: 'ratio',
      label: 'Ratio',
      kind: 'float',
      min: 1,
      max: 32,
      step: 0.5,
      slider: true,
      suffix: ':1',
      default: 10,
    }),
    demoOpt({
      key: 'threshold',
      label: 'Threshold',
      kind: 'float',
      min: -60,
      max: 0,
      step: 0.1,
      slider: true,
      suffix: ' dB',
      default: -18,
    }),
    demoOpt({
      key: 'attack_time',
      label: 'Attack',
      kind: 'int',
      min: 1,
      max: 500,
      step: 1,
      suffix: ' ms',
      default: 6,
    }),
    demoOpt({
      key: 'release_time',
      label: 'Release',
      kind: 'int',
      min: 1,
      max: 1000,
      step: 1,
      suffix: ' ms',
      default: 60,
    }),
    demoOpt({
      key: 'output_gain',
      label: 'Output Gain',
      kind: 'float',
      min: -32,
      max: 32,
      step: 0.1,
      slider: true,
      suffix: ' dB',
      default: 0,
    }),
    demoOpt({
      key: 'sidechain_source',
      label: 'Sidechain/Ducking Source',
      kind: 'list',
      choices: ['None'],
      values: ['none'],
      default: 'none',
    }),
  ],
  limiter_filter: [
    demoOpt({
      key: 'threshold',
      label: 'Threshold',
      kind: 'float',
      min: -60,
      max: 0,
      step: 0.1,
      slider: true,
      suffix: ' dB',
      default: -6,
    }),
    demoOpt({
      key: 'release_time',
      label: 'Release',
      kind: 'int',
      min: 1,
      max: 1000,
      step: 1,
      suffix: ' ms',
      default: 60,
    }),
  ],
  gain_filter: [
    demoOpt({
      key: 'db',
      label: 'Gain',
      kind: 'float',
      min: -30,
      max: 30,
      step: 0.1,
      slider: true,
      suffix: ' dB',
      default: 0,
    }),
  ],
}

export type DemoCollectionPreset = 'normal' | 'empty' | 'broken' | 'huge'
export type DemoMicPreset = 'quiet' | 'good' | 'loud' | 'silent'
export type DemoBenchProfile = 'apple_vt' | 'nvidia_nvenc' | 'weak_cpu' | 'qsv_stepdown'

export interface DemoStudioEngineOptions {
  obsPreset?: DemoCollectionPreset
  streamlabsPreset?: DemoCollectionPreset
  hasCamera?: boolean
  /** The camera is there but this computer won't let the app use it (macOS privacy). */
  cameraDenied?: boolean
  /** The camera is connected (e.g. iPhone Continuity Camera) but asleep and yielding no frame. */
  cameraSleeping?: boolean
  hasMic?: boolean
  micPreset?: DemoMicPreset
  /** False simulates an unstarted engine whose `/levels` returns `{}` (meter not connected). */
  levelsConnected?: boolean
  running?: boolean
  /** Benchmark machine profile in demo mode. */
  benchProfile?: DemoBenchProfile
  /** Delay between demo benchmark steps (ms). Defaults to 180 ms in tests/demo (~1 s total). */
  benchStepMs?: number
  /** Rollback inaction timeout (ms). Defaults to 30_000. */
  confirmTimeoutMs?: number
  /** First-minute stability window (ms). Defaults to 60_000. */
  watchWindowMs?: number
}

export interface DemoAutoConfigDeps {
  runUploadCheck: () => UploadCheck
  isLive: () => boolean
  enabledPlatforms: () => { id: string; kind: Service; name: string; enhanced: boolean }[]
}

interface StoredCollection {
  list: EngineObsCollection
  preview: EngineImportPreview
  scenes: string[]
}

interface StoredSource {
  name: string
  kind: string
  audio: boolean
  settings: EngineSettings
  volume_db: number
  muted: boolean
  monitor: EngineMonitor
  filters: EngineFilter[]
  filterSettings: Record<string, EngineSettings>
  deinterlace?: EngineDeinterlace | null
  top_field_first?: boolean
  media?: boolean
  channel?: number | null
}

interface ItemFilterState {
  filters: EngineFilter[]
  settings: Record<string, EngineSettings>
}

interface CollectionSnapshot {
  activeScenes: string[]
  currentScene: string
  previewScene: string | null
  verticalOn: boolean
  verticalScenes: string[]
  verticalCurrent: string
  sceneItems: Record<string, EngineItem[]>
  sources: Record<string, StoredSource>
  transforms: Record<number, EngineTransform>
  itemFilters: Record<number, ItemFilterState>
  nextItemId: number
  namedTransitions: EngineNamedTransition[]
  transitionMatrix: EngineTransitionMatrixRule[]
  legacySceneTransitions: Record<string, EngineTransition>
  /** Which sources are the microphone and the camera, and the mic's device: part of the collection. */
  micSourceName: string
  micDeviceId: string
  cameraSourceName: string
}

interface CopiedSourceBundle {
  item: EngineItem
  transforms: Record<number, EngineTransform>
  itemFilters: Record<number, ItemFilterState>
  sources: StoredSource[]
}

interface UndoEntry {
  label: string
  snapshot?: CollectionSnapshot
  itemUndo?: { id: number; transform: EngineTransform }
}

const CANVAS_W = 1920
const CANVAS_H = 1080
const AUDIO_KINDS = new Set([
  'coreaudio_input_capture',
  'coreaudio_output_capture',
  'sck_audio_capture',
  'wasapi_input_capture',
  'wasapi_output_capture',
  'pulse_input_capture',
  'pulse_output_capture',
])
const CAMERA_KINDS = new Set([
  'av_capture_input_v2',
  'av_capture_input',
  'macos-avcapture',
  'macos-avcapture-fast',
  'dshow_input',
  'v4l2_input',
])
const BLEND_SET = new Set<string>(ENGINE_BLENDS)
const SCALE_SET = new Set<string>(ENGINE_SCALE_FILTERS)
const DEINTERLACE_SET = new Set<string>(ENGINE_DEINTERLACE)

function computeBox(t: EngineTransform): { x: number; y: number; w: number; h: number } {
  const croppedW = Math.max(1, t.width - t.crop_left - t.crop_right)
  const croppedH = Math.max(1, t.height - t.crop_top - t.crop_bottom)
  const w =
    t.bounds !== 'none' && t.bounds_width > 0
      ? t.bounds_width
      : Math.max(1, croppedW * Math.abs(t.scale_x))
  const h =
    t.bounds !== 'none' && t.bounds_height > 0
      ? t.bounds_height
      : Math.max(1, croppedH * Math.abs(t.scale_y))
  return { x: t.x, y: t.y, w, h }
}

function frameFromTransform(t: EngineTransform): [number, number, number, number, number, number] {
  const { x, y, w, h } = computeBox(t)
  const rad = (t.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const sx = (t.scale_x < 0 ? -1 : 1) * w
  const sy = (t.scale_y < 0 ? -1 : 1) * h
  const clean = (n: number) => (Math.abs(n) < 1e-6 ? 0 : Math.round(n * 1000) / 1000)
  return [clean(sx * cos), clean(sx * sin), clean(-sy * sin), clean(sy * cos), clean(x), clean(y)]
}

function sameTransform(a: EngineTransform, b: EngineTransform): boolean {
  const eq = (x: number, y: number) => Math.abs(x - y) < 1e-4
  return (
    eq(a.x, b.x) &&
    eq(a.y, b.y) &&
    eq(a.rotation, b.rotation) &&
    eq(a.scale_x, b.scale_x) &&
    eq(a.scale_y, b.scale_y) &&
    a.alignment === b.alignment &&
    a.bounds === b.bounds &&
    a.bounds_alignment === b.bounds_alignment &&
    eq(a.bounds_width, b.bounds_width) &&
    eq(a.bounds_height, b.bounds_height) &&
    a.crop_left === b.crop_left &&
    a.crop_top === b.crop_top &&
    a.crop_right === b.crop_right &&
    a.crop_bottom === b.crop_bottom &&
    a.width === b.width &&
    a.height === b.height
  )
}

function defaultTransform(
  box: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H },
): EngineTransform {
  return {
    x: box.x,
    y: box.y,
    rotation: 0,
    scale_x: 1,
    scale_y: 1,
    alignment: 5,
    bounds: 'stretch',
    bounds_alignment: 5,
    bounds_width: box.w,
    bounds_height: box.h,
    crop_left: 0,
    crop_top: 0,
    crop_right: 0,
    crop_bottom: 0,
    width: Math.max(1, Math.round(box.w)),
    height: Math.max(1, Math.round(box.h)),
  }
}

const CAMERA_SVGS = [
  {
    name: 'FaceTime HD Camera',
    id: 'cam-facetime',
    accent: '#4aa8ff',
    subtitle: '1080p 30 fps · Built-in',
  },
  {
    name: 'Elgato Facecam',
    id: 'cam-elgato',
    accent: '#f5a623',
    subtitle: '1080p 60 fps · USB 3.0',
  },
] as const

const MIC_DEVICES = [
  { name: 'MacBook Pro Microphone', id: 'mic-builtin' },
  { name: 'Shure MV7 USB', id: 'mic-shure' },
] as const

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function cameraFrameSvg(deviceValue: unknown): string {
  const cam = CAMERA_SVGS.find((c) => c.id === deviceValue) ?? CAMERA_SVGS[0]
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
      `<defs>` +
      `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#11161f"/>` +
      `<stop offset="100%" stop-color="#1d2838"/>` +
      `</linearGradient>` +
      `<radialGradient id="glow" cx="50%" cy="42%" r="48%">` +
      `<stop offset="0%" stop-color="${cam.accent}" stop-opacity="0.28"/>` +
      `<stop offset="100%" stop-color="${cam.accent}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="640" height="360" fill="url(#bg)"/>` +
      `<rect width="640" height="360" fill="url(#glow)"/>` +
      `<rect x="24" y="24" width="592" height="312" rx="14" fill="none" stroke="${cam.accent}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="10 8"/>` +
      `<circle cx="320" cy="148" r="42" fill="#2c3a4f" stroke="${cam.accent}" stroke-width="2.5"/>` +
      `<path d="M244 268c0-42 34-68 76-68s76 26 76 68" fill="#243145" stroke="${cam.accent}" stroke-opacity="0.6" stroke-width="2.5"/>` +
      `<rect x="38" y="38" width="14" height="14" rx="7" fill="#34d399"/>` +
      `<text x="62" y="50" fill="#e6edf6" font-family="system-ui, sans-serif" font-size="14" font-weight="600">${cam.name}</text>` +
      `<text x="320" y="314" text-anchor="middle" fill="#9fb0c7" font-family="system-ui, sans-serif" font-size="13">${cam.subtitle}</text>` +
      `</svg>`,
  )
}

function obsFixtures(preset: DemoCollectionPreset): StoredCollection[] {
  if (preset === 'empty') return []
  if (preset === 'broken') {
    return [
      {
        list: { id: 'broken-backup', name: 'Corrupted Backup', scenes: 3, sources: 7 },
        scenes: [],
        preview: {
          source: 'obs',
          id: 'broken-backup',
          name: 'Corrupted Backup',
          scenes: 0,
          sources: 0,
          web_pages: 0,
          scene_names: [],
          truncated_scenes: 0,
          device_resets: [],
          skipped: [],
          skipped_total: 0,
          missing: [],
        },
      },
    ]
  }
  if (preset === 'huge') {
    const sceneNames = Array.from(
      { length: 12 },
      (_, i) => `Scene ${String(i + 1).padStart(2, '0')}`,
    )
    const skipped: EngineImportSkip[] = Array.from({ length: 18 }, (_, i) => ({
      category: i % 3 === 0 ? 'filter' : 'source',
      name: i % 3 === 0 ? `Mic / VST Plugin ${i + 1}` : `Plugin Overlay ${i + 1}`,
      kind: i % 3 === 0 ? 'vst_filter' : 'obs_custom_plugin',
      reason:
        i % 3 === 0
          ? 'VST plugin filter "vst_filter" cannot migrate automatically; re-add it in Studio if installed.'
          : 'Uses plugin source "obs_custom_plugin", which is not installed in Ferrocast.',
    }))
    return [
      {
        list: { id: 'mega-archive', name: 'Mega Broadcast Archive', scenes: 120, sources: 1450 },
        scenes: sceneNames,
        preview: {
          source: 'obs',
          id: 'mega-archive',
          name: 'Mega Broadcast Archive',
          scenes: 120,
          sources: 1450,
          web_pages: 14,
          scene_names: sceneNames,
          truncated_scenes: 108,
          device_resets: [],
          skipped,
          skipped_total: 18,
          missing: ['obs_custom_plugin'],
        },
      },
    ]
  }
  return [
    {
      list: { id: 'main-show', name: 'Main Streaming Setup', scenes: 4, sources: 9 },
      scenes: ['Starting Soon', 'Gameplay', 'Just Chatting', 'BRB'],
      preview: {
        source: 'obs',
        id: 'main-show',
        name: 'Main Streaming Setup',
        scenes: 4,
        sources: 9,
        web_pages: 2,
        scene_names: ['Starting Soon', 'Gameplay', 'Just Chatting', 'BRB'],
        truncated_scenes: 0,
        device_resets: [],
        skipped: [
          {
            category: 'source',
            name: 'GameHook DX11',
            kind: 'game_capture',
            reason: 'Uses Windows source "game_capture", which is not available on this computer.',
          },
          {
            category: 'source',
            name: 'NDI Studio Cam',
            kind: 'obs_ndi_source',
            reason: 'Uses NDI. Install or enable NDI on this computer before using this source.',
          },
          {
            category: 'filter',
            name: 'Mic / Legacy VST',
            kind: 'vst_filter',
            reason:
              'VST plugin filter "vst_filter" cannot migrate automatically; re-add it in Studio if installed.',
          },
        ],
        skipped_total: 3,
        missing: ['game_capture', 'obs_ndi_source'],
      },
    },
    {
      list: { id: 'podcast', name: 'Podcast and Chat', scenes: 2, sources: 4 },
      scenes: ['Hosts Camera', 'Screen Share'],
      preview: {
        source: 'obs',
        id: 'podcast',
        name: 'Podcast and Chat',
        scenes: 2,
        sources: 4,
        web_pages: 1,
        scene_names: ['Hosts Camera', 'Screen Share'],
        truncated_scenes: 0,
        device_resets: [],
        skipped: [],
        skipped_total: 0,
        missing: [],
      },
    },
  ]
}

function streamlabsFixtures(preset: DemoCollectionPreset): StoredCollection[] {
  if (preset === 'empty') return []
  if (preset === 'broken') {
    return [
      {
        list: { id: 'sl-broken', name: 'Broken Streamlabs Export', scenes: 2, sources: 5 },
        scenes: [],
        preview: {
          source: 'streamlabs',
          id: 'sl-broken',
          name: 'Broken Streamlabs Export',
          scenes: 0,
          sources: 0,
          web_pages: 0,
          scene_names: [],
          truncated_scenes: 0,
          device_resets: [],
          skipped: [],
          skipped_total: 0,
          missing: [],
        },
      },
    ]
  }
  if (preset === 'huge') {
    const sceneNames = Array.from(
      { length: 12 },
      (_, i) => `SL Scene ${String(i + 1).padStart(2, '0')}`,
    )
    return [
      {
        list: { id: 'sl-mega', name: 'Streamlabs Studio Archive', scenes: 96, sources: 980 },
        scenes: sceneNames,
        preview: {
          source: 'streamlabs',
          id: 'sl-mega',
          name: 'Streamlabs Studio Archive',
          scenes: 96,
          sources: 980,
          web_pages: 18,
          scene_names: sceneNames,
          truncated_scenes: 84,
          device_resets: [
            {
              category: 'source',
              name: 'StreamCam Main',
              kind: 'dshow_input',
              reason: 'Comes from another system and arrives empty so you can pick a camera here.',
            },
          ],
          skipped: [
            {
              category: 'source',
              name: 'Prize Wheel',
              kind: 'streamlabs_spin_wheel',
              reason:
                'Streamlabs native feature "streamlabs_spin_wheel" does not have a built-in Ferrocast source.',
            },
          ],
          skipped_total: 1,
          missing: ['streamlabs_spin_wheel'],
        },
      },
    ]
  }
  return [
    {
      list: { id: 'sl-neon', name: 'Streamlabs Neon Pack', scenes: 5, sources: 12 },
      scenes: ['Starting Soon', 'Live Gameplay', 'Chatting', 'BRB', 'Stream Ending'],
      preview: {
        source: 'streamlabs',
        id: 'sl-neon',
        name: 'Streamlabs Neon Pack',
        scenes: 5,
        sources: 12,
        web_pages: 3,
        scene_names: ['Starting Soon', 'Live Gameplay', 'Chatting', 'BRB', 'Stream Ending'],
        truncated_scenes: 0,
        device_resets: [
          {
            category: 'source',
            name: 'StreamCam',
            kind: 'dshow_input',
            reason:
              'Comes from another system and arrives empty so you can pick a camera on this computer.',
          },
          {
            category: 'source',
            name: 'Shure SM7B',
            kind: 'wasapi_input_capture',
            reason:
              'Comes from another system and arrives empty so you can pick your microphone here.',
          },
        ],
        skipped: [
          {
            category: 'source',
            name: 'Spin Wheel Widget',
            kind: 'streamlabs_spin_wheel',
            reason:
              'Streamlabs native feature "streamlabs_spin_wheel" does not have a built-in Ferrocast source.',
          },
          {
            category: 'filter',
            name: 'Shure SM7B / Shader Gate',
            kind: 'custom_shader_fx',
            reason: 'Uses plugin filter "custom_shader_fx", which is not available in Ferrocast.',
          },
        ],
        skipped_total: 2,
        missing: ['streamlabs_spin_wheel'],
      },
    },
    {
      list: { id: 'sl-minimal', name: 'Minimal Streamlabs Setup', scenes: 2, sources: 4 },
      scenes: ['Main Scene', 'Be Right Back'],
      preview: {
        source: 'streamlabs',
        id: 'sl-minimal',
        name: 'Minimal Streamlabs Setup',
        scenes: 2,
        sources: 4,
        web_pages: 1,
        scene_names: ['Main Scene', 'Be Right Back'],
        truncated_scenes: 0,
        device_resets: [],
        skipped: [],
        skipped_total: 0,
        missing: [],
      },
    },
  ]
}

export class DemoStudioEngine {
  private opts: Required<DemoStudioEngineOptions>
  private readonly host: DemoHost | null
  private deps: DemoAutoConfigDeps | null = null
  private shelfCollections: EngineShelf = {
    current: 'untitled',
    list: [{ id: 'untitled', name: 'Untitled' }],
  }
  private shelfProfiles: EngineShelf = {
    current: 'default',
    list: [{ id: 'default', name: 'Default' }],
  }
  private activeScenes: string[] = [
    'Main',
    'Gameplay',
    'Chatting',
    'BRB',
    'Starting Soon',
    'Ending',
  ]
  private currentScene = 'Main'
  private previewScene: string | null = null
  private verticalOn = false
  private verticalScenes: string[] = []
  private verticalCurrent = ''
  /** The T-bar as it was last moved: active until it is released. */
  private tbarState: { active: boolean; at: number } = { active: false, at: 0 }
  private black = false
  private previewPaused = false
  private namedTransitions: EngineNamedTransition[] = [
    { name: 'Fade', kind: 'fade_transition', ms: 300, settings: {}, default: true },
    { name: 'Cut', kind: 'cut_transition', ms: 0, settings: {}, default: false },
    {
      name: 'Quick Swipe',
      kind: 'swipe_transition',
      ms: 450,
      settings: { direction: 'left', swipe_in: false },
      default: false,
    },
  ]
  private transitionMatrix: EngineTransitionMatrixRule[] = [
    { from: null, to: 'BRB', transition: 'Cut' },
    { from: 'Main', to: 'Gameplay', transition: 'Quick Swipe' },
  ]
  private legacySceneTransitions = new Map<string, EngineTransition>()
  private kindSettings = new Map<string, EngineSettings>()
  private quickTransitions: EngineTransition[] = [
    { kind: 'cut_transition', ms: 0 },
    { kind: 'fade_transition', ms: 300 },
  ]
  private studioModeOptions: EngineStudioOptions = {
    swap: true,
    duplicate_scene: true,
    duplicate_sources: false,
    double_click: false,
  }
  public lastResolvedTransition: {
    name: string
    kind: string
    ms: number
    settings: EngineSettings
    via: string
  } | null = null
  private micSourceName = 'Mic'
  private micDeviceId = 'mic-builtin'
  private cameraSourceName = 'Webcam'
  private sceneItems = new Map<string, EngineItem[]>()
  private sources = new Map<string, StoredSource>()
  private transforms = new Map<number, EngineTransform>()
  private itemFilters = new Map<number, ItemFilterState>()
  private nextItemId = 1
  private undoStack: UndoEntry[] = []
  private redoStack: UndoEntry[] = []
  private collections = new Map<string, CollectionSnapshot>()
  private clipboardSummary: EngineClipboard | null = null
  private clipboardSource: CopiedSourceBundle | null = null
  private clipboardFiltersData: ItemFilterState | null = null
  private recording = false
  private recordingPaused = false
  private recordFile: string | null = null
  private streamActive = false
  private streamStartedAt = 0
  private onStreamChange?: ((active: boolean) => void) | undefined
  private sourceRecords = new Map<string, string>()
  private replayActive = false
  private replayLast: string | null = null
  private virtualcam: { active: boolean; source: string | null } = { active: false, source: null }
  private filters = new Map<string, EngineFilter[]>()
  private audioVolumeDb = new Map<string, number>()
  private audioMuted = new Map<string, boolean>()
  private recordActive = false
  private virtualCamActive = false
  private ndiActive = false
  private showActive = false
  private simDropped = 0
  private simLagged = 0
  private simSkipped = 0
  private benchJobSeq = 0
  private benchCancelToken = 0
  private applyWatchToken = 0
  private confirmDeadlineAt = 0
  private watchDeadlineAt = 0
  private wasLive = false
  private watchStarted = false
  private pendingOffer: { trigger: RollbackTrigger; reason: string } | null = null
  private snapshot: Record<string, unknown> | null = null
  private baselineLagged = 0
  private baselineSkipped = 0
  private autoConfigState: AutoConfigState = emptyAutoConfigState()
  private studioSettingsData: Record<string, unknown> = {
    encoder: 'hardware',
    video_kbps: 6000,
    vbr: true,
    keyframe_s: 2,
    profile: 'high',
    scale: null,
    scale_filter: 'bicubic',
    audio_kbps: 160,
    width: 1920,
    height: 1080,
    fps: 60,
    record_folder: null,
    record_folder_default: '/Users/demo/Movies/Ferrocast',
    record_format: 'mp4',
    record_quality: 'high',
    reconnect: true,
    reconnect_every_s: 10,
    reconnect_tries: 25,
    delay_s: 0,
    sample_rate: 48000,
    stereo: true,
    monitoring: null,
    hotkeys: {},
  }

  constructor(
    opts: DemoStudioEngineOptions = {},
    host: DemoHost | null = null,
    hooks?: { onStreamChange?: (active: boolean) => void },
  ) {
    this.host = host
    this.opts = {
      obsPreset: opts.obsPreset ?? 'normal',
      streamlabsPreset: opts.streamlabsPreset ?? 'normal',
      hasCamera: opts.hasCamera ?? true,
      cameraDenied: opts.cameraDenied ?? false,
      cameraSleeping: opts.cameraSleeping ?? false,
      hasMic: opts.hasMic ?? true,
      micPreset: opts.micPreset ?? 'quiet',
      levelsConnected: opts.levelsConnected ?? true,
      running: opts.running ?? false,
      benchProfile: opts.benchProfile ?? 'apple_vt',
      benchStepMs: opts.benchStepMs ?? 180,
      confirmTimeoutMs: opts.confirmTimeoutMs ?? 30_000,
      watchWindowMs: opts.watchWindowMs ?? 60_000,
    }
    this.onStreamChange = hooks?.onStreamChange
    this.seedDefaults()
    this.collections.set(this.shelfCollections.current, this.captureSnapshot())
  }

  isRunning(): boolean {
    return this.opts.running
  }

  isStreaming(): boolean {
    return this.opts.running && this.streamActive
  }

  isReplayActive(): boolean {
    return this.opts.running && this.replayActive
  }

  /** Saves the replay buffer now → its file, or null when the buffer is off (or the engine). */
  saveReplayNow(): string | null {
    if (!this.opts.running || !this.replayActive) return null
    this.replayLast = `${this.recordFolder()}/Replay-${Date.now()}.mp4`
    return this.replayLast
  }

  private recordFolder(): string {
    return String(
      this.studioSettingsData.record_folder ??
        this.studioSettingsData.record_folder_default ??
        '/Users/demo/Movies/Ferrocast',
    )
  }

  private recordFormat(): string {
    return String(this.studioSettingsData.record_format ?? 'mp4')
  }

  private startRecordingState(): EngineRecordStats {
    this.recording = true
    this.recordingPaused = false
    this.recordFile = `${this.recordFolder()}/Ferrocast ${Date.now()}.${this.recordFormat()}`
    return {
      active: true,
      paused: false,
      bytes: 0,
      frames: 0,
      file: this.recordFile,
      seconds: 0,
      error: null,
      encoder: 'VideoToolbox',
    }
  }

  private stopRecordingState(): void {
    this.recording = false
    this.recordingPaused = false
    this.recordFile = null
    this.sourceRecords.clear()
  }

  setRecording(on: boolean): void {
    if (on && !this.recording) this.startRecordingState()
    else if (!on) this.stopRecordingState()
  }

  isBusy(): boolean {
    return this.isStreaming() || (this.opts.running && this.recording)
  }

  collectionNames(): string[] {
    return this.shelfCollections.list.map((c) => c.name)
  }

  /** Switch the simulated Studio engine to an imported `.overlay` theme-pack collection. */
  importOverlayCollection(input: {
    name: string
    scenes: string[]
    overlays: { scene: string; overlay: { id: string; name: string; url: string } }[]
    canvas: { width: number; height: number }
  }): { id: string; name: string; previousId: string } {
    const previousId = this.shelfCollections.current
    this.collections.set(previousId, this.captureSnapshot())
    const baseSlug =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'set'
    let id = baseSlug
    let n = 2
    while (
      this.shelfCollections.list.some((x) => x.id === id) ||
      ['current', 'import', 'overlay'].includes(id)
    ) {
      id = `${baseSlug}-${n++}`
    }
    this.shelfCollections.list.push({ id, name: input.name })
    this.shelfCollections.current = id

    const sceneNames = input.scenes.length > 0 ? input.scenes : ['Main']
    this.seedForScenes(sceneNames, true)

    const byScene = new Map<string, { id: string; name: string; url: string }[]>()
    for (const ov of input.overlays) {
      const list = byScene.get(ov.scene) ?? []
      list.push(ov.overlay)
      byScene.set(ov.scene, list)
    }

    for (const scene of sceneNames) {
      const items = this.sceneItems.get(scene) ?? []
      for (const ov of byScene.get(scene) ?? []) {
        let srcName = ov.name
        let k = 2
        while (this.sources.has(srcName)) srcName = `${ov.name} (${k++})`
        const src = this.makeSource(srcName, 'ferrocast_web', {
          url: ov.url,
          width: input.canvas.width,
          height: input.canvas.height,
        })
        this.sources.set(src.name, src)
        items.push(
          this.createSceneItem(src, {
            x: 0,
            y: 0,
            w: input.canvas.width,
            h: input.canvas.height,
          }),
        )
      }
      this.sceneItems.set(scene, items)
    }

    if (this.opts.hasCamera && sceneNames[0]) {
      const cam = this.makeSource(this.cameraSourceName, 'av_capture_input_v2', {
        device: CAMERA_SVGS[0].id,
      })
      this.sources.set(cam.name, cam)
      const firstItems = this.sceneItems.get(sceneNames[0]) ?? []
      firstItems.push(this.createSceneItem(cam, { x: 1380, y: 720, w: 480, h: 270 }))
      this.sceneItems.set(sceneNames[0], firstItems)
    }

    this.collections.set(id, this.captureSnapshot())
    return { id, name: input.name, previousId }
  }

  /** Revert an `.overlay` theme-pack import in the simulated Studio engine and restore the prior snapshot. */
  undoOverlayCollection(collectionId: string, previousId: string): string | null {
    const restored = this.shelfCollections.list.some(
      (c) => c.id === previousId && c.id !== collectionId,
    )
      ? previousId
      : (this.shelfCollections.list.find((c) => c.id !== collectionId)?.id ?? null)
    if (restored) {
      this.shelfCollections.current = restored
      const snap = this.collections.get(restored)
      if (snap) this.restoreSnapshot(snap)
      else {
        this.seedForScenes(['Main'], true)
        this.collections.set(restored, this.captureSnapshot())
      }
      this.clearHistory()
    }
    this.shelfCollections.list = this.shelfCollections.list.filter((c) => c.id !== collectionId)
    this.collections.delete(collectionId)
    return restored
  }

  sceneNames(): string[] {
    return [...this.activeScenes]
  }

  hasScene(name: string): boolean {
    return this.activeScenes.includes(name)
  }

  currentSceneName(): string {
    return this.currentScene
  }

  switchShowScene(name: string): boolean {
    if (!this.hasScene(name)) return false
    this.currentScene = name
    // On air for real, as when the person switches: not still faded to black.
    this.black = false
    return true
  }

  sceneItemEnabled(scene: string, source: string): boolean | null {
    const it = this.sceneItems.get(scene)?.find((x) => x.name === source)
    return it ? it.visible : null
  }

  setSceneItemEnabled(scene: string, source: string, visible: boolean): boolean {
    const it = this.sceneItems.get(scene)?.find((x) => x.name === source)
    if (!it) return false
    it.visible = visible
    return true
  }

  isSourceMuted(name: string): boolean {
    return this.sources.get(name)?.muted ?? false
  }

  hasSource(name: string): boolean {
    return this.sources.has(name)
  }

  setSourceMuted(name: string, muted: boolean): boolean {
    const src = this.sources.get(name)
    if (!src) return false
    src.muted = muted
    return true
  }

  currentStreamStats(): EngineStreamStats | null {
    if (!this.opts.running || !this.streamActive) return null
    const elapsedSec = Math.max(0.05, (Date.now() - this.streamStartedAt) / 1000)
    const fps = Number(this.studioSettingsData.fps ?? 60) || 60
    const kbps = Number(this.studioSettingsData.video_kbps ?? 6000) || 6000
    return {
      active: true,
      reconnecting: false,
      bytes: Math.floor(elapsedSec * kbps * 125),
      frames: Math.max(1, Math.floor(elapsedSec * fps)),
      dropped: 0,
      error: null,
      encoder: 'VideoToolbox',
    }
  }

  currentVideoKbps(): number {
    return Number(this.studioSettingsData.video_kbps ?? 6000) || 6000
  }

  setStreaming(on: boolean): EngineStreamStats | null {
    if (on && !this.opts.running) {
      throw new HttpError(
        422,
        'studio_not_running',
        'The Studio isn’t running.',
        'Start the Studio first.',
      )
    }
    this.streamActive = on
    this.streamStartedAt = on ? Date.now() : 0
    this.onStreamChange?.(on)
    return this.currentStreamStats()
  }

  setAutoConfigDeps(deps: DemoAutoConfigDeps): void {
    this.deps = deps
  }

  setStreamActive(on: boolean): void {
    this.streamActive = on
    this.evaluateWatchStep()
  }

  setRecordActive(on: boolean): void {
    this.recordActive = on
    this.evaluateWatchStep()
  }

  setReplayActive(on: boolean): void {
    this.replayActive = on
    this.evaluateWatchStep()
  }

  setVirtualCamActive(on: boolean): void {
    this.virtualCamActive = on
    this.evaluateWatchStep()
  }

  setNdiActive(on: boolean): void {
    this.ndiActive = on
    this.evaluateWatchStep()
  }

  setShowActive(on: boolean): void {
    this.showActive = on
    this.evaluateWatchStep()
  }

  injectDroppedFrames(dropped: number, lagged = 0, skipped = 0): void {
    this.simDropped += dropped
    this.simLagged += lagged
    this.simSkipped += skipped
    this.evaluateWatchStep()
  }

  configure(next: Partial<DemoStudioEngineOptions>): void {
    const prevCam = this.opts.hasCamera
    const prevMic = this.opts.hasMic
    Object.assign(this.opts, next)
    if (prevCam !== this.opts.hasCamera || prevMic !== this.opts.hasMic) {
      if (!this.opts.hasCamera) this.removeSourceEverywhere(this.cameraSourceName)
      if (!this.opts.hasMic) this.removeSourceEverywhere(this.micSourceName)
    }
  }

  private obsList(): StoredCollection[] {
    return obsFixtures(this.opts.obsPreset)
  }

  private streamlabsList(): StoredCollection[] {
    return streamlabsFixtures(this.opts.streamlabsPreset)
  }

  private requireObs(id: string): StoredCollection {
    if (!id || id.startsWith('.') || id.includes('/') || id.includes('\\')) {
      throw new HttpError(400, 'invalid', 'id: one of OBS’s scene collections, as listed.')
    }
    if (this.opts.obsPreset === 'broken' && id === 'broken-backup') {
      throw new HttpError(
        422,
        'studio_collection_broken',
        'OBS’s scene collection "broken-backup" couldn’t be read because the JSON is damaged.',
        'Pick another scene collection or start fresh in Ferrocast.',
      )
    }
    const found = this.obsList().find((c) => c.list.id === id)
    if (!found) {
      throw new HttpError(
        404,
        'studio_no_obs_collection',
        `OBS has no scene collection "${id}".`,
        'Pick one from the list.',
      )
    }
    return found
  }

  private requireStreamlabs(id: string): StoredCollection {
    if (!id || id.startsWith('.') || id.includes('/') || id.includes('\\')) {
      throw new HttpError(400, 'invalid', 'id: one of Streamlabs’ scene collections, as listed.')
    }
    if (this.opts.streamlabsPreset === 'broken' && id === 'sl-broken') {
      throw new HttpError(
        422,
        'studio_collection_broken',
        'Streamlabs’ scene collection couldn’t be read because the JSON is damaged.',
        'Pick another scene collection or start fresh in Ferrocast.',
      )
    }
    const found = this.streamlabsList().find((c) => c.list.id === id)
    if (!found) {
      throw new HttpError(
        404,
        'studio_no_obs_collection',
        'Streamlabs has no such scene collection.',
        'Pick one from the list.',
      )
    }
    return found
  }

  private applyImport(entry: StoredCollection): EngineImportReport {
    const previous_id = this.shelfCollections.current
    this.collections.set(previous_id, this.captureSnapshot())
    let name = entry.list.name
    let idx = 2
    while (this.shelfCollections.list.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      name = `${entry.list.name} ${idx++}`
    }
    const baseSlug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'set'
    let id = baseSlug
    let n = 2
    while (this.shelfCollections.list.some((x) => x.id === id)) {
      id = `${baseSlug}-${n++}`
    }
    this.shelfCollections.list.push({ id, name })
    this.shelfCollections.current = id
    if (entry.scenes.length > 0) {
      this.seedForScenes(entry.scenes, true)
      const cam = this.opts.hasCamera
        ? this.makeSource(this.cameraSourceName, 'av_capture_input_v2', {
            device: CAMERA_SVGS[0].id,
          })
        : null
      if (cam) this.sources.set(cam.name, cam)
      const firstScene = entry.scenes[0]!
      if (cam) this.sceneItems.set(firstScene, [this.createSceneItem(cam)])
    }
    this.collections.set(id, this.captureSnapshot())
    return {
      id,
      previous_id,
      name,
      scenes: entry.preview.scenes,
      sources: entry.preview.sources,
      web_pages: entry.preview.web_pages,
      missing: [...entry.preview.missing],
      device_resets: clone(entry.preview.device_resets),
      skipped: clone(entry.preview.skipped),
      skipped_total: entry.preview.skipped_total,
    }
  }

  private ensureGlobalSources(): void {
    if (!this.sources.has('Desktop Audio')) {
      this.sources.set('Desktop Audio', {
        name: 'Desktop Audio',
        kind: 'sck_audio_capture',
        audio: true,
        settings: {},
        volume_db: 0,
        muted: false,
        monitor: 'off',
        filters: [],
        filterSettings: {},
        channel: 1,
      })
    }
    if (this.opts.hasMic && !this.sources.has(this.micSourceName)) {
      this.sources.set(this.micSourceName, {
        name: this.micSourceName,
        kind: 'coreaudio_input_capture',
        audio: true,
        settings: { device_id: this.micDeviceId },
        volume_db: 0,
        muted: false,
        monitor: 'off',
        filters: [],
        filterSettings: {},
        channel: 3,
      })
    }
  }

  private makeSource(
    name: string,
    kind: string,
    settings: EngineSettings = {},
    opts: { channel?: number | null; audio?: boolean } = {},
  ): StoredSource {
    const audio = opts.audio ?? (AUDIO_KINDS.has(kind) || kind === 'ferrocast_web')
    return {
      name,
      kind,
      audio,
      settings: clone(settings),
      volume_db: 0,
      muted: false,
      monitor: 'off',
      filters: [],
      filterSettings: {},
      channel: opts.channel ?? null,
    }
  }

  private createSceneItem(
    source: StoredSource,
    box: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H },
  ): EngineItem {
    const id = this.nextItemId++
    const tr = defaultTransform(box)
    this.transforms.set(id, tr)
    return {
      id,
      name: source.name,
      kind: source.kind,
      visible: true,
      locked: false,
      audio: source.audio,
      group: false,
      show: 'both',
      blend: 'normal',
      scale_filter: 'off',
      frame: frameFromTransform(tr),
      children: [],
    }
  }

  private seedDefaults(): void {
    this.activeScenes = ['Main', 'Gameplay', 'Chatting', 'BRB', 'Starting Soon', 'Ending']
    this.currentScene = 'Main'
    this.previewScene = null
    this.verticalOn = false
    this.verticalScenes = []
    this.verticalCurrent = ''
    this.sceneItems.clear()
    this.sources.clear()
    this.transforms.clear()
    this.itemFilters.clear()
    this.nextItemId = 1
    this.ensureGlobalSources()

    const overlayMain = this.makeSource('Ferrocast: Main', 'ferrocast_web', {
      url: 'http://127.0.0.1:47820/o/demo/',
      width: CANVAS_W,
      height: CANVAS_H,
    })
    const game = this.makeSource('Game', 'screen_capture', { width: CANVAS_W, height: CANVAS_H })
    const chatBox = this.makeSource('Chat Box', 'ferrocast_web', {
      url: 'http://127.0.0.1:47820/o/demo-chat/',
      width: 560,
      height: 780,
    })
    const brbCard = this.makeSource('BRB Card', 'image_source', {})
    for (const s of [overlayMain, game, chatBox, brbCard]) this.sources.set(s.name, s)

    const cam = this.opts.hasCamera
      ? this.makeSource(this.cameraSourceName, 'av_capture_input_v2', { device: CAMERA_SVGS[0].id })
      : null
    if (cam) this.sources.set(cam.name, cam)
    const mic = this.opts.hasMic ? this.sources.get(this.micSourceName)! : null

    const mainList: EngineItem[] = [
      this.createSceneItem(overlayMain, { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }),
      ...(cam ? [this.createSceneItem(cam, { x: 1380, y: 720, w: 480, h: 270 })] : []),
      ...(mic ? [this.createSceneItem(mic, { x: 0, y: 0, w: 120, h: 120 })] : []),
    ]
    const gameplayList: EngineItem[] = [
      ...(cam ? [this.createSceneItem(cam, { x: 1380, y: 720, w: 480, h: 270 })] : []),
      this.createSceneItem(game, { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }),
    ]
    const chattingList: EngineItem[] = [
      this.createSceneItem(chatBox, { x: 40, y: 120, w: 560, h: 780 }),
      ...(cam ? [this.createSceneItem(cam, { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H })] : []),
    ]
    const brbList: EngineItem[] = [
      this.createSceneItem(brbCard, { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }),
    ]
    this.sceneItems.set('Main', mainList)
    this.sceneItems.set('Gameplay', gameplayList)
    this.sceneItems.set('Chatting', chattingList)
    this.sceneItems.set('BRB', brbList)
    // The default show opens on "Starting Soon" and closes on "Ending": a fresh Studio has both.
    this.sceneItems.set('Starting Soon', [])
    this.sceneItems.set('Ending', [])
  }

  private captureSnapshot(): CollectionSnapshot {
    const sceneItems: Record<string, EngineItem[]> = {}
    for (const [k, v] of this.sceneItems) sceneItems[k] = clone(v)
    const sources: Record<string, StoredSource> = {}
    for (const [k, v] of this.sources) sources[k] = clone(v)
    const transforms: Record<number, EngineTransform> = {}
    for (const [k, v] of this.transforms) transforms[k] = clone(v)
    const itemFilters: Record<number, ItemFilterState> = {}
    for (const [k, v] of this.itemFilters) itemFilters[k] = clone(v)
    const legacySceneTransitions: Record<string, EngineTransition> = {}
    for (const [k, v] of this.legacySceneTransitions) legacySceneTransitions[k] = clone(v)
    return {
      activeScenes: [...this.activeScenes],
      currentScene: this.currentScene,
      previewScene: this.previewScene,
      verticalOn: this.verticalOn,
      verticalScenes: [...this.verticalScenes],
      verticalCurrent: this.verticalCurrent,
      sceneItems,
      sources,
      transforms,
      itemFilters,
      nextItemId: this.nextItemId,
      namedTransitions: clone(this.namedTransitions),
      transitionMatrix: clone(this.transitionMatrix),
      legacySceneTransitions,
      micSourceName: this.micSourceName,
      micDeviceId: this.micDeviceId,
      cameraSourceName: this.cameraSourceName,
    }
  }

  /**
   * Puts a snapshot back. `keepLive` (undo and redo of an edit): what is on air and the live
   * mixer controls (mute, fader, monitoring) are the person's right now and stay, as long as
   * they still make sense (the scene is still there; the source is still there).
   */
  private restoreSnapshot(snap: CollectionSnapshot, keepLive = false): void {
    const live = {
      currentScene: this.currentScene,
      previewScene: this.previewScene,
      verticalOn: this.verticalOn,
      verticalScenes: [...this.verticalScenes],
      verticalCurrent: this.verticalCurrent,
      nextItemId: this.nextItemId,
      audio: new Map(
        [...this.sources].map(([k, v]) => [
          k,
          { muted: v.muted, volume_db: v.volume_db, monitor: v.monitor },
        ]),
      ),
    }
    const liveVerticalItems = new Map<string, EngineItem[]>()
    const liveVerticalTransforms = new Map<number, EngineTransform>()
    const liveVerticalItemFilters = new Map<number, ItemFilterState>()
    const liveVerticalSources = new Map<string, StoredSource>()
    if (keepLive) {
      const collectRefs = (list: EngineItem[]) => {
        for (const it of list) {
          const tr = this.transforms.get(it.id)
          if (tr) liveVerticalTransforms.set(it.id, clone(tr))
          const flt = this.itemFilters.get(it.id)
          if (flt) liveVerticalItemFilters.set(it.id, clone(flt))
          if (!it.group) {
            const src = this.sources.get(it.name)
            if (src) liveVerticalSources.set(it.name, clone(src))
          }
          collectRefs(it.children)
        }
      }
      for (const vScene of live.verticalScenes) {
        const items = clone(this.sceneItems.get(vScene) ?? [])
        liveVerticalItems.set(vScene, items)
        collectRefs(items)
      }
    }
    this.activeScenes = [...snap.activeScenes]
    this.currentScene = snap.currentScene
    this.previewScene = snap.previewScene
    this.verticalOn = snap.verticalOn
    this.verticalScenes = [...snap.verticalScenes]
    this.verticalCurrent = snap.verticalCurrent
    this.sceneItems = new Map(Object.entries(clone(snap.sceneItems)))
    this.sources = new Map(Object.entries(clone(snap.sources)))
    this.transforms = new Map(
      Object.entries(clone(snap.transforms)).map(([k, v]) => [Number(k), v]),
    )
    this.itemFilters = new Map(
      Object.entries(clone(snap.itemFilters)).map(([k, v]) => [Number(k), v]),
    )
    this.nextItemId = snap.nextItemId
    if (keepLive) {
      if (this.activeScenes.includes(live.currentScene)) this.currentScene = live.currentScene
      if (live.previewScene === null || this.activeScenes.includes(live.previewScene))
        this.previewScene = live.previewScene
      // Vertical mode toggling is not an undo step: keep the live on/off toggle and preserve an
      // already-initialized vertical canvas when restoring a pre-vertical snapshot.
      this.verticalOn = live.verticalOn
      if (snap.verticalScenes.length === 0 && live.verticalScenes.length > 0) {
        this.verticalScenes = [...live.verticalScenes]
        this.verticalCurrent = live.verticalCurrent
        for (const [vScene, items] of liveVerticalItems) {
          if (!this.sceneItems.has(vScene)) this.sceneItems.set(vScene, items)
        }
        for (const [id, tr] of liveVerticalTransforms) {
          if (!this.transforms.has(id)) this.transforms.set(id, tr)
        }
        for (const [id, flt] of liveVerticalItemFilters) {
          if (!this.itemFilters.has(id)) this.itemFilters.set(id, flt)
        }
        for (const [name, src] of liveVerticalSources) {
          if (!this.sources.has(name)) this.sources.set(name, src)
        }
        this.nextItemId = Math.max(this.nextItemId, live.nextItemId)
      } else {
        this.verticalCurrent = this.verticalScenes.includes(live.verticalCurrent)
          ? live.verticalCurrent
          : this.verticalScenes.includes(snap.verticalCurrent)
            ? snap.verticalCurrent
            : (this.verticalScenes[0] ?? '')
      }
      for (const [name, a] of live.audio) {
        const src = this.sources.get(name)
        if (src) Object.assign(src, a)
      }
    }
    this.namedTransitions = clone(snap.namedTransitions)
    this.transitionMatrix = clone(snap.transitionMatrix)
    this.legacySceneTransitions = new Map(Object.entries(clone(snap.legacySceneTransitions)))
    this.micSourceName = snap.micSourceName
    this.micDeviceId = snap.micDeviceId
    this.cameraSourceName = snap.cameraSourceName
  }

  /** A source's new name, in the source map, the scene items, the mic and camera roles and its recording. */
  private renameSourceEverywhere(src: StoredSource, to: string): void {
    const from = src.name
    this.sources.delete(from)
    src.name = to
    this.sources.set(to, src)
    if (this.micSourceName === from) this.micSourceName = to
    if (this.cameraSourceName === from) this.cameraSourceName = to
    const renameItems = (list: EngineItem[]) => {
      for (const it of list) {
        if (!it.group && it.name === from) it.name = to
        renameItems(it.children)
      }
    }
    for (const list of this.sceneItems.values()) renameItems(list)
    if (this.sourceRecords.has(from)) {
      const rec = this.sourceRecords.get(from)!
      this.sourceRecords.delete(from)
      this.sourceRecords.set(to, rec)
    }
  }

  private pendingUndo = new Map<string, UndoEntry>()

  private clearHistory(): void {
    this.undoStack = []
    this.redoStack = []
    this.pendingUndo.clear()
  }

  private findItemAcrossScenes(id: number): { item: EngineItem; parent: EngineItem | null } | null {
    const search = (
      list: EngineItem[],
      parent: EngineItem | null,
    ): { item: EngineItem; parent: EngineItem | null } | null => {
      for (const it of list) {
        if (it.id === id) return { item: it, parent }
        if (it.children.length) {
          const inner = search(it.children, it)
          if (inner) return inner
        }
      }
      return null
    }
    for (const root of this.sceneItems.values()) {
      const found = search(root, null)
      if (found) return found
    }
    return null
  }

  private applyUndoEntry(entry: UndoEntry): UndoEntry {
    if (entry.itemUndo) {
      const current = clone(this.transforms.get(entry.itemUndo.id) ?? defaultTransform())
      const loc = this.findItemAcrossScenes(entry.itemUndo.id)
      if (loc) {
        this.setItemTransform(loc.item, clone(entry.itemUndo.transform))
        if (loc.parent) this.syncGroupFrame(loc.parent)
      } else {
        this.transforms.set(entry.itemUndo.id, clone(entry.itemUndo.transform))
      }
      return { label: entry.label, itemUndo: { id: entry.itemUndo.id, transform: current } }
    }
    const current = this.captureSnapshot()
    if (entry.snapshot) this.restoreSnapshot(entry.snapshot, true)
    return { label: entry.label, snapshot: current }
  }

  private reconcilePendingUndoSnapshot(snap: CollectionSnapshot): CollectionSnapshot {
    if (this.pendingUndo.size === 0) return snap
    const patchList = (
      list: EngineItem[],
      id: number,
      frame: ReturnType<typeof frameFromTransform>,
    ): boolean => {
      for (const it of list) {
        if (it.id === id) {
          it.frame = frame
          return true
        }
        if (it.children.length > 0 && patchList(it.children, id, frame)) {
          const box = this.groupBox(it.children)
          if (box) {
            it.frame = [box.w, 0, 0, box.h, box.x, box.y]
            const gt = snap.transforms[it.id]
            if (gt) {
              snap.transforms[it.id] = {
                ...gt,
                x: box.x,
                y: box.y,
                alignment: 5,
                bounds: 'stretch',
                bounds_alignment: 5,
                bounds_width: box.w,
                bounds_height: box.h,
              }
            }
          }
          return true
        }
      }
      return false
    }
    for (const pending of this.pendingUndo.values()) {
      if (!pending.itemUndo) continue
      const { id, transform } = pending.itemUndo
      if (id in snap.transforms) {
        snap.transforms[id] = clone(transform)
      }
      const committedFrame = frameFromTransform(transform)
      for (const sceneList of Object.values(snap.sceneItems)) {
        if (patchList(sceneList, id, committedFrame)) break
      }
    }
    return snap
  }

  private pushUndo(label: string): void {
    this.undoStack.unshift({
      label,
      snapshot: this.reconcilePendingUndoSnapshot(this.captureSnapshot()),
    })
    if (this.undoStack.length > 50) this.undoStack.pop()
    this.redoStack = []
  }

  /**
   * Records one item-local undo entry for a continuous crop drag: captures the pre-drag transform on
   * the first `save: false` request and pushes that pre-drag entry onto `undoStack` on `save: true`,
   * skipping no-op drags where the final transform equals the starting transform.
   */
  private recordDragUndo(
    key: string,
    itemId: number,
    label: string,
    save: boolean,
    before: EngineTransform,
    after: EngineTransform,
  ): void {
    if (save) {
      const pending = this.pendingUndo.get(key)
      this.pendingUndo.delete(key)
      const initial = pending?.itemUndo?.transform ?? before
      if (sameTransform(initial, after)) return
      this.undoStack.unshift({
        label,
        itemUndo: { id: itemId, transform: clone(initial) },
      })
      if (this.undoStack.length > 50) this.undoStack.pop()
      this.redoStack = []
      return
    }
    if (!this.pendingUndo.has(key) && !sameTransform(before, after)) {
      this.pendingUndo.set(key, {
        label,
        itemUndo: {
          id: itemId,
          transform: clone(before),
        },
      })
    }
  }

  private seedForScenes(sceneNames: string[], clearAll = false): void {
    this.activeScenes = [...sceneNames]
    this.currentScene = sceneNames[0] ?? 'Scene'
    this.previewScene = this.previewScene ? this.currentScene : null
    this.verticalOn = false
    this.verticalScenes = []
    this.verticalCurrent = ''
    this.sceneItems.clear()
    if (clearAll) this.sources.clear()
    this.transforms.clear()
    this.itemFilters.clear()
    this.nextItemId = 1
    this.clearHistory()
    this.ensureGlobalSources()
    for (const s of this.activeScenes) this.sceneItems.set(s, [])
  }

  private removeSourceEverywhere(sourceName: string): void {
    const prune = (list: EngineItem[]): EngineItem[] =>
      list
        .filter((it) => it.name !== sourceName)
        .map((it) => (it.children.length ? { ...it, children: prune(it.children) } : it))
    for (const [scene, list] of this.sceneItems) this.sceneItems.set(scene, prune(list))
    this.sources.delete(sourceName)
  }

  private pruneOrphanSource(sourceName: string): void {
    const src = this.sources.get(sourceName)
    if (!src || src.channel != null || sourceName === 'Desktop Audio') return
    if (this.opts.hasMic && sourceName === this.micSourceName) return
    const used = (list: EngineItem[]): boolean =>
      list.some((it) => (!it.group && it.name === sourceName) || used(it.children))
    for (const list of this.sceneItems.values()) {
      if (used(list)) return
    }
    this.sources.delete(sourceName)
  }

  private pruneItemsOrphans(items: EngineItem[]): void {
    for (const it of items) {
      if (it.group) this.pruneItemsOrphans(it.children)
      else this.pruneOrphanSource(it.name)
    }
  }

  private sceneNameTaken(name: string): boolean {
    return (
      this.activeScenes.includes(name) ||
      this.verticalScenes.includes(name) ||
      this.sources.has(name)
    )
  }

  private requireScene(scene: string): EngineItem[] {
    if (
      !this.activeScenes.includes(scene) &&
      !(this.verticalOn && this.verticalScenes.includes(scene))
    ) {
      throw new HttpError(404, 'studio_no_scene', `There's no scene called "${scene}".`)
    }
    let list = this.sceneItems.get(scene)
    if (!list) {
      list = []
      this.sceneItems.set(scene, list)
    }
    return list
  }

  private findItem(
    scene: string,
    id: number,
  ): { list: EngineItem[]; index: number; item: EngineItem; parent: EngineItem | null } {
    const root = this.requireScene(scene)
    const search = (
      list: EngineItem[],
      parent: EngineItem | null,
    ): {
      list: EngineItem[]
      index: number
      item: EngineItem
      parent: EngineItem | null
    } | null => {
      for (let i = 0; i < list.length; i++) {
        const it = list[i]!
        if (it.id === id) return { list, index: i, item: it, parent }
        if (it.children.length) {
          const inner = search(it.children, it)
          if (inner) return inner
        }
      }
      return null
    }
    const found = search(root, null)
    if (!found) {
      throw new HttpError(
        404,
        'studio_no_source',
        `There's no source #${id} in "${scene}".`,
        'Refresh the scene list.',
      )
    }
    return found
  }

  private requireSource(name: string): StoredSource {
    const found = this.sources.get(name)
    if (!found) {
      throw new HttpError(
        404,
        'studio_no_source',
        `There’s no source called "${name}".`,
        'Refresh the list of sources.',
      )
    }
    return found
  }

  private uniqueSourceName(base: string): string {
    if (!this.sceneNameTaken(base)) return base
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`
      if (!this.sceneNameTaken(candidate)) return candidate
    }
  }

  private changeInPlace(
    item: EngineItem,
    t: EngineTransform,
    parent: EngineItem | null,
    change: (tr: EngineTransform) => void,
  ): void {
    const before = frameFromTransform(t)
    const cx0 = before[4] + (before[0] + before[2]) * 0.5
    const cy0 = before[5] + (before[1] + before[3]) * 0.5
    change(t)
    const after = frameFromTransform(t)
    const cx1 = after[4] + (after[0] + after[2]) * 0.5
    const cy1 = after[5] + (after[1] + after[3]) * 0.5
    const clean = (n: number) => (Math.abs(n) < 1e-6 ? 0 : Math.round(n * 1000) / 1000)
    t.x = clean(t.x + cx0 - cx1)
    t.y = clean(t.y + cy0 - cy1)
    this.setItemTransform(item, t)
    if (parent) this.syncGroupFrame(parent)
  }

  private setItemTransform(item: EngineItem, next: EngineTransform): void {
    this.transforms.set(item.id, clone(next))
    item.frame = frameFromTransform(next)
  }

  private validateBoxCoords(box: { x: number; y: number; w: number; h: number }): void {
    const { x, y, w, h } = box
    if (
      ![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      w < 1 ||
      h < 1 ||
      [x, y, w, h].some((v) => Math.abs(v) > 100_000)
    ) {
      throw new HttpError(400, 'invalid', 'box: valid position and size (1 to 100000 pixels).')
    }
  }

  private applyBox(item: EngineItem, box: { x: number; y: number; w: number; h: number }): void {
    const cur = clone(this.transforms.get(item.id) ?? defaultTransform())
    cur.x = box.x
    cur.y = box.y
    cur.bounds = 'stretch'
    cur.bounds_width = box.w
    cur.bounds_height = box.h
    this.setItemTransform(item, cur)
  }

  private collectItemIds(item: EngineItem, out: Set<number>): void {
    out.add(item.id)
    for (const c of item.children) this.collectItemIds(c, out)
  }

  private cloneItemDeep(
    srcItem: EngineItem,
    renameMap: Map<string, string>,
    srcTransforms?: Record<number, EngineTransform>,
    srcItemFilters?: Record<number, ItemFilterState>,
  ): EngineItem {
    const newId = this.nextItemId++
    const mappedName = srcItem.group ? srcItem.name : (renameMap.get(srcItem.name) ?? srcItem.name)
    const oldTr = srcTransforms?.[srcItem.id] ?? this.transforms.get(srcItem.id)
    if (oldTr) this.transforms.set(newId, clone(oldTr))
    else this.transforms.set(newId, defaultTransform())
    const oldIf = srcItemFilters?.[srcItem.id] ?? this.itemFilters.get(srcItem.id)
    if (oldIf) this.itemFilters.set(newId, clone(oldIf))
    return {
      ...clone(srcItem),
      id: newId,
      name: mappedName,
      frame: frameFromTransform(this.transforms.get(newId)!),
      children: srcItem.children.map((c) =>
        this.cloneItemDeep(c, renameMap, srcTransforms, srcItemFilters),
      ),
    }
  }

  private allFilterNamesOk(name: string): StoredSource {
    return this.requireSource(name)
  }

  private groupBox(children: EngineItem[]): { x: number; y: number; w: number; h: number } | null {
    if (children.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const c of children) {
      const f = c.frame ?? [100, 0, 0, 100, 0, 0]
      const xs = [f[4], f[4] + f[0], f[4] + f[2], f[4] + f[0] + f[2]]
      const ys = [f[5], f[5] + f[1], f[5] + f[3], f[5] + f[1] + f[3]]
      minX = Math.min(minX, ...xs)
      minY = Math.min(minY, ...ys)
      maxX = Math.max(maxX, ...xs)
      maxY = Math.max(maxY, ...ys)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null
    return {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY),
    }
  }

  private syncGroupFrame(group: EngineItem): void {
    if (!group.group) return
    const box = this.groupBox(group.children)
    if (box) this.applyBox(group, box)
  }

  private scenesWithSplitShow(): boolean {
    const walk = (list: EngineItem[]): boolean =>
      list.some(
        (it) =>
          (it.visible && (it.show === 'stream' || it.show === 'recording')) ||
          (it.visible && walk(it.children)),
      )
    for (const list of this.sceneItems.values()) {
      if (walk(list)) return true
    }
    return false
  }

  private sceneUsingSource(name: string): string[] {
    const out: string[] = []
    const has = (list: EngineItem[]): boolean =>
      list.some((it) => (!it.group && it.name === name) || has(it.children))
    for (const scene of this.activeScenes) {
      if (has(this.sceneItems.get(scene) ?? [])) out.push(scene)
    }
    return out
  }

  private levelFor(name: string): EngineLevel {
    const src = this.sources.get(name)
    if (name !== this.micSourceName || !this.opts.hasMic || this.opts.micPreset === 'silent') {
      if (name === 'Desktop Audio') {
        return {
          peak: [-38, -38],
          magnitude: [-42, -42],
          input_peak: [-38, -38],
        }
      }
      return {
        peak: [-100, -100],
        magnitude: [-100, -100],
        input_peak: [-100, -100],
      }
    }
    const muted = src?.muted ?? false
    const volDb = src?.volume_db ?? 0
    const phase = (Date.now() % 1800) / 1800
    const ripple = Math.sin(phase * Math.PI * 2) * 3.5 + Math.cos(phase * Math.PI * 4) * 1.2
    const rawBase =
      this.opts.micPreset === 'quiet' ? -27 : this.opts.micPreset === 'loud' ? -1.8 : -15
    const raw = Math.min(-0.2, Math.max(-46, rawBase + ripple))
    if (muted) {
      return { peak: [-100, -100], magnitude: [-100, -100], input_peak: [raw, raw] }
    }
    const chain = (src?.filters ?? []).filter((f) => f.enabled)
    const hasGain = chain.find((f) => f.kind === 'gain_filter')
    const hasComp = chain.some((f) => f.kind === 'compressor_filter' || f.kind === 'limiter_filter')
    let out = raw + volDb
    if (hasGain) {
      out += this.opts.micPreset === 'quiet' ? 12 : 3
    }
    if (hasComp) {
      if (out > -11) out = -12 + (out + 11) * 0.25
      out = Math.min(-1.5, out)
    }
    out = Math.max(-99, Math.min(0, out))
    return {
      peak: [out, out - 0.6],
      magnitude: [Math.max(-99, out - 5.2), Math.max(-99, out - 5.6)],
      input_peak: [raw, raw - 0.5],
    }
  }

  route(method: string, rest: string[], body: unknown, url?: URL): unknown {
    const path = rest.join('/')
    const is = (m: string, p: string) => method === m && path === p

    if (is('GET', 'studio/engine')) {
      return {
        available: true,
        running: this.opts.running,
        version: 'Ferrocore 3.4.0-demo',
        renderer: 'metal',
        detail: null,
      }
    }
    if (is('POST', 'studio/engine/start')) {
      this.opts.running = true
      return {
        available: true,
        running: true,
        version: 'Ferrocore 3.4.0-demo',
        renderer: 'metal',
        detail: null,
      }
    }
    if (is('POST', 'studio/engine/stop')) {
      this.opts.running = false
      const wasStreaming = this.streamActive
      this.streamActive = false
      this.streamStartedAt = 0
      this.stopRecordingState()
      // The outputs go down with the engine; a restart starts them off (the last saved replay's
      // name stays: that file exists).
      this.replayActive = false
      this.virtualcam = { active: false, source: null }
      if (wasStreaming) this.onStreamChange?.(false)
      return {
        available: true,
        running: false,
        version: 'Ferrocore 3.4.0-demo',
        renderer: 'metal',
        detail: null,
      }
    }
    if (is('GET', 'studio/engine/obs-collections')) {
      return clone(this.obsList().map((c) => c.list))
    }
    if (is('POST', 'studio/engine/obs-collections/preview')) {
      const id = String(requireObj(body).id ?? '')
      return clone(this.requireObs(id).preview)
    }
    if (is('POST', 'studio/engine/obs-collections/import')) {
      const id = String(requireObj(body).id ?? '')
      return clone(this.applyImport(this.requireObs(id)))
    }
    if (is('GET', 'studio/engine/streamlabs-collections')) {
      return clone(this.streamlabsList().map((c) => c.list))
    }
    if (is('POST', 'studio/engine/streamlabs-collections/preview')) {
      const id = String(requireObj(body).id ?? '')
      return clone(this.requireStreamlabs(id).preview)
    }
    if (is('POST', 'studio/engine/streamlabs-collections/import')) {
      const id = String(requireObj(body).id ?? '')
      return clone(this.applyImport(this.requireStreamlabs(id)))
    }

    if (rest[2] === 'library' && (rest[3] === 'collections' || rest[3] === 'profiles')) {
      const isCol = rest[3] === 'collections'
      const shelf = isCol ? this.shelfCollections : this.shelfProfiles
      if (method === 'GET' && rest.length === 4) return clone(shelf)
      if (method === 'POST' && rest.length === 4) {
        const b = requireObj(body)
        const raw = String(b.name ?? '').trim()
        if (!raw) throw new HttpError(400, 'invalid', 'name: 1 to 80 letters.')
        const name = raw.slice(0, 80)
        const base =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40) || 'set'
        let id = base
        for (let n = 2; shelf.list.some((x) => x.id === id); n++) id = `${base}-${n}`
        if (isCol) {
          this.collections.set(shelf.current, this.captureSnapshot())
          if (!b.copy) {
            this.seedForScenes(['Main'], true)
          } else {
            this.clearHistory()
          }
          this.collections.set(id, this.captureSnapshot())
        }
        shelf.list.push({ id, name })
        shelf.current = id
        return { id }
      }
      if (method === 'PUT' && rest.length === 5 && rest[4] === 'current') {
        const id = String(requireObj(body).id ?? '')
        if (!shelf.list.some((x) => x.id === id)) {
          throw new HttpError(404, 'studio_no_such', `There’s no collection "${id}".`)
        }
        if (isCol && shelf.current !== id) {
          this.collections.set(shelf.current, this.captureSnapshot())
          const nextSnap = this.collections.get(id)
          if (nextSnap) this.restoreSnapshot(nextSnap)
          else {
            this.seedForScenes(['Main'], true)
            this.collections.set(id, this.captureSnapshot())
          }
          this.clearHistory()
        }
        shelf.current = id
        return { id }
      }
      if (method === 'POST' && rest.length === 6 && rest[5] === 'rename') {
        const id = decodeURIComponent(rest[4]!)
        const name = String(requireObj(body).name ?? '').trim()
        const entry = shelf.list.find((x) => x.id === id)
        if (!entry) throw new HttpError(404, 'studio_no_such', `There’s no collection "${id}".`)
        if (!name) throw new HttpError(400, 'invalid', 'name: 1 to 80 letters.')
        entry.name = name
        return undefined
      }
      if (method === 'GET' && rest.length === 6 && rest[5] === 'export') {
        const id = decodeURIComponent(rest[4]!)
        const entry = shelf.list.find((x) => x.id === id)
        if (!entry) throw new HttpError(404, 'studio_no_such', `There’s no collection "${id}".`)
        const snap =
          isCol && id === shelf.current
            ? this.captureSnapshot()
            : isCol
              ? this.collections.get(id)
              : null
        return {
          name: entry.name,
          current_scene: snap?.currentScene ?? this.currentScene,
          scenes: snap?.activeScenes ?? [],
          sources: snap ? Object.values(snap.sources) : [],
        }
      }
      if (method === 'DELETE' && rest.length === 5) {
        const id = decodeURIComponent(rest[4]!)
        const entry = shelf.list.find((x) => x.id === id)
        if (!entry) throw new HttpError(404, 'studio_no_such', `There’s no collection "${id}".`)
        if (shelf.current === id) {
          throw new HttpError(
            409,
            'studio_in_use',
            `"${entry.name}" is in use now.`,
            'Switch to another one first.',
          )
        }
        shelf.list = shelf.list.filter((x) => x.id !== id)
        if (isCol) this.collections.delete(id)
        return undefined
      }
    }

    if (is('GET', 'studio/engine/kinds')) {
      return {
        inputs: [
          { id: 'av_capture_input_v2', name: 'Video Capture Device' },
          { id: 'coreaudio_input_capture', name: 'Audio Input Capture' },
          { id: 'sck_audio_capture', name: 'macOS Audio Capture' },
          { id: 'screen_capture', name: 'macOS Screen Capture' },
          { id: 'ferrocast_web', name: 'Web Page' },
          { id: 'image_source', name: 'Image' },
          { id: 'color_source_v3', name: 'Colour' },
        ],
        filters: [
          { id: 'gain_filter', name: 'Gain' },
          { id: 'noise_suppress_filter_v2', name: 'Noise Suppression' },
          { id: 'ferrocast_deepfilter', name: 'Strong Noise Removal' },
          { id: 'expander_filter', name: 'Expander' },
          { id: 'compressor_filter', name: 'Compressor' },
          { id: 'limiter_filter', name: 'Limiter' },
        ],
        transitions: [
          { id: 'fade_transition', name: 'Fade' },
          { id: 'cut_transition', name: 'Cut' },
          { id: 'swipe_transition', name: 'Swipe' },
          { id: 'slide_transition', name: 'Slide' },
          { id: 'fade_to_color_transition', name: 'Fade to colour' },
          { id: 'wipe_transition', name: 'Wipe' },
          { id: 'obs_stinger_transition', name: 'Stinger' },
          { id: 'ferrocast_move', name: 'Move' },
        ],
        encoders: [
          {
            id: 'com.apple.videotoolbox.videoencoder.ave.avc',
            name: 'Apple VT H264 Hardware Encoder',
          },
          { id: 'obs_x264', name: 'x264' },
        ],
        outputs: [],
      }
    }

    if (method === 'GET' && rest[2] === 'kinds' && rest[4] === 'defaults') {
      const kind = decodeURIComponent(rest[3]!)
      if (kind === 'swipe_transition') return { direction: 'left', swipe_in: false }
      if (kind === 'slide_transition') return { direction: 'left' }
      if (kind === 'fade_to_color_transition') return { color: 0xff000000, switch_point: 50 }
      if (kind === 'wipe_transition')
        return { luma_image: '', luma_softness: 0.03, luma_invert: false }
      if (kind === 'obs_stinger_transition') {
        return { path: '', transition_point_type: 0, transition_point: 0 }
      }
      return {}
    }

    if (method === 'GET' && rest[2] === 'kinds' && rest[4] === 'options') {
      const kind = decodeURIComponent(rest[3]!)
      if (kind === 'swipe_transition' || kind === 'slide_transition') {
        const list: EngineOption[] = [
          {
            key: 'direction',
            label: 'Direction',
            kind: 'list',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: ['Left', 'Right', 'Up', 'Down'],
            values: ['left', 'right', 'up', 'down'],
            group: [],
            default: 'left',
          },
        ]
        if (kind === 'swipe_transition') {
          list.push({
            key: 'swipe_in',
            label: 'Swipe in',
            kind: 'bool',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: [],
            values: [],
            group: [],
            default: false,
          })
        }
        return list
      }
      if (kind === 'fade_to_color_transition') {
        return [
          {
            key: 'color',
            label: 'Colour',
            kind: 'color',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'switch_point',
            label: 'Fully coloured at',
            kind: 'int',
            help: '',
            visible: true,
            enabled: true,
            min: 0,
            max: 100,
            step: 1,
            slider: true,
            suffix: '%',
            choices: [],
            values: [],
            group: [],
          },
        ]
      }
      if (kind === 'wipe_transition') {
        return [
          {
            key: 'luma_image',
            label: 'Image',
            kind: 'path',
            path: 'file',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'luma_softness',
            label: 'Softness',
            kind: 'float',
            help: '',
            visible: true,
            enabled: true,
            min: 0,
            max: 1,
            step: 0.01,
            slider: true,
            suffix: '',
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'luma_invert',
            label: 'Invert',
            kind: 'bool',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: [],
            values: [],
            group: [],
          },
        ]
      }
      if (kind === 'obs_stinger_transition') {
        return [
          {
            key: 'path',
            label: 'Video',
            kind: 'path',
            path: 'file',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'transition_point_type',
            label: 'Switch scenes at',
            kind: 'list',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: ['Time (milliseconds)', 'Frame'],
            values: [0, 1],
            group: [],
          },
          {
            key: 'transition_point',
            label: 'Switch point',
            kind: 'int',
            help: '',
            visible: true,
            enabled: true,
            min: 0,
            max: 60000,
            step: 1,
            slider: false,
            suffix: '',
            choices: [],
            values: [],
            group: [],
          },
        ]
      }
      if (CAMERA_KINDS.has(kind)) {
        const list = this.opts.hasCamera ? CAMERA_SVGS : []
        const opt: EngineOption = {
          key: 'device',
          label: 'Device',
          kind: 'list',
          help: '',
          visible: true,
          enabled: true,
          min: null,
          max: null,
          step: null,
          slider: false,
          suffix: '',
          choices: list.map((c) => c.name),
          values: list.map((c) => c.id),
          group: [],
          default: list[0]?.id ?? '',
        }
        return [opt]
      }
      if (
        kind === 'coreaudio_input_capture' ||
        kind === 'wasapi_input_capture' ||
        kind === 'pulse_input_capture'
      ) {
        const list = this.opts.hasMic ? MIC_DEVICES : []
        const opt: EngineOption = {
          key: 'device_id',
          label: 'Device',
          kind: 'list',
          help: '',
          visible: true,
          enabled: true,
          min: null,
          max: null,
          step: null,
          slider: false,
          suffix: '',
          choices: list.map((m) => m.name),
          values: list.map((m) => m.id),
          group: [],
          default: list[0]?.id ?? 'default',
        }
        return [opt]
      }
      return []
    }

    if (is('GET', 'studio/engine/still')) {
      const fresh =
        url?.searchParams.get('fresh') === '1' || url?.searchParams.get('fresh') === 'true'
      return this.stillForDevice(
        url?.searchParams.get('value') ?? null,
        fresh ? { fresh: true } : undefined,
      )
    }

    if (is('GET', 'studio/engine/scenes')) {
      return this.scenesPayload()
    }
    if (is('POST', 'studio/engine/vertical')) {
      const b = requireObj(body)
      const scene = String(b.scene ?? '').trim() || 'Vertical'
      if (scene.length > 100) {
        throw new HttpError(400, 'invalid', 'scene: 1 to 100 letters on one line.')
      }
      if (this.verticalScenes.length === 0) {
        if (this.sceneNameTaken(scene)) {
          throw new HttpError(409, 'studio_name_taken', `"${scene}" is taken: pick another name.`)
        }
        this.verticalOn = true
        this.verticalScenes = [scene]
        this.verticalCurrent = scene
        this.sceneItems.set(scene, [])
      } else if (!this.verticalOn) {
        this.verticalOn = true
        if (!this.verticalScenes.includes(this.verticalCurrent)) {
          this.verticalCurrent = this.verticalScenes[0]!
        }
      }
      return undefined
    }
    if (is('DELETE', 'studio/engine/vertical')) {
      if (this.verticalOn) {
        this.verticalOn = false
      }
      return undefined
    }
    if (is('POST', 'studio/engine/scenes')) {
      const b = requireObj(body)
      const name = String(b.name ?? '').trim()
      const vertical = Boolean(b.vertical)
      if (!name || name.length > 100) {
        throw new HttpError(400, 'invalid', 'name: 1 to 100 letters on one line.')
      }
      if (vertical && !this.verticalOn) {
        throw new HttpError(400, 'invalid', 'Turn the vertical picture on first.')
      }
      if (this.sceneNameTaken(name)) {
        throw new HttpError(409, 'studio_name_taken', `"${name}" is taken: pick another name.`)
      }
      this.pushUndo(`Add ${name}`)
      if (vertical) {
        this.verticalScenes.push(name)
      } else {
        this.activeScenes.push(name)
      }
      this.sceneItems.set(name, [])
      return { name, items: 0, current: false, preview: false, transition: null }
    }
    if (method === 'DELETE' && rest[2] === 'scenes' && rest.length === 4) {
      const name = decodeURIComponent(rest[3]!)
      const isVertical = this.verticalOn && this.verticalScenes.includes(name)
      if (!this.activeScenes.includes(name) && !isVertical) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${name}".`)
      }
      if (isVertical) {
        if (this.verticalScenes.length < 2) {
          throw new HttpError(409, 'studio_last_scene', 'A collection keeps at least one scene.')
        }
        this.pushUndo(`Delete ${name}`)
        const oldItems = this.sceneItems.get(name) ?? []
        this.sceneItems.delete(name)
        this.verticalScenes = this.verticalScenes.filter((s) => s !== name)
        if (this.verticalCurrent === name) this.verticalCurrent = this.verticalScenes[0]!
        this.pruneItemsOrphans(oldItems)
        return undefined
      }
      if (this.activeScenes.length < 2) {
        throw new HttpError(409, 'studio_last_scene', 'A collection keeps at least one scene.')
      }
      this.pushUndo(`Delete ${name}`)
      const oldItems = this.sceneItems.get(name) ?? []
      this.sceneItems.delete(name)
      this.activeScenes = this.activeScenes.filter((s) => s !== name)
      this.transitionMatrix = this.transitionMatrix.filter((r) => r.from !== name && r.to !== name)
      this.legacySceneTransitions.delete(name)
      if (this.currentScene === name) this.currentScene = this.activeScenes[0]!
      if (this.previewScene === name) this.previewScene = this.activeScenes[0]!
      const dropSceneRefs = (items: EngineItem[]): EngineItem[] =>
        items
          .filter((it) => it.group || it.kind !== 'scene' || it.name !== name)
          .map((it) => {
            if (!it.children.length) return it
            const nextChildren = dropSceneRefs(it.children)
            if (nextChildren.length === it.children.length) return it
            const next = { ...it, children: nextChildren }
            if (next.group) this.syncGroupFrame(next)
            return next
          })
      for (const [k, v] of this.sceneItems) this.sceneItems.set(k, dropSceneRefs(v))
      this.pruneItemsOrphans(oldItems)
      return undefined
    }
    if (method === 'POST' && rest[2] === 'scenes' && rest[4] === 'current') {
      const name = decodeURIComponent(rest[3]!)
      if (this.verticalOn && this.verticalScenes.includes(name)) {
        this.verticalCurrent = name
        return undefined
      }
      if (!this.activeScenes.includes(name)) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${name}".`)
      }
      this.lastResolvedTransition = resolveTransitionFromScenes(
        this.scenesPayload(),
        this.currentScene,
        name,
      )
      this.currentScene = name
      this.black = false
      return undefined
    }
    if (method === 'POST' && rest[2] === 'scenes' && rest[4] === 'duplicate') {
      const src = decodeURIComponent(rest[3]!)
      const name = String(requireObj(body).name ?? '').trim()
      const isVertical = this.verticalOn && this.verticalScenes.includes(src)
      if (!this.activeScenes.includes(src) && !isVertical) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${src}".`)
      }
      if (!name || this.sceneNameTaken(name)) {
        throw new HttpError(409, 'studio_name_taken', `"${name}" is taken: pick another name.`)
      }
      this.pushUndo(`Duplicate ${src}`)
      const list = isVertical ? this.verticalScenes : this.activeScenes
      const idx = list.indexOf(src)
      list.splice(idx + 1, 0, name)
      const cloned = (this.sceneItems.get(src) ?? []).map((it) => this.cloneItemDeep(it, new Map()))
      this.sceneItems.set(name, cloned)
      return { name }
    }
    if (method === 'POST' && rest[2] === 'scenes' && rest[4] === 'move') {
      const src = decodeURIComponent(rest[3]!)
      const rawTo = requireObj(body).to
      if (typeof rawTo !== 'number' || !Number.isInteger(rawTo) || rawTo < 0) {
        throw new HttpError(400, 'invalid', 'to: non-negative whole number.')
      }
      const isVertical = this.verticalOn && this.verticalScenes.includes(src)
      const list = isVertical
        ? this.verticalScenes
        : this.activeScenes.includes(src)
          ? this.activeScenes
          : null
      if (!list) throw new HttpError(404, 'studio_no_scene', `There's no scene called "${src}".`)
      const idx = list.indexOf(src)
      const clamped = Math.min(rawTo, list.length - 1)
      if (clamped === idx) return undefined
      this.pushUndo(`Move ${src}`)
      const [item] = list.splice(idx, 1)
      list.splice(clamped, 0, item!)
      return undefined
    }
    if (method === 'GET' && rest[2] === 'scenes' && rest[4] === 'thumbnail' && rest.length === 5) {
      const scene = decodeURIComponent(rest[3]!)
      const list = this.requireScene(scene)
      const isVertical = this.verticalOn && this.verticalScenes.includes(scene)
      const w = Math.max(64, Math.min(640, Number(url?.searchParams.get('w') ?? 256) || 256))
      const h = isVertical ? Math.round((w * 16) / 9) : Math.round((w * 9) / 16)
      return {
        image: svgDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
            `<rect width="${w}" height="${h}" fill="#141922"/>` +
            `<text x="12" y="24" fill="#e6edf6" font-family="system-ui,sans-serif" font-size="13" font-weight="600">${escapeXml(scene)}</text>` +
            `<text x="12" y="42" fill="#9fb0c7" font-family="system-ui,sans-serif" font-size="11">${list.length} source${list.length === 1 ? '' : 's'}</text>` +
            `</svg>`,
        ),
      }
    }
    if (rest[2] === 'scenes' && rest[4] === 'items') {
      const scene = decodeURIComponent(rest[3]!)
      return this.handleSceneItemsRoute(method, scene, rest.slice(5), body, url)
    }
    if (method === 'POST' && rest[2] === 'sources' && rest[4] === 'rename') {
      const from = decodeURIComponent(rest[3]!)
      const to = String(requireObj(body).name ?? '').trim()
      if (!to || to.length > 100) {
        throw new HttpError(400, 'invalid', 'name: 1 to 100 letters on one line.')
      }
      const inMain = this.activeScenes.includes(from)
      const inVertical = this.verticalScenes.includes(from)
      if (inMain || inVertical) {
        if (from !== to && this.sceneNameTaken(to)) {
          throw new HttpError(409, 'studio_name_taken', `"${to}" is taken: pick another name.`)
        }
        this.pushUndo(`Rename ${from}`)
        if (inMain) {
          this.activeScenes = this.activeScenes.map((s) => (s === from ? to : s))
          if (this.currentScene === from) this.currentScene = to
          if (this.previewScene === from) this.previewScene = to
        }
        if (inVertical) {
          this.verticalScenes = this.verticalScenes.map((s) => (s === from ? to : s))
          if (this.verticalCurrent === from) this.verticalCurrent = to
        }
        const items = this.sceneItems.get(from)
        if (items) {
          this.sceneItems.delete(from)
          this.sceneItems.set(to, items)
        }
        const renameSceneRefs = (list: EngineItem[]) => {
          for (const it of list) {
            if (!it.group && it.kind === 'scene' && it.name === from) it.name = to
            if (it.children.length) renameSceneRefs(it.children)
          }
        }
        for (const list of this.sceneItems.values()) renameSceneRefs(list)
        this.transitionMatrix = this.transitionMatrix.map((r) => ({
          ...r,
          from: r.from === from ? to : r.from,
          to: r.to === from ? to : r.to,
        }))
        const leg = this.legacySceneTransitions.get(from)
        if (leg) {
          this.legacySceneTransitions.delete(from)
          this.legacySceneTransitions.set(to, leg)
        }
        return undefined
      }
      const src = this.sources.get(from)
      if (!src) {
        // Group rename within current scene(s) if no source/scene matches.
        const hasGroup = [...this.sceneItems.values()].some((list) =>
          list.some((it) => it.group && it.name === from),
        )
        if (!hasGroup) {
          throw new HttpError(404, 'studio_no_source', `There's no source called "${from}".`)
        }
        if (from !== to && this.sceneNameTaken(to)) {
          throw new HttpError(409, 'studio_name_taken', `"${to}" is taken: pick another name.`)
        }
        this.pushUndo(`Rename ${from}`)
        for (const list of this.sceneItems.values()) {
          for (const it of list) {
            if (it.group && it.name === from) it.name = to
          }
        }
        return undefined
      }
      if (from !== to && this.sceneNameTaken(to)) {
        throw new HttpError(409, 'studio_name_taken', `"${to}" is taken: pick another name.`)
      }
      this.pushUndo(`Rename ${from}`)
      if (from !== to) {
        this.renameSourceEverywhere(src, to)
      }
      return undefined
    }
    if (is('PUT', 'studio/engine/transition')) {
      const b = requireObj(body)
      const kind = String(b.kind ?? '')
      const ms = Math.max(0, Math.min(20_000, Number(b.ms ?? 300)))
      const cur = this.namedTransitions.find((t) => t.default)
      if (cur && cur.kind === kind) {
        cur.ms = kind === 'cut_transition' ? 0 : ms
      } else {
        const match = this.namedTransitions.find((t) => t.kind === kind)
        if (match) {
          match.ms = kind === 'cut_transition' ? 0 : ms
          for (const t of this.namedTransitions) t.default = t.name === match.name
        } else {
          for (const t of this.namedTransitions) t.default = false
          // A name no preset has (one may already be called after this kind).
          let name = kind
          for (let n = 2; this.namedTransitions.some((t) => t.name === name); n++) {
            name = `${kind} ${n}`
          }
          this.namedTransitions.push({
            name,
            kind,
            ms: kind === 'cut_transition' ? 0 : ms,
            settings: clone(this.kindSettings.get(kind) ?? {}),
            default: true,
          })
        }
      }
      return undefined
    }
    if (method === 'PUT' && rest[2] === 'scenes' && rest[4] === 'transition') {
      const scene = decodeURIComponent(rest[3]!)
      if (!this.activeScenes.includes(scene)) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${scene}".`)
      }
      const b = requireObj(body)
      this.transitionMatrix = this.transitionMatrix.filter(
        (r) => !(r.from === null && r.to === scene),
      )
      if (b.transition && typeof b.transition === 'object') {
        const t = b.transition as EngineTransition
        this.legacySceneTransitions.set(scene, {
          kind: t.kind,
          ms: t.kind === 'cut_transition' ? 0 : t.ms,
        })
      } else {
        this.legacySceneTransitions.delete(scene)
      }
      return undefined
    }
    if (method === 'GET' && rest[2] === 'transitions' && rest[4] === 'settings') {
      const kind = decodeURIComponent(rest[3]!)
      return clone(this.kindSettings.get(kind) ?? {})
    }
    if (method === 'PUT' && rest[2] === 'transitions' && rest[4] === 'settings') {
      const kind = decodeURIComponent(rest[3]!)
      const settings = requireObj(requireObj(body).settings)
      this.kindSettings.set(kind, { ...(this.kindSettings.get(kind) ?? {}), ...clone(settings) })
      // The preset that plays is the default one of the kind, else the first of it; others stay.
      const target =
        this.namedTransitions.find((t) => t.default && t.kind === kind) ??
        this.namedTransitions.find((t) => t.kind === kind)
      if (target) target.settings = { ...target.settings, ...clone(settings) }
      return undefined
    }
    if (is('POST', 'studio/engine/transitions')) {
      const b = requireObj(body)
      const name = String(b.name ?? '').trim()
      const kind = String(b.kind ?? 'fade_transition')
      const ms = Math.max(0, Math.min(20_000, Number(b.ms ?? 300)))
      const settings =
        b.settings && typeof b.settings === 'object' ? clone(b.settings as EngineSettings) : {}
      const makeDefault = Boolean(b.default)
      if (!name || name.length > 100) {
        throw new HttpError(400, 'invalid', 'name: 1 to 100 letters on one line.')
      }
      if (this.namedTransitions.some((t) => t.name === name)) {
        throw new HttpError(
          409,
          'studio_name_taken',
          `There's already a transition called "${name}".`,
        )
      }
      if (makeDefault) {
        for (const t of this.namedTransitions) t.default = false
      }
      const created: EngineNamedTransition = {
        name,
        kind,
        ms: kind === 'cut_transition' ? 0 : ms,
        settings,
        default: makeDefault,
      }
      this.namedTransitions.push(created)
      return clone(created)
    }
    if (rest[2] === 'transitions' && rest.length === 4) {
      const name = decodeURIComponent(rest[3]!)
      const idx = this.namedTransitions.findIndex((t) => t.name === name)
      if (method === 'PUT') {
        if (idx < 0)
          throw new HttpError(
            404,
            'studio_no_transition',
            `There's no transition called "${name}".`,
          )
        const b = requireObj(body)
        const cur = this.namedTransitions[idx]!
        const nextKind = typeof b.kind === 'string' ? b.kind : cur.kind
        const kindChanged = nextKind !== cur.kind
        cur.kind = nextKind
        if (typeof b.ms === 'number')
          cur.ms = nextKind === 'cut_transition' ? 0 : Math.max(0, Math.min(20_000, b.ms))
        else if (nextKind === 'cut_transition') cur.ms = 0
        if (b.settings && typeof b.settings === 'object') {
          cur.settings = kindChanged
            ? clone(b.settings as EngineSettings)
            : { ...cur.settings, ...clone(b.settings as EngineSettings) }
        } else if (kindChanged) {
          cur.settings = {}
        }
        if (b.default === true) {
          for (const t of this.namedTransitions) t.default = t.name === name
        }
        return clone(cur)
      }
      if (method === 'DELETE') {
        if (idx < 0)
          throw new HttpError(
            404,
            'studio_no_transition',
            `There's no transition called "${name}".`,
          )
        if (this.namedTransitions.length <= 1) {
          throw new HttpError(
            409,
            'studio_last_transition',
            'At least one transition must remain.',
            'Keep at least one transition in the collection.',
          )
        }
        const wasDef = this.namedTransitions[idx]!.default
        this.namedTransitions.splice(idx, 1)
        this.transitionMatrix = this.transitionMatrix.filter((r) => r.transition !== name)
        if (wasDef && this.namedTransitions.length > 0) {
          const nextDef =
            this.namedTransitions.find((t) => t.name === 'Fade') ?? this.namedTransitions[0]!
          nextDef.default = true
        }
        return undefined
      }
    }
    if (method === 'POST' && rest[2] === 'transitions' && rest[4] === 'rename') {
      const name = decodeURIComponent(rest[3]!)
      const to = String(requireObj(body).name ?? '').trim()
      if (!to || to.length > 100) {
        throw new HttpError(400, 'invalid', 'name: 1 to 100 letters on one line.')
      }
      const cur = this.namedTransitions.find((t) => t.name === name)
      if (!cur)
        throw new HttpError(404, 'studio_no_transition', `There's no transition called "${name}".`)
      if (name !== to && this.namedTransitions.some((t) => t.name === to)) {
        throw new HttpError(
          409,
          'studio_name_taken',
          `There's already a transition called "${to}".`,
        )
      }
      cur.name = to
      this.transitionMatrix = this.transitionMatrix.map((r) =>
        r.transition === name ? { ...r, transition: to } : r,
      )
      return clone(cur)
    }
    if (method === 'POST' && rest[2] === 'transitions' && rest[4] === 'duplicate') {
      const name = decodeURIComponent(rest[3]!)
      const cur = this.namedTransitions.find((t) => t.name === name)
      if (!cur)
        throw new HttpError(404, 'studio_no_transition', `There's no transition called "${name}".`)
      const reqName = requireObj(body).name
      let nextName = typeof reqName === 'string' && reqName.trim() ? reqName.trim() : ''
      if (nextName) {
        if (this.namedTransitions.some((t) => t.name === nextName)) {
          throw new HttpError(
            409,
            'studio_name_taken',
            `There's already a transition called "${nextName}".`,
          )
        }
      } else {
        let n = 2
        while (this.namedTransitions.some((t) => t.name === `${name} ${n}`)) n++
        nextName = `${name} ${n}`
      }
      const dup: EngineNamedTransition = {
        name: nextName,
        kind: cur.kind,
        ms: cur.ms,
        settings: clone(cur.settings),
        default: false,
      }
      this.namedTransitions.push(dup)
      return clone(dup)
    }
    if (method === 'PUT' && rest[2] === 'transitions' && rest[4] === 'default') {
      const name = decodeURIComponent(rest[3]!)
      if (!this.namedTransitions.some((t) => t.name === name)) {
        throw new HttpError(404, 'studio_no_transition', `There's no transition called "${name}".`)
      }
      for (const t of this.namedTransitions) t.default = t.name === name
      return undefined
    }
    if (is('PUT', 'studio/engine/transition-matrix')) {
      const b = requireObj(body)
      const from = typeof b.from === 'string' && b.from.trim() ? b.from.trim() : null
      const to = typeof b.to === 'string' && b.to.trim() ? b.to.trim() : null
      const tr =
        typeof b.transition === 'string' && b.transition.trim() ? b.transition.trim() : null
      if (from === null && to === null) {
        throw new HttpError(
          400,
          'invalid',
          'Pick a From scene, a To scene, or both; the default transition already covers Any to Any.',
        )
      }
      if (from !== null && !this.activeScenes.includes(from)) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${from}".`)
      }
      if (to !== null && !this.activeScenes.includes(to)) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${to}".`)
      }
      if (tr !== null && !this.namedTransitions.some((t) => t.name === tr)) {
        throw new HttpError(404, 'studio_no_transition', `There's no transition called "${tr}".`)
      }
      this.transitionMatrix = this.transitionMatrix.filter((r) => !(r.from === from && r.to === to))
      if (tr !== null) {
        this.transitionMatrix.push({ from, to, transition: tr })
      }
      if (from === null && to !== null) this.legacySceneTransitions.delete(to)
      return undefined
    }
    if (is('PUT', 'studio/engine/studio-mode')) {
      const on = Boolean(requireObj(body).on)
      this.previewScene = on ? this.currentScene : null
      if (!on) this.tbarState = { active: false, at: 0 }
      return undefined
    }
    if (is('PUT', 'studio/engine/studio-mode/preview')) {
      const scene = String(requireObj(body).scene ?? '')
      if (!this.activeScenes.includes(scene)) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${scene}".`)
      }
      this.previewScene = scene
      return undefined
    }
    if (is('POST', 'studio/engine/studio-mode/transition')) {
      if (!this.previewScene) {
        throw new HttpError(422, 'studio_failed', 'Studio Mode is off.')
      }
      const b = requireObj(body)
      const q = b.quick as EngineTransition | null | undefined
      const pre = this.previewScene
      const old = this.currentScene
      if (q) {
        this.lastResolvedTransition = {
          name: '',
          kind: q.kind,
          ms: q.ms,
          settings: clone(this.kindSettings.get(q.kind) ?? {}),
          via: 'quick',
        }
      } else {
        this.lastResolvedTransition = resolveTransitionFromScenes(this.scenesPayload(), old, pre)
      }
      this.currentScene = pre
      // Swap on (the default): what was on air goes to the preview; off: the preview stays.
      if (this.studioModeOptions.swap) this.previewScene = old
      this.black = false
      return undefined
    }
    if (is('POST', 'studio/engine/studio-mode/swap')) {
      if (!this.previewScene) throw new HttpError(422, 'studio_failed', 'Studio Mode is off.')
      const old = this.currentScene
      this.currentScene = this.previewScene
      this.previewScene = old
      this.lastResolvedTransition = {
        name: 'Cut',
        kind: 'cut_transition',
        ms: 0,
        settings: {},
        via: 'swap',
      }
      return undefined
    }
    if (is('PUT', 'studio/engine/studio-mode/tbar')) {
      if (!this.previewScene) throw new HttpError(422, 'studio_failed', 'Studio Mode is off.')
      const b = requireObj(body)
      const at = Math.max(0, Math.min(1, Number(b.at ?? 0)))
      const release = Boolean(b.release)
      if (release && at >= 0.5) {
        const pre = this.previewScene
        const old = this.currentScene
        this.lastResolvedTransition = resolveTransitionFromScenes(this.scenesPayload(), old, pre)
        this.currentScene = pre
        if (this.studioModeOptions.swap) this.previewScene = old
      }
      this.tbarState = { active: !release, at: release ? 0 : at }
      return clone(this.tbarState)
    }
    if (is('PUT', 'studio/engine/quick-transitions')) {
      const list = requireObj(body).list
      if (Array.isArray(list)) {
        this.quickTransitions = clone(list as EngineTransition[])
      }
      return undefined
    }
    if (is('PUT', 'studio/engine/studio-mode/options')) {
      this.studioModeOptions = {
        ...this.studioModeOptions,
        ...(requireObj(body) as Partial<EngineStudioOptions>),
      }
      return undefined
    }
    if (is('POST', 'studio/engine/black')) {
      this.black = !this.black
      return { black: this.black }
    }
    if (is('GET', 'studio/engine/stats')) {
      const record: EngineRecordStats | null =
        this.recording || this.recordActive
          ? {
              active: true,
              paused: this.recordingPaused,
              bytes: 1_240_000,
              frames: 900,
              file:
                this.recordFile ?? `${this.recordFolder()}/Demo recording.${this.recordFormat()}`,
              seconds: 15,
              error: null,
              encoder: 'VideoToolbox',
            }
          : null
      const sourceRecords = Array.from(this.sourceRecords.entries()).map(([name, file]) => ({
        name,
        file,
      }))
      return {
        engine: {
          cpu: 4.2,
          fps: 60,
          frame_ms: 4.1,
          lagged: this.simLagged,
          skipped: this.simSkipped,
          frames: 3600,
          memory_mb: 240,
        },
        canvas: {
          width: Number(this.studioSettingsData.width ?? CANVAS_W),
          height: Number(this.studioSettingsData.height ?? CANVAS_H),
          fps: Number(this.studioSettingsData.fps ?? 60),
        },
        // A stream the auto-config tests start (setStreamActive) shows without a running engine.
        stream:
          this.currentStreamStats() ??
          (this.streamActive
            ? {
                active: true,
                reconnecting: false,
                bytes: 4_800_000,
                frames: 3600,
                dropped: this.simDropped,
                error: null,
              }
            : null),
        record,
        scene: this.currentScene,
        history: {
          undo: this.undoStack[0]?.label ?? null,
          redo: this.redoStack[0]?.label ?? null,
        },
        replay: this.replayActive ? { active: true, last: this.replayLast, error: null } : null,
        virtualcam: this.virtualcam.active
          ? { active: true, every_app: false, source: this.virtualcam.source }
          : null,
        source_records: sourceRecords,
      }
    }
    if (is('GET', 'studio/engine/history')) {
      return {
        undo: this.undoStack.map((u) => u.label),
        redo: this.redoStack.map((r) => r.label),
      }
    }
    if (is('POST', 'studio/engine/undo')) {
      const open = [...this.pendingUndo.entries()]
      this.pendingUndo.clear()
      for (let i = open.length - 1; i >= 0; i--) {
        const [, entry] = open[i]!
        if (!entry.itemUndo) continue
        const current = this.transforms.get(entry.itemUndo.id) ?? defaultTransform()
        if (!sameTransform(entry.itemUndo.transform, current)) {
          this.redoStack.unshift(this.applyUndoEntry(entry))
          return {
            done: entry.label,
            undo: this.undoStack[0]?.label ?? null,
            redo: this.redoStack[0]?.label ?? null,
          }
        }
      }
      const top = this.undoStack.shift()
      if (!top) return { done: null, undo: null, redo: this.redoStack[0]?.label ?? null }
      this.redoStack.unshift(this.applyUndoEntry(top))
      return {
        done: top.label,
        undo: this.undoStack[0]?.label ?? null,
        redo: this.redoStack[0]?.label ?? null,
      }
    }
    if (is('POST', 'studio/engine/redo')) {
      this.pendingUndo.clear()
      const top = this.redoStack.shift()
      if (!top) return { done: null, undo: this.undoStack[0]?.label ?? null, redo: null }
      this.undoStack.unshift(this.applyUndoEntry(top))
      return {
        done: top.label,
        undo: this.undoStack[0]?.label ?? null,
        redo: this.redoStack[0]?.label ?? null,
      }
    }
    if (is('GET', 'studio/engine/audio-care')) return { ducking: null, loudness_lufs: null }
    if (is('GET', 'studio/engine/privacy')) return { hide_notifications: true, hide_apps: [] }
    if (is('GET', 'studio/engine/screens')) return []
    if (is('GET', 'studio/engine/missing-files')) return []
    if (is('GET', 'studio/engine/stream')) return this.currentStreamStats()
    if (is('POST', 'studio/engine/stream')) {
      const b = requireObj(body)
      if (typeof b.on !== 'boolean') throw new HttpError(400, 'invalid', 'on: true or false.')
      return this.setStreaming(b.on)
    }
    if (is('GET', 'studio/engine/virtualcam/setup')) return { active: false, every_app: false }
    if (is('POST', 'studio/engine/virtualcam')) {
      const b = requireObj(body)
      this.virtualcam = {
        active: Boolean(b.on),
        source: typeof b.source === 'string' && b.source ? b.source : null,
      }
      return { active: this.virtualcam.active, every_app: false }
    }
    if (is('POST', 'studio/engine/replay')) {
      this.replayActive = Boolean(requireObj(body).on)
      return { active: this.replayActive }
    }
    if (is('POST', 'studio/engine/replay/save')) {
      const saved = this.saveReplayNow()
      if (!saved) throw new HttpError(422, 'studio_failed', 'The replay buffer is off.')
      return { file: saved }
    }
    if (is('POST', 'studio/engine/record')) {
      const on = Boolean(requireObj(body).on)
      if (on) return this.startRecordingState()
      this.stopRecordingState()
      return null
    }
    if (is('POST', 'studio/engine/record/pause')) {
      if (!this.recording) throw new HttpError(422, 'studio_failed', 'Nothing is recording.')
      this.recordingPaused = Boolean(requireObj(body).on)
      return undefined
    }
    if (is('POST', 'studio/engine/record/split') || is('POST', 'studio/engine/record/chapter')) {
      if (!this.recording) throw new HttpError(422, 'studio_failed', 'Nothing is recording.')
      return undefined
    }
    if (is('POST', 'studio/engine/keys/capture')) return undefined
    if (is('GET', 'studio/engine/preview/pause')) return { paused: this.previewPaused }
    if (is('PUT', 'studio/engine/preview/pause')) {
      this.previewPaused = Boolean(requireObj(body).paused)
      return { paused: this.previewPaused }
    }
    if (
      is('PUT', 'studio/engine/preview') ||
      is('PUT', 'studio/engine/preview/selection') ||
      is('PUT', 'studio/engine/preview/cursor')
    ) {
      return undefined
    }
    if (is('GET', 'studio/engine/encode-budget') || is('POST', 'studio/engine/encode-budget')) {
      const split = this.scenesWithSplitShow()
      const budget: EncodeBudget = {
        budget_mpx: null,
        shared: !split,
        why_not_shared: split
          ? 'Some sources are shown only on the stream or only in the recording.'
          : null,
        level: 'unknown',
      }
      return budget
    }

    if (rest[2] === 'clipboard') {
      return this.handleClipboardRoute(method, rest.slice(3), body)
    }

    if (is('GET', 'studio/engine/sources')) {
      const list: EngineSourceUse[] = []
      for (const s of this.sources.values()) {
        const scenes = this.sceneUsingSource(s.name)
        if (scenes.length > 0 || s.channel != null || s.name === 'Desktop Audio') {
          list.push({
            name: s.name,
            kind: s.kind,
            scenes: scenes.length > 0 ? scenes : [this.currentScene],
          })
        }
      }
      return list
    }

    if (method === 'GET' && rest[2] === 'scenes' && rest[4] === 'audio') {
      const scene = decodeURIComponent(rest[3]!)
      const items = this.requireScene(scene)
      const byName = new Map<string, StoredSource>()
      for (const s of this.sources.values()) {
        if (s.channel != null) byName.set(s.name, s)
      }
      const addFromItems = (list: EngineItem[]) => {
        for (const it of list) {
          if (!it.group) {
            const s = this.sources.get(it.name)
            if (s && s.audio) byName.set(s.name, s)
          }
          addFromItems(it.children)
        }
      }
      addFromItems(items)
      return Array.from(byName.values()).map((s) => ({
        name: s.name,
        kind: s.kind,
        channel: s.channel ?? null,
        volume_db: s.volume_db,
        muted: s.muted,
        monitor: s.monitor,
        active: true,
      }))
    }

    if (method === 'DELETE' && rest[2] === 'channels' && rest.length === 4) {
      const ch = Number(rest[3])
      if (!Number.isInteger(ch) || ch < 1 || ch > 6) {
        throw new HttpError(400, 'invalid_channel', 'Choose a global audio slot from 1 to 6.')
      }
      const match = [...this.sources.values()].find((s) => s.channel === ch)
      if (!match) return undefined
      this.pushUndo(`Remove ${match.name}`)
      this.removeSourceEverywhere(match.name)
      return undefined
    }

    if (method === 'PUT' && rest[2] === 'channels' && rest.length === 4) {
      const ch = Number(rest[3])
      const b = requireObj(body)
      const nextName = String(b.name ?? this.micSourceName).trim() || this.micSourceName
      const settings = (b.settings as Record<string, unknown> | undefined) ?? {}
      if (ch === 3) {
        const prev = this.sources.get(this.micSourceName)
        if (prev && prev.name !== nextName) {
          // The same checks and the same follow-through as renaming a source.
          if (this.sceneNameTaken(nextName))
            throw new HttpError(
              409,
              'studio_name_taken',
              `"${nextName}" is taken: pick another name.`,
            )
          this.pushUndo(`Rename ${prev.name}`)
          this.renameSourceEverywhere(prev, nextName)
        } else if (!prev) {
          this.sources.set(
            nextName,
            this.makeSource(nextName, String(b.kind ?? 'coreaudio_input_capture'), settings, {
              channel: ch,
              audio: true,
            }),
          )
        }
        this.micSourceName = nextName
        if (settings.device_id) {
          this.micDeviceId = String(settings.device_id)
          this.sources.get(nextName)!.settings.device_id = this.micDeviceId
        }
      }
      return undefined
    }

    if (rest[2] === 'sources' && rest.length >= 4) {
      return this.handleSourceRoute(method, decodeURIComponent(rest[3]!), rest.slice(4), body, url)
    }

    if (is('GET', 'studio/engine/settings')) {
      return clone(this.studioSettingsData)
    }
    if (is('PUT', 'studio/engine/settings')) {
      const patch = requireObj(body)
      const prev = this.studioSettingsData
      this.studioSettingsData = { ...this.studioSettingsData, ...patch }
      if ('video_kbps' in patch) this.onStreamChange?.(this.streamActive)
      if (this.autoConfigState.state === 'applied' && this.autoConfigState.applied) {
        const keys = ['encoder', 'video_encoder', 'encoder_settings', 'scale', 'fps', 'video_kbps']
        const outputChanged = keys.some(
          (k) =>
            k in patch &&
            JSON.stringify(prev[k] ?? null) !== JSON.stringify(this.studioSettingsData[k] ?? null),
        )
        if (outputChanged) {
          this.applyWatchToken++
          this.snapshot = null
          this.wasLive = false
          this.watchStarted = false
          this.pendingOffer = null
          this.autoConfigState = emptyAutoConfigState()
          this.broadcastAutoConfig()
        }
      }
      return { settings: clone(this.studioSettingsData), restart: null }
    }
    if (is('GET', 'studio/engine/auto-config')) {
      return this.autoConfigView()
    }
    if (is('POST', 'studio/engine/auto-config/benchmark')) {
      return this.startBenchmark(body)
    }
    if (is('POST', 'studio/engine/auto-config/cancel')) {
      return this.cancelBenchmark()
    }
    if (is('POST', 'studio/engine/auto-config/apply')) {
      return this.applyAutoConfig(body)
    }
    if (is('POST', 'studio/engine/auto-config/keep')) {
      return this.keepAutoConfig()
    }
    if (is('POST', 'studio/engine/auto-config/undo')) {
      return this.undoAutoConfig()
    }

    if (is('POST', 'studio/engine/levels')) {
      if (!this.opts.levelsConnected) return {}
      const b = requireObj(body)
      const names = Array.isArray(b.names) ? b.names.map(String) : []
      const out: Record<string, EngineLevel> = {}
      for (const n of names) out[n] = this.levelFor(n)
      return out
    }

    throw new HttpError(
      422,
      'studio_unavailable',
      'That Studio action isn’t simulated in demo mode.',
      'Open Ferrocast on your computer to run all Studio actions.',
    )
  }

  private handleSceneItemsRoute(
    method: string,
    scene: string,
    tail: string[],
    body: unknown,
    url?: URL,
  ): unknown {
    const items = this.requireScene(scene)
    if (method === 'GET' && tail.length === 0) {
      return clone(items)
    }
    if (method === 'POST' && tail.length === 0) {
      return this.addSceneItem(scene, items, body)
    }
    if (method === 'PUT' && tail[0] === 'boxes' && tail.length === 1) {
      const b = requireObj(body)
      const list = Array.isArray(b.items)
        ? (b.items as { id: number; x: number; y: number; w: number; h: number }[])
        : []
      if (list.length < 1 || list.length > 500) {
        throw new HttpError(400, 'invalid', 'items: 1 to 500 boxes.')
      }
      const seen = new Set<number>()
      const touchedParents = new Set<EngineItem>()
      const resolved: { item: EngineItem; x: number; y: number; w: number; h: number }[] = []
      for (const entry of list) {
        if (seen.has(entry.id)) throw new HttpError(400, 'invalid', 'items: each id only once.')
        seen.add(entry.id)
        this.validateBoxCoords(entry)
        const loc = this.findItem(scene, entry.id)
        if (loc.parent) touchedParents.add(loc.parent)
        resolved.push({
          item: loc.item,
          x: entry.x,
          y: entry.y,
          w: entry.w,
          h: entry.h,
        })
      }
      for (const { item } of resolved) {
        if (item.group && item.children.some((c) => seen.has(c.id))) {
          throw new HttpError(400, 'invalid', 'Cannot move a group and its child together.')
        }
      }
      if (b.save) {
        const label =
          b.reason === 'align'
            ? `Align ${resolved.length} sources`
            : b.reason === 'distribute'
              ? `Space out ${resolved.length} sources`
              : `Move ${resolved.length} sources`
        this.pushUndo(label)
      }
      for (const { item, x, y, w, h } of resolved) this.applyBox(item, { x, y, w, h })
      for (const parent of touchedParents) this.syncGroupFrame(parent)
      return clone(resolved.map((r) => r.item))
    }

    const id = Number(tail[0])
    if (!Number.isInteger(id)) {
      throw new HttpError(404, 'studio_no_source', 'Unknown scene item.')
    }
    const loc = this.findItem(scene, id)

    if (method === 'POST' && tail[1] === 'edit' && tail.length === 2) {
      return this.applyItemEdit(scene, loc, String(requireObj(body).do ?? ''))
    }
    if (method === 'POST' && tail[1] === 'screenshot' && tail.length === 2) {
      const safe = loc.item.name.replace(/[/\\]/g, '-')
      return { file: `${this.recordFolder()}/${safe} screenshot.png` }
    }
    if (method === 'PUT' && tail[1] === 'box' && tail.length === 2) {
      const b = requireObj(body) as { x: number; y: number; w: number; h: number; save?: boolean }
      this.validateBoxCoords(b)
      if (b.save) this.pushUndo(`Move ${loc.item.name}`)
      this.applyBox(loc.item, b)
      if (loc.parent) this.syncGroupFrame(loc.parent)
      return clone(loc.item)
    }
    if (method === 'PUT' && tail[1] === 'crop' && tail.length === 2) {
      const b = requireObj(body) as {
        left: number
        top: number
        right: number
        bottom: number
        save?: boolean
      }
      const before = clone(this.transforms.get(loc.item.id) ?? defaultTransform())
      const cur = clone(before)
      const w = Math.max(1, before.width)
      const h = Math.max(1, before.height)
      const right = Math.min(Math.max(0, Math.round(Number(b.right ?? 0))), w - 1)
      const left = Math.min(Math.max(0, Math.round(Number(b.left ?? 0))), w - 1 - right)
      const bottom = Math.min(Math.max(0, Math.round(Number(b.bottom ?? 0))), h - 1)
      const top = Math.min(Math.max(0, Math.round(Number(b.top ?? 0))), h - 1 - bottom)
      const seenW = Math.max(1, w - before.crop_left - before.crop_right)
      const seenH = Math.max(1, h - before.crop_top - before.crop_bottom)
      const nextW = Math.max(1, w - left - right)
      const nextH = Math.max(1, h - top - bottom)
      const f = frameFromTransform(before)
      const du = (left - before.crop_left) / seenW
      const dv = (top - before.crop_top) / seenH
      const clean = (n: number) => (Math.abs(n) < 1e-6 ? 0 : Math.round(n * 1000) / 1000)
      cur.x = clean(f[4] + f[0] * du + f[2] * dv)
      cur.y = clean(f[5] + f[1] * du + f[3] * dv)
      cur.alignment = 5
      cur.crop_left = left
      cur.crop_top = top
      cur.crop_right = right
      cur.crop_bottom = bottom
      if (before.bounds !== 'none') {
        const lu = Math.hypot(f[0], f[1])
        const lv = Math.hypot(f[2], f[3])
        const nw = lu * (nextW / seenW)
        const nh = lv * (nextH / seenH)
        const sameShape = nextW / nextH / (seenW / seenH)
        cur.bounds = before.bounds === 'fit' && Math.abs(sameShape - 1) < 0.005 ? 'fit' : 'stretch'
        cur.bounds_alignment = 5
        cur.bounds_width = clean(nw)
        cur.bounds_height = clean(nh)
      }
      this.setItemTransform(loc.item, cur)
      if (loc.parent) this.syncGroupFrame(loc.parent)
      this.recordDragUndo(
        `crop:${this.shelfCollections.current}:${loc.item.id}`,
        loc.item.id,
        `Crop ${loc.item.name}`,
        Boolean(b.save),
        before,
        cur,
      )
      return clone(loc.item)
    }
    if (tail[1] === 'transform' && tail.length === 2) {
      if (method === 'GET') {
        return clone(this.transforms.get(loc.item.id) ?? defaultTransform())
      }
      if (method === 'PUT') {
        const next = requireObj(body) as unknown as EngineTransform
        this.pushUndo(`Transform ${loc.item.name}`)
        this.setItemTransform(loc.item, next)
        return clone(loc.item)
      }
    }
    if (method === 'PUT' && tail[1] === 'order' && tail.length === 2) {
      const to = Math.max(
        0,
        Math.min(loc.list.length - 1, Math.trunc(Number(requireObj(body).to ?? 0))),
      )
      this.pushUndo(`Reorder ${loc.item.name}`)
      const [moved] = loc.list.splice(loc.index, 1)
      loc.list.splice(to, 0, moved!)
      return undefined
    }
    if (method === 'PUT' && tail[1] === 'group' && tail.length === 2) {
      const groupId = requireObj(body).group as number | null
      this.pushUndo(groupId ? `Group ${loc.item.name}` : `Ungroup ${loc.item.name}`)
      if (groupId === null) {
        if (!loc.parent) return undefined
        const [moved] = loc.list.splice(loc.index, 1)
        const pIdx = items.findIndex((i) => i.id === loc.parent!.id)
        items.splice(Math.max(0, pIdx), 0, moved!)
        this.syncGroupFrame(loc.parent)
        return undefined
      }
      const dst = this.findItem(scene, Number(groupId))
      if (!dst.item.group || loc.item.group) {
        throw new HttpError(400, 'invalid', 'group: target must be a group in this scene.')
      }
      const [moved] = loc.list.splice(loc.index, 1)
      dst.item.children.unshift(moved!)
      this.syncGroupFrame(dst.item)
      return undefined
    }
    if (method === 'POST' && tail[1] === 'ungroup' && tail.length === 2) {
      if (!loc.item.group) throw new HttpError(400, 'invalid', 'Item is not a group.')
      this.pushUndo(`Ungroup ${loc.item.name}`)
      const [grp] = loc.list.splice(loc.index, 1)
      loc.list.splice(loc.index, 0, ...grp!.children)
      return undefined
    }
    if (method === 'PUT' && tail[1] === 'transition' && tail.length === 2) {
      const b = requireObj(body)
      const show = Boolean(b.show)
      const tr = (b.transition as EngineTransition | null | undefined) ?? null
      this.pushUndo(`Transition for ${loc.item.name}`)
      if (show) loc.item.show_transition = tr ? clone(tr) : null
      else loc.item.hide_transition = tr ? clone(tr) : null
      return undefined
    }
    if (method === 'GET' && tail[1] === 'picture' && tail.length === 2) {
      const w = Math.max(64, Math.min(640, Number(url?.searchParams.get('w') ?? 480) || 480))
      const h = Math.round((w * 9) / 16)
      return {
        image: this.sourceSvg(loc.item.name, loc.item.kind, w, h),
        width: CANVAS_W,
        height: CANVAS_H,
      }
    }
    if (method === 'POST' && tail[1] === 'paste-filters' && tail.length === 2) {
      const from = String(requireObj(body).from ?? '')
      const src = this.requireSource(from)
      const target = loc.item.own_filters
        ? this.ensureItemFilterState(loc.item.id)
        : (() => {
            const s = this.requireSource(loc.item.name)
            return { filters: s.filters, settings: s.filterSettings }
          })()
      this.pushUndo(`Paste filters onto ${loc.item.name}`)
      this.mergeFilters(target.filters, target.settings, src.filters, src.filterSettings)
      return undefined
    }
    if (tail[1] === 'filters') {
      if (method === 'PUT' && tail[2] === 'scope' && tail.length === 3) {
        const own = Boolean(requireObj(body).own)
        this.pushUndo(`Filter scope on ${loc.item.name}`)
        if (own && !loc.item.own_filters) {
          const src = this.requireSource(loc.item.name)
          this.itemFilters.set(loc.item.id, {
            filters: clone(src.filters),
            settings: clone(src.filterSettings),
          })
          loc.item.own_filters = true
        } else if (!own && loc.item.own_filters) {
          this.itemFilters.delete(loc.item.id)
          loc.item.own_filters = false
        }
        return clone(loc.item)
      }
      const state = loc.item.own_filters
        ? this.ensureItemFilterState(loc.item.id)
        : (() => {
            const s = this.requireSource(loc.item.name)
            return { filters: s.filters, settings: s.filterSettings }
          })()
      return this.handleFilterListRoute(
        method,
        tail.slice(2),
        body,
        state.filters,
        state.settings,
        loc.item.name,
      )
    }

    throw new HttpError(404, 'not_found', 'Unknown item action.')
  }

  private ensureItemFilterState(id: number): ItemFilterState {
    let st = this.itemFilters.get(id)
    if (!st) {
      st = { filters: [], settings: {} }
      this.itemFilters.set(id, st)
    }
    return st
  }

  private addSceneItem(scene: string, items: EngineItem[], body: unknown): unknown {
    const b = requireObj(body)
    if (b.group !== undefined) {
      const name = String(b.group ?? '').trim()
      if (!name || name.length > 100) {
        throw new HttpError(400, 'invalid', 'group: 1 to 100 characters.')
      }
      if (Array.isArray(b.items)) {
        const ids = b.items.map(Number)
        const idSet = new Set(ids)
        const picked: EngineItem[] = []
        for (const it of items) {
          if (idSet.has(it.id)) {
            if (it.group)
              throw new HttpError(400, 'invalid', 'Cannot nest a group inside another group.')
            picked.push(it)
          }
        }
        if (picked.length !== ids.length) {
          throw new HttpError(
            404,
            'studio_no_source',
            'Some selected sources are not top-level in this scene.',
          )
        }
        this.pushUndo(`Group ${picked.length} sources`)
        const firstIdx = items.findIndex((it) => idSet.has(it.id))
        const kept = items.filter((it) => !idSet.has(it.id))
        items.splice(0, items.length, ...kept)
        const grp: EngineItem = {
          id: this.nextItemId++,
          name,
          kind: 'group',
          visible: true,
          locked: false,
          audio: false,
          group: true,
          show: 'both',
          blend: 'normal',
          scale_filter: 'off',
          children: picked,
        }
        this.transforms.set(grp.id, defaultTransform({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }))
        this.syncGroupFrame(grp)
        items.splice(Math.max(0, firstIdx), 0, grp)
        return clone(grp)
      }
      this.pushUndo(`Add group ${name}`)
      const grp: EngineItem = {
        id: this.nextItemId++,
        name,
        kind: 'group',
        visible: true,
        locked: false,
        audio: false,
        group: true,
        show: 'both',
        blend: 'normal',
        scale_filter: 'off',
        frame: [CANVAS_W, 0, 0, CANVAS_H, 0, 0],
        children: [],
      }
      this.transforms.set(grp.id, defaultTransform())
      items.unshift(grp)
      return clone(grp)
    }

    if (typeof b.existing === 'string') {
      const existingName = b.existing
      if (this.activeScenes.includes(existingName)) {
        if (existingName === scene) {
          throw new HttpError(400, 'invalid', "A scene can't show itself.")
        }
        const sceneSrc: StoredSource = {
          name: existingName,
          kind: 'scene',
          channel: null,
          audio: false,
          muted: false,
          volume_db: 0,
          monitor: 'off',
          settings: {},
          filters: [],
          filterSettings: {},
        }
        this.pushUndo(`Add ${existingName} to ${scene}`)
        const item = this.createSceneItem(sceneSrc)
        items.unshift(item)
        return { item: clone(item) }
      }
      const src = this.requireSource(existingName)
      if (b.copy) {
        const newName = this.uniqueSourceName(src.name)
        this.pushUndo(`Paste copy of ${src.name}`)
        const copySrc: StoredSource = {
          ...clone(src),
          name: newName,
          channel: null,
        }
        this.sources.set(newName, copySrc)
        const item = this.createSceneItem(copySrc)
        items.unshift(item)
        return clone(item)
      }
      this.pushUndo(`Add ${src.name} to ${scene}`)
      const item = this.createSceneItem(src)
      items.unshift(item)
      return { item: clone(item) }
    }

    const kind = String(b.kind ?? '').trim()
    const name = String(b.name ?? '').trim()
    const settings = (b.settings as EngineSettings | undefined) ?? {}
    if (!kind || !name || name.length > 100 || kind.includes('..') || kind.includes('/')) {
      throw new HttpError(400, 'invalid', 'kind and name are required.')
    }
    if (CAMERA_KINDS.has(kind) && settings.device) {
      for (const existing of this.sources.values()) {
        if (CAMERA_KINDS.has(existing.kind) && existing.settings.device === settings.device) {
          this.pushUndo(`Add ${existing.name} to ${scene}`)
          const item = this.createSceneItem(existing)
          items.unshift(item)
          return { item: clone(item), settings: clone(existing.settings), reused: true }
        }
      }
    }
    if (this.sceneNameTaken(name)) {
      throw new HttpError(409, 'studio_name_taken', `"${name}" is taken: pick another name.`)
    }
    this.pushUndo(`Add ${name}`)
    const created = this.makeSource(name, kind, settings)
    this.sources.set(name, created)
    const item = this.createSceneItem(created)
    items.unshift(item)
    return { item: clone(item), settings: clone(created.settings) }
  }

  private applyItemEdit(
    scene: string,
    loc: { list: EngineItem[]; index: number; item: EngineItem; parent: EngineItem | null },
    edit: string,
  ): undefined {
    const { list, index, item, parent } = loc
    const t = clone(this.transforms.get(item.id) ?? defaultTransform())
    if (edit === 'show' || edit === 'hide') {
      this.pushUndo(`${edit === 'show' ? 'Show' : 'Hide'} ${item.name}`)
      item.visible = edit === 'show'
      return undefined
    }
    if (edit === 'lock' || edit === 'unlock') {
      this.pushUndo(`${edit === 'lock' ? 'Lock' : 'Unlock'} ${item.name}`)
      item.locked = edit === 'lock'
      return undefined
    }
    if (edit === 'remove') {
      this.pushUndo(`Remove ${item.name}`)
      const [removed] = list.splice(index, 1)
      if (parent) this.syncGroupFrame(parent)
      if (removed) {
        this.pruneItemsOrphans([removed])
      }
      return undefined
    }
    if (edit === 'up' || edit === 'down' || edit === 'top' || edit === 'bottom') {
      this.pushUndo(`Move ${item.name} ${edit}`)
      const [moved] = list.splice(index, 1)
      if (edit === 'top') list.unshift(moved!)
      else if (edit === 'bottom') list.push(moved!)
      else if (edit === 'up') list.splice(Math.max(0, index - 1), 0, moved!)
      else list.splice(Math.min(list.length, index + 1), 0, moved!)
      return undefined
    }
    if (edit === 'fit' || edit === 'stretch') {
      this.pushUndo(`${edit === 'fit' ? 'Fit' : 'Stretch'} ${item.name}`)
      t.x = 0
      t.y = 0
      t.rotation = 0
      t.bounds = edit === 'fit' ? 'fit' : 'stretch'
      t.bounds_width = CANVAS_W
      t.bounds_height = CANVAS_H
      this.setItemTransform(item, t)
      return undefined
    }
    if (edit === 'center') {
      this.pushUndo(`Centre ${item.name}`)
      const box = computeBox(t)
      t.x = Math.round((CANVAS_W - box.w) / 2)
      t.y = Math.round((CANVAS_H - box.h) / 2)
      this.setItemTransform(item, t)
      return undefined
    }
    if (edit === 'reset') {
      this.pushUndo(`Reset ${item.name}`)
      t.x = 0
      t.y = 0
      t.rotation = 0
      t.scale_x = 1
      t.scale_y = 1
      t.bounds = 'none'
      t.crop_left = 0
      t.crop_top = 0
      t.crop_right = 0
      t.crop_bottom = 0
      this.setItemTransform(item, t)
      return undefined
    }
    if (edit === 'flip_h') {
      this.pushUndo(`Flip ${item.name} sideways`)
      this.changeInPlace(item, t, parent, (tr) => {
        tr.scale_x *= -1
      })
      return undefined
    }
    if (edit === 'flip_v') {
      this.pushUndo(`Flip ${item.name} upside down`)
      this.changeInPlace(item, t, parent, (tr) => {
        tr.scale_y *= -1
      })
      return undefined
    }
    if (edit === 'rotate_cw' || edit === 'rotate_ccw' || edit === 'rotate180') {
      this.pushUndo(`Turn ${item.name}`)
      const delta = edit === 'rotate_cw' ? 90 : edit === 'rotate_ccw' ? 270 : 180
      this.changeInPlace(item, t, parent, (tr) => {
        tr.rotation = (((tr.rotation + delta) % 360) + 360) % 360
      })
      return undefined
    }
    if (edit === 'duplicate') {
      this.pushUndo(`Duplicate ${item.name}`)
      const renameMap = new Map<string, string>()
      const cloneSources = (it: EngineItem) => {
        if (it.group) {
          it.children.forEach(cloneSources)
          return
        }
        const orig = this.sources.get(it.name)
        if (orig && !renameMap.has(orig.name)) {
          const unique = this.uniqueSourceName(orig.name)
          renameMap.set(orig.name, unique)
          this.sources.set(unique, { ...clone(orig), name: unique, channel: null })
        }
      }
      cloneSources(item)
      const dup = this.cloneItemDeep(item, renameMap)
      if (dup.group) dup.name = this.uniqueSourceName(dup.name)
      list.splice(index, 0, dup)
      return undefined
    }
    if (edit === 'stream_and_recording' || edit === 'stream_only' || edit === 'recording_only') {
      if (
        (edit === 'stream_only' || edit === 'recording_only') &&
        this.recording &&
        this.studioSettingsData.record_quality === 'stream'
      ) {
        throw new HttpError(
          422,
          'studio_failed',
          'Stop the recording first, then choose where this source is shown.',
          'Recording uses the stream encoder, so both share one picture.',
        )
      }
      const nextShow: EngineShow =
        edit === 'stream_only' ? 'stream' : edit === 'recording_only' ? 'recording' : 'both'
      this.pushUndo(`Show ${item.name} in ${nextShow}`)
      item.show = nextShow
      return undefined
    }
    if (edit === 'blend_method_default' || edit === 'blend_method_srgb_off') {
      this.pushUndo(`Blending on ${item.name}`)
      item.srgb_off = edit === 'blend_method_srgb_off'
      return undefined
    }
    if (edit.startsWith('blend_') && BLEND_SET.has(edit.slice(6))) {
      this.pushUndo(`Blend mode on ${item.name}`)
      item.blend = edit.slice(6) as EngineBlend
      return undefined
    }
    if (edit.startsWith('scale_') && SCALE_SET.has(edit.slice(6))) {
      this.pushUndo(`Scaling on ${item.name}`)
      item.scale_filter = edit.slice(6) as EngineScaleFilter
      return undefined
    }
    throw new HttpError(400, 'invalid', `Unknown item edit "${edit}" in "${scene}".`)
  }

  private handleClipboardRoute(method: string, tail: string[], body: unknown): unknown {
    if (method === 'GET' && tail.length === 0) {
      if (!this.clipboardSummary) {
        throw new HttpError(
          404,
          'clipboard_empty',
          'Nothing is copied yet.',
          'Copy a source or its filters first, then paste.',
        )
      }
      return clone(this.clipboardSummary)
    }
    if (method === 'DELETE' && tail.length === 0) {
      this.clipboardSummary = null
      this.clipboardSource = null
      this.clipboardFiltersData = null
      return undefined
    }
    if (method === 'POST' && tail[0] === 'source' && tail.length === 1) {
      const b = requireObj(body)
      const scene = String(b.scene ?? '').trim()
      const id = Number(b.id)
      if (!scene || !Number.isInteger(id)) {
        throw new HttpError(400, 'invalid', 'scene and numeric id are required.')
      }
      const { item } = this.findItem(scene, id)
      const ids = new Set<number>()
      this.collectItemIds(item, ids)
      const transforms: Record<number, EngineTransform> = {}
      const itemFilters: Record<number, ItemFilterState> = {}
      for (const tid of ids) {
        transforms[tid] = clone(this.transforms.get(tid) ?? defaultTransform())
        const flt = this.itemFilters.get(tid)
        if (flt) itemFilters[tid] = clone(flt)
      }
      const collectedSources = new Map<string, StoredSource>()
      const walkSources = (it: EngineItem) => {
        if (it.group) it.children.forEach(walkSources)
        else {
          const s = this.sources.get(it.name)
          if (s && !collectedSources.has(s.name)) collectedSources.set(s.name, clone(s))
        }
      }
      walkSources(item)
      const sources = Array.from(collectedSources.values())
      this.clipboardSource = { item: clone(item), transforms, itemFilters, sources }
      this.clipboardFiltersData = null
      this.clipboardSummary = {
        kind: 'source',
        name: item.name,
        from: scene,
        count: Math.max(1, sources.length),
      }
      return clone(this.clipboardSummary)
    }
    if (method === 'POST' && tail[0] === 'filters' && tail.length === 1) {
      const target = this.resolveFilterTarget(requireObj(body))
      if (target.filters.length === 0) {
        throw new HttpError(400, 'invalid', `"${target.label}" has no filters to copy.`)
      }
      this.clipboardSource = null
      this.clipboardFiltersData = {
        filters: clone(target.filters),
        settings: clone(target.settings),
      }
      this.clipboardSummary = {
        kind: 'filters',
        name: target.label,
        from: target.label,
        count: target.filters.length,
      }
      return clone(this.clipboardSummary)
    }
    if (method === 'POST' && tail[0] === 'paste' && tail[1] === 'source' && tail.length === 2) {
      if (!this.clipboardSummary) {
        throw new HttpError(
          404,
          'clipboard_empty',
          'Nothing is copied yet.',
          'Copy a source or its filters first, then paste.',
        )
      }
      if (this.clipboardSummary.kind !== 'source' || !this.clipboardSource) {
        throw new HttpError(
          400,
          'invalid',
          'The clipboard holds filters, not a source: copy a source first.',
        )
      }
      const b = requireObj(body)
      const scene = typeof b.scene === 'string' ? b.scene.trim() : ''
      if (!scene) throw new HttpError(400, 'invalid', 'scene: target scene name is required.')
      const list = this.requireScene(scene)
      this.pushUndo(`Paste ${this.clipboardSource.item.name}`)
      const renameMap = new Map<string, string>()
      const notes: string[] = []
      for (const s of this.clipboardSource.sources) {
        const unique = this.uniqueSourceName(s.name)
        if (unique !== s.name) notes.push(`Renamed "${s.name}" to "${unique}".`)
        renameMap.set(s.name, unique)
        this.sources.set(unique, { ...clone(s), name: unique, channel: null })
      }
      const pasted = this.cloneItemDeep(
        this.clipboardSource.item,
        renameMap,
        this.clipboardSource.transforms,
        this.clipboardSource.itemFilters,
      )
      list.unshift(pasted)
      return { item: clone(pasted), notes } satisfies EnginePasteResult
    }
    if (method === 'POST' && tail[0] === 'paste' && tail[1] === 'filters' && tail.length === 2) {
      if (!this.clipboardSummary) {
        throw new HttpError(
          404,
          'clipboard_empty',
          'Nothing is copied yet.',
          'Copy a source or its filters first, then paste.',
        )
      }
      if (this.clipboardSummary.kind !== 'filters' || !this.clipboardFiltersData) {
        throw new HttpError(
          400,
          'invalid',
          'The clipboard holds a source, not filters: copy filters first.',
        )
      }
      const target = this.resolveFilterTarget(requireObj(body))
      this.pushUndo(`Paste filters onto ${target.label}`)
      this.mergeFilters(
        target.filters,
        target.settings,
        this.clipboardFiltersData.filters,
        this.clipboardFiltersData.settings,
      )
      return { notes: [] } satisfies EnginePasteResult
    }
    throw new HttpError(404, 'not_found', 'Unknown clipboard route.')
  }

  private resolveFilterTarget(b: Record<string, unknown>): {
    label: string
    filters: EngineFilter[]
    settings: Record<string, EngineSettings>
  } {
    const itemTarget = b.item as { scene?: string; id?: number } | undefined
    if (itemTarget && typeof itemTarget.scene === 'string' && typeof itemTarget.id === 'number') {
      const { item } = this.findItem(itemTarget.scene, itemTarget.id)
      const st = item.own_filters ? this.ensureItemFilterState(item.id) : null
      if (st) return { label: item.name, filters: st.filters, settings: st.settings }
      const s = this.requireSource(item.name)
      return { label: item.name, filters: s.filters, settings: s.filterSettings }
    }
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name) throw new HttpError(400, 'invalid', 'name: a source name is required.')
    const s = this.requireSource(name)
    return { label: name, filters: s.filters, settings: s.filterSettings }
  }

  private mergeFilters(
    dstList: EngineFilter[],
    dstSettings: Record<string, EngineSettings>,
    srcList: EngineFilter[],
    srcSettings: Record<string, EngineSettings>,
  ): void {
    // Read from detached copies: the source and the destination can be the same lists (a paste
    // onto the source it came from), which must not grow under the loop that reads them.
    const filters = clone(srcList)
    const settings = clone(srcSettings)
    for (const f of filters) {
      let name = f.name
      for (let n = 2; dstList.some((x) => x.name === name); n++) name = `${f.name} ${n}`
      dstList.push({ ...f, name })
      dstSettings[name] = clone(settings[f.name] ?? {})
    }
  }

  private handleFilterListRoute(
    method: string,
    tail: string[],
    body: unknown,
    list: EngineFilter[],
    settingsMap: Record<string, EngineSettings>,
    ownerLabel: string,
  ): unknown {
    if (method === 'GET' && tail.length === 0) return clone(list)
    if (method === 'POST' && tail.length === 0) {
      const b = body as NewEngineSource
      const fName = String(b.name ?? '').trim()
      if (!fName) throw new HttpError(400, 'invalid', 'name: 1 to 100 characters.')
      if (list.some((x) => x.name === fName)) {
        throw new HttpError(409, 'studio_name_taken', `Filter "${fName}" already exists.`)
      }
      this.pushUndo(`Add filter ${fName} to ${ownerLabel}`)
      const created: EngineFilter = { name: fName, kind: String(b.kind), enabled: true }
      list.push(created)
      settingsMap[fName] = clone(b.settings ?? {})
      return clone(created)
    }
    const fName = tail[0] ? decodeURIComponent(tail[0]) : ''
    const idx = list.findIndex((x) => x.name === fName)
    if (idx === -1) throw new HttpError(404, 'studio_no_filter', `No filter "${fName}".`)
    if (method === 'DELETE' && tail.length === 1) {
      this.pushUndo(`Remove filter ${fName}`)
      list.splice(idx, 1)
      delete settingsMap[fName]
      return undefined
    }
    if (method === 'POST' && tail[1] === 'edit' && tail.length === 2) {
      const act = String(requireObj(body).do ?? '')
      this.pushUndo(`Edit filter ${fName}`)
      const [item] = list.splice(idx, 1)
      if (act === 'enable') item!.enabled = true
      if (act === 'disable') item!.enabled = false
      if (act === 'top') list.unshift(item!)
      else if (act === 'bottom') list.push(item!)
      else if (act === 'up') list.splice(Math.max(0, idx - 1), 0, item!)
      else if (act === 'down') list.splice(Math.min(list.length, idx + 1), 0, item!)
      else list.splice(idx, 0, item!)
      return undefined
    }
    if (method === 'GET' && tail[1] === 'settings' && tail.length === 2) {
      return clone(settingsMap[fName] ?? {})
    }
    if (method === 'PUT' && tail[1] === 'settings' && tail.length === 2) {
      this.pushUndo(`Update filter ${fName}`)
      const next = (requireObj(body).settings as EngineSettings | undefined) ?? {}
      settingsMap[fName] = { ...(settingsMap[fName] ?? {}), ...clone(next) }
      return undefined
    }
    if (method === 'GET' && tail[1] === 'options' && tail.length === 2) {
      return clone(DEMO_FILTER_OPTIONS[list[idx]!.kind] ?? [])
    }
    throw new HttpError(404, 'not_found', 'Unknown filter route.')
  }

  private handleSourceRoute(
    method: string,
    name: string,
    tail: string[],
    body: unknown,
    url?: URL,
  ): unknown {
    if (method === 'POST' && tail[0] === 'record' && tail.length === 1) {
      if (
        !name ||
        [...name].length > 100 ||
        [...name].some((ch) => {
          const c = ch.codePointAt(0) ?? 32
          return c < 32 || c === 0x7f
        })
      ) {
        throw new HttpError(400, 'invalid', "name: a scene or source's name.")
      }
      const on = Boolean(requireObj(body).on)
      if (!on && this.sourceRecords.has(name)) {
        this.sourceRecords.delete(name)
        return { file: null }
      }
      if (
        !this.sources.has(name) &&
        !this.activeScenes.includes(name) &&
        !(this.verticalOn && this.verticalScenes.includes(name))
      ) {
        throw new HttpError(422, 'studio_failed', `There's no scene or source called "${name}".`)
      }
      if (!on) {
        return { file: null }
      }
      const safe = name.replace(/[/\\:*?"<>|]/g, '-')
      const file = `${this.recordFolder()}/${safe} demo.${this.recordFormat()}`
      this.sourceRecords.set(name, file)
      return { file }
    }
    if (method === 'POST' && tail[0] === 'screenshot' && tail.length === 1) {
      const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
      const qScene = url?.searchParams.has('scene') ? url.searchParams.get('scene')! : undefined
      let qItem: number | undefined
      if (url?.searchParams.has('item')) {
        const raw = url.searchParams.get('item')!
        const n = Number(raw)
        if (raw === '' || !Number.isInteger(n)) {
          throw new HttpError(400, 'invalid', 'item: whole number id.')
        }
        qItem = n
      }
      const bScene = b.scene !== undefined && b.scene !== null ? String(b.scene) : undefined
      let bItem: number | undefined
      if (b.item !== undefined && b.item !== null) {
        const n = Number(b.item)
        if (typeof b.item !== 'number' || !Number.isInteger(n)) {
          throw new HttpError(400, 'invalid', 'item: whole number id.')
        }
        bItem = n
      }
      if (qScene !== undefined && bScene !== undefined && qScene !== bScene) {
        throw new HttpError(400, 'invalid', 'scene: query and body do not match.')
      }
      if (qItem !== undefined && bItem !== undefined && qItem !== bItem) {
        throw new HttpError(400, 'invalid', 'item: query and body do not match.')
      }
      const targetScene = bScene ?? qScene
      const targetItem = bItem ?? qItem
      if ((targetScene !== undefined) !== (targetItem !== undefined)) {
        throw new HttpError(400, 'invalid', 'scene, item: give both or neither.')
      }
      if (targetScene !== undefined && targetItem !== undefined) {
        const loc = this.findItem(targetScene, targetItem)
        if (name && loc.item.name !== name) {
          throw new HttpError(
            422,
            'studio_failed',
            `There's no source called "${name}" for item ${targetItem} in "${targetScene}".`,
          )
        }
        return {
          file: `${this.recordFolder()}/${loc.item.name.replace(/[/\\]/g, '-')} screenshot.png`,
        }
      }
      if (
        !this.sources.has(name) &&
        !this.activeScenes.includes(name) &&
        !(this.verticalOn && this.verticalScenes.includes(name))
      ) {
        throw new HttpError(404, 'studio_no_source', `There’s no source called "${name}".`)
      }
      return { file: `${this.recordFolder()}/${name.replace(/[/\\]/g, '-')} screenshot.png` }
    }
    const src = this.requireSource(name)
    if (method === 'GET' && tail[0] === 'picture' && tail.length === 1) {
      if (src.name === this.cameraSourceName && !this.opts.hasCamera) {
        return { image: null, width: CANVAS_W, height: CANVAS_H }
      }
      return {
        image: this.sourceSvg(src.name, src.kind, CANVAS_W, CANVAS_H),
        width: CANVAS_W,
        height: CANVAS_H,
      }
    }
    if (method === 'GET' && tail[0] === 'status' && tail.length === 1) {
      return { web_text: null, page: { ok: true, error: null }, app_on: [1] }
    }
    if (method === 'GET' && tail[0] === 'settings' && tail.length === 1) {
      return clone(src.settings)
    }
    if (method === 'PUT' && tail[0] === 'settings' && tail.length === 1) {
      const next = (requireObj(body).settings as EngineSettings | undefined) ?? {}
      this.pushUndo(`Update ${name}`)
      src.settings = { ...src.settings, ...clone(next) }
      if (name === this.micSourceName && typeof next.device_id === 'string') {
        this.micDeviceId = next.device_id
      }
      return undefined
    }
    if (method === 'GET' && tail[0] === 'options' && tail.length === 1) {
      return []
    }
    if (method === 'PUT' && tail[0] === 'audio' && tail.length === 1) {
      const b = requireObj(body)
      if (typeof b.volume_db === 'number') src.volume_db = b.volume_db
      if (typeof b.muted === 'boolean') src.muted = b.muted
      if (typeof b.monitor === 'string') src.monitor = b.monitor as EngineMonitor
      return undefined
    }
    if (method === 'PUT' && tail[0] === 'deinterlace' && tail.length === 1) {
      const b = requireObj(body)
      const mode = String(b.mode ?? 'off')
      if (!DEINTERLACE_SET.has(mode))
        throw new HttpError(400, 'invalid', 'Unknown deinterlace mode.')
      src.deinterlace = mode as EngineDeinterlace
      src.top_field_first = Boolean(b.top_field_first ?? true)
      return undefined
    }
    if (method === 'POST' && tail[0] === 'paste-filters' && tail.length === 1) {
      const from = String(requireObj(body).from ?? '')
      const other = this.requireSource(from)
      this.pushUndo(`Paste filters onto ${name}`)
      this.mergeFilters(src.filters, src.filterSettings, other.filters, other.filterSettings)
      return undefined
    }
    if (method === 'POST' && tail[0] === 'web' && tail.length === 1) {
      return undefined
    }
    if (tail[0] === 'filters') {
      return this.handleFilterListRoute(
        method,
        tail.slice(1),
        body,
        src.filters,
        src.filterSettings,
        name,
      )
    }
    throw new HttpError(404, 'not_found', 'Unknown source action.')
  }

  private sourceSvg(name: string, kind: string, w: number, h: number): string {
    if (CAMERA_KINDS.has(kind)) {
      return cameraFrameSvg(this.sources.get(name)?.settings.device ?? CAMERA_SVGS[0].id)
    }
    return svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<rect width="${w}" height="${h}" fill="#17202e"/>` +
        `<text x="${Math.round(w / 2)}" y="${Math.round(h / 2)}" text-anchor="middle" fill="#dce5f2" font-family="system-ui,sans-serif" font-size="22" font-weight="600">${escapeXml(name)}</text>` +
        `</svg>`,
    )
  }

  private sceneToInfo(name: string, currentName: string, previewName: string | null) {
    const anyTo = this.transitionMatrix.find((r) => r.from === null && r.to === name)
    const anyToT = anyTo
      ? this.namedTransitions.find((t) => t.name === anyTo.transition)
      : undefined
    const leg = this.legacySceneTransitions.get(name)
    return {
      name,
      items: this.sceneItems.get(name)?.length ?? 0,
      current: name === currentName,
      preview: previewName === name,
      transition: anyToT
        ? { kind: anyToT.kind, ms: anyToT.kind === 'cut_transition' ? 0 : anyToT.ms }
        : (leg ?? null),
      ...(anyToT ? { transition_name: anyToT.name } : {}),
    }
  }

  private scenesPayload() {
    const def = this.namedTransitions.find((t) => t.default) ?? this.namedTransitions[0]!
    return {
      current: this.currentScene,
      scenes: this.activeScenes.map((name) =>
        this.sceneToInfo(name, this.currentScene, this.previewScene),
      ),
      transition: { kind: def.kind, ms: def.kind === 'cut_transition' ? 0 : def.ms },
      named_transitions: clone(this.namedTransitions),
      transition_matrix: clone(this.transitionMatrix),
      preview: this.previewScene,
      quick: clone(this.quickTransitions),
      studio_options: clone(this.studioModeOptions),
      tbar: clone(this.tbarState),
      black: this.black,
      vertical: this.verticalOn
        ? {
            width: 1080,
            height: 1920,
            current: this.verticalCurrent,
            scenes: this.verticalScenes.map((name) => ({
              name,
              items: this.sceneItems.get(name)?.length ?? 0,
              current: name === this.verticalCurrent,
              preview: false,
              transition: null,
            })),
          }
        : null,
      top_layer: null,
    }
  }

  stillForDevice(device: string | null, _opts?: { fresh?: boolean }): StillResult {
    if (!this.opts.hasCamera) {
      throw new HttpError(404, 'studio_no_source', 'No camera is available on this computer.')
    }
    if (this.opts.cameraDenied)
      return {
        image: null,
        error:
          'The camera is turned off for Ferrocast. Open System Settings, Privacy & Security, Camera, turn Ferrocast on, then press Retry.',
      }
    if (this.opts.cameraSleeping) return { image: null, waiting: true, error: null }
    return { image: cameraFrameSvg(device ?? CAMERA_SVGS[0].id) }
  }

  private engineStatsSnapshot(): EngineStats {
    const fps = Number(this.studioSettingsData.fps ?? 60)
    const width = Number(this.studioSettingsData.width ?? 1920)
    const height = Number(this.studioSettingsData.height ?? 1080)
    return {
      engine: {
        cpu: 14.2,
        fps,
        frame_ms: 3.1,
        lagged: this.simLagged,
        skipped: this.simSkipped,
        frames: 3600,
        memory_mb: 310,
      },
      canvas: { width, height, fps },
      scene: this.currentScene,
      stream: this.streamActive
        ? {
            active: true,
            reconnecting: false,
            bytes: 4_800_000,
            frames: 3600,
            dropped: this.simDropped,
            error: null,
          }
        : null,
      record: this.recordActive
        ? {
            active: true,
            paused: false,
            bytes: 2_400_000,
            frames: 1800,
            file: '/Users/demo/Movies/Ferrocast/demo.mp4',
            seconds: 30,
            error: null,
          }
        : null,
    }
  }

  private isBusyLive(): boolean {
    return (
      this.streamActive ||
      this.recordActive ||
      this.recording ||
      this.replayActive ||
      this.virtualCamActive ||
      this.virtualcam.active ||
      this.ndiActive ||
      this.showActive ||
      !!this.deps?.isLive()
    )
  }

  private schedule(fn: () => void, ms: number): void {
    if (this.host) this.host.later(fn, ms)
    else setTimeout(fn, ms)
  }

  private broadcastAutoConfig(): void {
    this.host?.broadcastLive({ v: 1, type: 'auto_config', data: this.autoConfigView() })
  }

  private autoConfigView(): AutoConfigState {
    const out = clone(this.autoConfigState)
    if (out.state === 'applied') {
      const now = Date.now()
      out.confirm_remaining_s =
        out.confirmed || out.rollback_offered
          ? 0
          : Math.max(0, Math.ceil((this.confirmDeadlineAt - now) / 1000))
      out.watch_remaining_s = this.watchStarted
        ? Math.max(0, Math.ceil((this.watchDeadlineAt - now) / 1000))
        : Math.ceil(this.opts.watchWindowMs / 1000)
      out.first_minute_drops = Math.max(0, this.simSkipped - this.baselineSkipped)
      out.first_minute_lags = Math.max(0, this.simLagged - this.baselineLagged)
    }
    return out
  }

  private startBenchmark(rawBody: unknown): AutoConfigState {
    const b = rawBody === undefined || rawBody === null ? {} : requireObj(rawBody)
    const mode = (b.mode ?? 'stream') as string
    if (mode !== 'stream' && mode !== 'record') {
      throw new HttpError(400, 'invalid', 'mode: stream or record.')
    }
    const fpsPref = b.fps_preference === undefined ? 60 : Number(b.fps_preference)
    if (fpsPref !== 30 && fpsPref !== 60) {
      throw new HttpError(400, 'invalid', 'fps_preference: 30 or 60.')
    }
    if (b.max_seconds !== undefined) {
      const m = Number(b.max_seconds)
      if (!Number.isFinite(m) || m < 2 || m > 35) {
        throw new HttpError(400, 'invalid', 'max_seconds: 2 to 35.')
      }
    }
    if (this.isBusyLive()) {
      throw new HttpError(
        409,
        'studio_busy',
        'Stop streaming and recording before testing the encoder.',
        'End your active stream, recording, or replay buffer first so the benchmark never affects live viewers.',
      )
    }
    if (this.autoConfigState.state === 'running') {
      throw new HttpError(409, 'conflict', 'An encoder benchmark is already running.')
    }
    // New settings are still on trial (Keep or Undo not chosen): a benchmark would replace the
    // trial and leave Undo with nothing to restore, as the engine refuses.
    if (this.autoConfigState.state === 'applied') {
      throw new HttpError(
        409,
        'conflict',
        'Keep or undo the new settings before testing the encoder again.',
      )
    }

    const includeUpload =
      b.include_upload === undefined ? mode === 'stream' : Boolean(b.include_upload)
    const jobId = `demo-bench-${++this.benchJobSeq}`
    const token = ++this.benchCancelToken
    const width = Number(this.studioSettingsData.width ?? 1920)
    const height = Number(this.studioSettingsData.height ?? 1080)
    const canvas: [number, number] = [width, height]
    const startedAt = Date.now()
    const stepMs = Math.max(20, this.opts.benchStepMs)
    const plan = buildDemoCandidates(
      this.opts.benchProfile,
      canvas,
      fpsPref as 30 | 60,
      mode as AutoConfigMode,
    )

    this.autoConfigState = {
      ...emptyAutoConfigState(),
      state: 'running',
      job_id: jobId,
      mode: mode as AutoConfigMode,
      phase: includeUpload && mode === 'stream' ? 'upload' : 'encoding',
      progress_pct: 8,
      current_label:
        includeUpload && mode === 'stream'
          ? 'Testing upload speed…'
          : `Stress testing ${plan[0]?.label ?? 'encoder'}…`,
      estimated_total_ms: (plan.length + (includeUpload ? 1 : 0)) * stepMs,
    }
    this.broadcastAutoConfig()

    let uploadCheck: UploadCheck | null = null
    let uploadTried = false
    let stepIdx = 0
    const fail = (message: string) => {
      if (this.benchCancelToken !== token) return
      this.autoConfigState = {
        ...this.autoConfigState,
        state: 'failed',
        job_id: null,
        phase: null,
        current_label: null,
        error: message,
        elapsed_ms: Date.now() - startedAt,
      }
      this.broadcastAutoConfig()
    }

    const runStep = () => {
      if (this.benchCancelToken !== token || this.autoConfigState.state !== 'running') return
      if (includeUpload && mode === 'stream' && !uploadTried) {
        // Once: with no checker, or one that throws, the run goes on without a measurement.
        uploadTried = true
        try {
          uploadCheck = this.deps?.runUploadCheck() ?? null
        } catch (e) {
          uploadCheck = null
          this.autoConfigState.upload_error =
            e instanceof Error ? e.message : 'Upload check failed.'
        }
        this.autoConfigState.upload_check = uploadCheck
        this.autoConfigState.phase = 'encoding'
        this.autoConfigState.progress_pct = 24
        this.autoConfigState.current_label = `Stress testing ${plan[0]?.label ?? 'encoder'}…`
        this.autoConfigState.elapsed_ms = Date.now() - startedAt
        this.broadcastAutoConfig()
        this.schedule(runStep, stepMs)
        return
      }
      if (stepIdx < plan.length) {
        this.autoConfigState.candidates.push(plan[stepIdx]!)
        stepIdx += 1
        this.autoConfigState.elapsed_ms = Date.now() - startedAt
        const pct = 25 + Math.round((stepIdx / Math.max(1, plan.length)) * 68)
        this.autoConfigState.progress_pct = Math.min(95, pct)
        const nextCand = plan[stepIdx]
        if (nextCand) {
          this.autoConfigState.phase = 'encoding'
          this.autoConfigState.current_label = `Stress testing ${nextCand.label} (${nextCand.width}×${nextCand.height} @ ${nextCand.fps} fps)…`
        } else {
          this.autoConfigState.phase = 'picking'
          this.autoConfigState.current_label = 'Picking the best configuration…'
        }
        this.broadcastAutoConfig()
        this.schedule(runStep, stepMs)
        return
      }

      let picked: AutoConfigRecommendation
      try {
        const platforms = this.deps?.enabledPlatforms() ?? []
        picked = pickDemoRecommendation(
          this.autoConfigState.candidates,
          mode as AutoConfigMode,
          fpsPref as 30 | 60,
          canvas,
          uploadCheck?.verdict.upload_kbps ?? null,
          platforms,
        )
      } catch (e) {
        fail(e instanceof Error ? e.message : 'The benchmark could not pick a configuration.')
        return
      }
      this.autoConfigState = {
        ...this.autoConfigState,
        state: 'done',
        job_id: null,
        phase: null,
        progress_pct: 100,
        current_label: null,
        elapsed_ms: Date.now() - startedAt,
        duration_ms: Date.now() - startedAt,
        upload_check: uploadCheck,
        picked,
      }
      this.broadcastAutoConfig()
    }

    this.schedule(runStep, stepMs)
    return this.autoConfigView()
  }

  private cancelBenchmark(): AutoConfigState {
    this.benchCancelToken++
    if (this.autoConfigState.state === 'running') {
      this.autoConfigState = emptyAutoConfigState()
      this.broadcastAutoConfig()
    }
    return this.autoConfigView()
  }

  private applyAutoConfig(rawBody: unknown): AutoConfigState {
    if (this.autoConfigState.state === 'running') {
      throw new HttpError(
        409,
        'conflict',
        'Finish or cancel the benchmark before applying settings.',
      )
    }
    const req = rawBody === undefined || rawBody === null ? {} : requireObj(rawBody)
    if (req.fps !== undefined && ![24, 25, 30, 48, 50, 60, 120].includes(Number(req.fps))) {
      throw new HttpError(400, 'invalid', 'fps: 24, 25, 30, 48, 50, 60 or 120.')
    }
    if (
      req.video_kbps !== undefined &&
      (!Number.isFinite(Number(req.video_kbps)) ||
        Number(req.video_kbps) < 500 ||
        Number(req.video_kbps) > 60_000)
    ) {
      throw new HttpError(400, 'invalid', 'video_kbps: 500 to 60000.')
    }
    const picked = this.autoConfigState.picked
    const anySetting = [
      req.fps,
      req.video_kbps,
      req.encoder,
      req.video_encoder,
      req.encoder_settings,
      req.scale,
    ].some((v) => v !== undefined)
    if (!picked && !anySetting) {
      throw new HttpError(400, 'invalid', 'Run the benchmark or provide settings to apply.')
    }

    if (this.autoConfigState.state !== 'applied' || this.snapshot === null) {
      this.snapshot = clone(this.studioSettingsData)
    }
    const next: Record<string, unknown> = clone(this.studioSettingsData)
    if (picked) {
      next.encoder = picked.encoder
      next.video_encoder = picked.video_encoder
      next.encoder_settings = clone(picked.encoder_settings)
      next.scale = picked.scale ? [...picked.scale] : null
      next.fps = picked.fps
      next.video_kbps = picked.video_kbps
    }
    if (req.encoder !== undefined) {
      next.encoder = req.encoder
      if (req.encoder === 'software' && req.video_encoder === undefined) {
        next.video_encoder = null
      }
    }
    if (req.video_encoder !== undefined) next.video_encoder = req.video_encoder
    if (req.encoder_settings !== undefined) next.encoder_settings = clone(req.encoder_settings)
    if (req.scale !== undefined) next.scale = req.scale ? [...(req.scale as number[])] : null
    if (req.fps !== undefined) next.fps = Number(req.fps)
    if (req.video_kbps !== undefined) next.video_kbps = Number(req.video_kbps)
    this.studioSettingsData = next

    const applied: AutoConfigAppliedSummary = {
      encoder: (next.encoder === 'software' ? 'software' : 'hardware') as 'hardware' | 'software',
      video_encoder: (next.video_encoder as string | null) ?? null,
      encoder_settings: clone((next.encoder_settings as Record<string, unknown>) ?? {}),
      scale: (next.scale as [number, number] | null) ?? null,
      fps: Number(next.fps ?? 60),
      video_kbps: Number(next.video_kbps ?? 6000),
      label:
        typeof req.label === 'string'
          ? req.label
          : (picked?.label ?? (next.encoder === 'software' ? 'x264' : 'Hardware encoder')),
    }

    const now = Date.now()
    const liveNow = this.isBusyLive()
    this.confirmDeadlineAt = now + this.opts.confirmTimeoutMs
    this.watchDeadlineAt = now + this.opts.watchWindowMs
    this.wasLive = liveNow
    this.watchStarted = liveNow
    this.pendingOffer = null
    this.baselineLagged = this.simLagged
    this.baselineSkipped = this.simSkipped
    const watchToken = ++this.applyWatchToken

    this.autoConfigState = {
      ...this.autoConfigState,
      state: 'applied',
      applied,
      confirmed: false,
      confirm_remaining_s: Math.ceil(this.opts.confirmTimeoutMs / 1000),
      watch_remaining_s: Math.ceil(this.opts.watchWindowMs / 1000),
      first_minute_drops: 0,
      first_minute_lags: 0,
      rollback_offered: false,
      rollback_trigger: null,
      rollback_reason: null,
      restored: null,
    }
    this.broadcastAutoConfig()

    const tickMs = Math.min(500, Math.max(25, Math.floor(this.opts.confirmTimeoutMs / 4)))
    const tick = () => {
      if (this.applyWatchToken !== watchToken || this.autoConfigState.state !== 'applied') return
      if (this.evaluateWatchStep()) return
      this.schedule(tick, tickMs)
    }
    this.schedule(tick, tickMs)
    return this.autoConfigView()
  }

  private keepAutoConfig(): AutoConfigState {
    if (this.autoConfigState.state !== 'applied') {
      throw new HttpError(
        409,
        'conflict',
        'There are no newly applied settings waiting to be kept.',
      )
    }
    const wasOffered = this.autoConfigState.rollback_offered
    this.autoConfigState.confirmed = true
    this.autoConfigState.confirm_remaining_s = 0
    this.autoConfigState.rollback_offered = false
    this.autoConfigState.rollback_trigger = null
    this.autoConfigState.rollback_reason = null
    this.pendingOffer = null
    const doneWatch = this.watchStarted && Date.now() >= this.watchDeadlineAt
    if (wasOffered || doneWatch) {
      this.applyWatchToken++
      this.snapshot = null
      this.wasLive = false
      this.watchStarted = false
      this.autoConfigState = {
        ...emptyAutoConfigState(),
        mode: this.autoConfigState.mode,
        candidates: this.autoConfigState.candidates,
        upload_check: this.autoConfigState.upload_check,
        picked: this.autoConfigState.picked,
        duration_ms: this.autoConfigState.duration_ms,
      }
    }
    this.broadcastAutoConfig()
    return this.autoConfigView()
  }

  private undoAutoConfig(): AutoConfigState {
    if (this.autoConfigState.state !== 'applied') {
      throw new HttpError(409, 'conflict', 'There are no applied settings to undo.')
    }
    return this.performRollback('user_undo', 'Restored your previous settings.')
  }

  private evaluateWatchStep(): boolean {
    if (this.autoConfigState.state !== 'applied') return true
    const now = Date.now()
    const live = this.isBusyLive()
    // The baseline moves first, so frames that lagged while idle can't count against the stream.
    if (live) {
      if (!this.watchStarted) {
        this.watchStarted = true
        this.watchDeadlineAt = now + this.opts.watchWindowMs
        this.baselineLagged = this.simLagged
        this.baselineSkipped = this.simSkipped
      } else if (!this.wasLive) {
        this.baselineLagged = this.simLagged
        this.baselineSkipped = this.simSkipped
      }
    }
    const encoderSkips = Math.max(0, this.simSkipped - this.baselineSkipped)
    const encoderLags = Math.max(0, this.simLagged - this.baselineLagged)
    const encoderIssues = encoderSkips + encoderLags

    if (live) {
      this.wasLive = true
      if (
        now < this.watchDeadlineAt &&
        !this.pendingOffer &&
        !this.autoConfigState.rollback_offered &&
        encoderIssues >= 5
      ) {
        this.pendingOffer = {
          trigger: 'dropped_frames',
          reason: `First minute dropped ${encoderIssues} encoder-skipped frames. Undo to restore your previous settings, or Keep.`,
        }
      }
      if (
        !this.autoConfigState.confirmed &&
        now >= this.confirmDeadlineAt &&
        !this.pendingOffer &&
        !this.autoConfigState.rollback_offered
      ) {
        this.pendingOffer = {
          trigger: 'timeout',
          reason:
            "Settings weren't confirmed within 30 s while live. Restore your previous settings or Keep.",
        }
      }
      if (
        this.autoConfigState.confirmed &&
        now >= this.watchDeadlineAt &&
        !this.pendingOffer &&
        !this.autoConfigState.rollback_offered
      ) {
        this.snapshot = null
        this.wasLive = false
        this.watchStarted = false
        this.autoConfigState = {
          ...emptyAutoConfigState(),
          mode: this.autoConfigState.mode,
          candidates: this.autoConfigState.candidates,
          upload_check: this.autoConfigState.upload_check,
          picked: this.autoConfigState.picked,
          duration_ms: this.autoConfigState.duration_ms,
        }
        this.broadcastAutoConfig()
        return true
      }
      return false
    }

    if (this.wasLive) {
      this.wasLive = false
      if (this.pendingOffer) {
        const offer = this.pendingOffer
        this.pendingOffer = null
        this.autoConfigState = {
          ...this.autoConfigState,
          rollback_offered: true,
          rollback_trigger: offer.trigger,
          rollback_reason: offer.reason,
          confirm_remaining_s: 0,
        }
        this.broadcastAutoConfig()
        this.host?.broadcastLive({
          v: 1,
          type: 'notice',
          data: {
            key: 'auto_config_rollback_offer',
            level: 'warn',
            message: 'Encoder dropped frames during your stream — rollback ready',
            detail: offer.reason,
          },
        })
        return true
      }
    }

    if (
      !this.autoConfigState.confirmed &&
      !this.autoConfigState.rollback_offered &&
      !this.pendingOffer &&
      now >= this.confirmDeadlineAt
    ) {
      this.performRollback(
        'timeout',
        'Automatically rolled back after 30 s with no Keep confirmation.',
      )
      return true
    }
    if (
      this.watchStarted &&
      this.autoConfigState.confirmed &&
      !this.autoConfigState.rollback_offered &&
      now >= this.watchDeadlineAt
    ) {
      this.snapshot = null
      this.watchStarted = false
      this.autoConfigState = {
        ...emptyAutoConfigState(),
        mode: this.autoConfigState.mode,
        candidates: this.autoConfigState.candidates,
        upload_check: this.autoConfigState.upload_check,
        picked: this.autoConfigState.picked,
        duration_ms: this.autoConfigState.duration_ms,
      }
      this.broadcastAutoConfig()
      return true
    }
    if (this.autoConfigState.rollback_offered) return true
    return false
  }

  private performRollback(trigger: RollbackTrigger, reason: string): AutoConfigState {
    this.applyWatchToken++
    const prev = this.snapshot ?? clone(this.studioSettingsData)
    this.snapshot = null
    this.wasLive = false
    this.watchStarted = false
    this.pendingOffer = null
    const merged: Record<string, unknown> = clone(this.studioSettingsData)
    merged.encoder = prev.encoder
    merged.video_encoder = prev.video_encoder ?? null
    merged.encoder_settings = clone((prev.encoder_settings as Record<string, unknown>) ?? {})
    merged.scale = prev.scale ? [...(prev.scale as number[])] : null
    merged.fps = prev.fps
    merged.video_kbps = prev.video_kbps
    this.studioSettingsData = merged
    const restored: AutoConfigAppliedSummary = {
      encoder: (prev.encoder === 'software' ? 'software' : 'hardware') as 'hardware' | 'software',
      video_encoder: (prev.video_encoder as string | null) ?? null,
      encoder_settings: clone((prev.encoder_settings as Record<string, unknown>) ?? {}),
      scale: (prev.scale as [number, number] | null) ?? null,
      fps: Number(prev.fps ?? 60),
      video_kbps: Number(prev.video_kbps ?? 6000),
      label: prev.encoder === 'software' ? 'x264' : 'Hardware encoder',
    }
    this.autoConfigState = {
      ...this.autoConfigState,
      state: 'rolled_back',
      applied: null,
      confirmed: false,
      confirm_remaining_s: 0,
      watch_remaining_s: 0,
      rollback_offered: false,
      rollback_trigger: trigger,
      rollback_reason: reason,
      restored,
    }
    this.broadcastAutoConfig()
    if (trigger !== 'user_undo') {
      const msg =
        trigger === 'timeout'
          ? 'Encoder settings rolled back (no confirmation in 30 s)'
          : 'Encoder settings rolled back after dropped frames'
      this.host?.broadcastLive({
        v: 1,
        type: 'notice',
        data: { key: 'auto_config_rollback', level: 'warn', message: msg, detail: reason },
      })
    }
    return this.autoConfigView()
  }
}

function emptyAutoConfigState(): AutoConfigState {
  return {
    state: 'idle',
    job_id: null,
    mode: 'stream',
    phase: null,
    progress_pct: 0,
    current_label: null,
    elapsed_ms: 0,
    estimated_total_ms: 0,
    candidates: [],
    upload_check: null,
    upload_error: null,
    picked: null,
    duration_ms: null,
    error: null,
    applied: null,
    confirmed: false,
    confirm_remaining_s: 0,
    watch_remaining_s: 0,
    first_minute_drops: 0,
    first_minute_lags: 0,
    rollback_offered: false,
    rollback_trigger: null,
    rollback_reason: null,
    restored: null,
  }
}

function demoCand(o: {
  backend: string
  studioId: string
  label: string
  family: EncoderFamily
  preset?: string | null
  w: number
  h: number
  fps: number
  avg: number
  p95: number
  max: number
  skip?: number
  lag?: number
  cpu: number | null
  gpu: number | null
}): AutoConfigCandidate {
  const budget = 1000 / o.fps
  const headroom = Math.max(-100, Math.min(100, (1 - o.avg / budget) * 100))
  const skip = o.skip ?? 0
  const lag = o.lag ?? 0
  const passed =
    skip === 0 &&
    lag <= 1 &&
    o.avg <= budget * 0.72 &&
    o.p95 <= budget * 1.05 &&
    (o.cpu === null || o.cpu <= 85) &&
    (o.gpu === null || o.gpu <= 90)
  return {
    encoder_backend: o.backend,
    studio_encoder_id: o.studioId,
    label: o.label,
    family: o.family,
    hardware: o.family !== 'x264',
    preset: o.preset ?? null,
    width: o.w,
    height: o.h,
    fps: o.fps,
    bitrate_kbps: 6000,
    frames_tested: o.fps * 2,
    encode_ms_avg: Math.round(o.avg * 100) / 100,
    encode_ms_p95: Math.round(o.p95 * 100) / 100,
    encode_ms_max: Math.round(o.max * 100) / 100,
    budget_ms: Math.round(budget * 100) / 100,
    fps_achieved: Math.round(Math.min(o.fps, 1000 / o.avg) * 10) / 10,
    headroom_pct: Math.round(headroom * 10) / 10,
    skipped_frames: skip,
    lagged_frames: lag,
    cpu_pct: o.cpu,
    gpu_pct: o.gpu,
    elapsed_ms: 1900,
    passed,
    reason: passed
      ? `Held ${o.fps} fps at ${o.avg.toFixed(1)} ms/frame (${Math.round(headroom)}% headroom)`
      : skip > 0
        ? `Encoder skipped ${skip} frames because it fell behind.`
        : `${o.avg.toFixed(1)} ms/frame exceeded the ${o.fps} fps headroom ceiling.`,
  }
}

function scaleForShortEdge(canvas: [number, number], targetShort: number): [number, number] {
  const cw = Math.max(128, canvas[0] & ~1)
  const ch = Math.max(72, canvas[1] & ~1)
  const short = Math.min(cw, ch)
  if (targetShort >= short) return [cw, ch]
  const s = Math.max(72, targetShort & ~1)
  if (cw <= ch) {
    const h = Math.max(72, Math.round((ch * s) / cw / 2) * 2)
    return [s, h]
  }
  const w = Math.max(128, Math.round((cw * s) / ch / 2) * 2)
  return [w, s]
}

function buildDemoCandidates(
  profile: DemoBenchProfile,
  canvas: [number, number],
  fps: 30 | 60,
  mode: AutoConfigMode = 'stream',
): AutoConfigCandidate[] {
  const shortEdge = Math.min(canvas[0], canvas[1])
  const topShort = mode === 'record' ? Math.min(shortEdge, 2160) : Math.min(shortEdge, 1080)
  const [wTop, hTop] = scaleForShortEdge(canvas, topShort)
  const [w720, h720] = scaleForShortEdge(canvas, Math.min(shortEdge, 720))

  if (profile === 'nvidia_nvenc') {
    return [
      demoCand({
        backend: 'h264_nvenc',
        studioId: 'ffmpeg_hardware',
        label: 'NVIDIA NVENC',
        family: 'nvenc',
        w: wTop,
        h: hTop,
        fps,
        avg: 2.9,
        p95: 3.8,
        max: 4.9,
        cpu: 14,
        gpu: 26,
      }),
      demoCand({
        backend: 'libx264',
        studioId: 'obs_x264',
        label: 'x264 (veryfast)',
        family: 'x264',
        preset: 'veryfast',
        w: wTop,
        h: hTop,
        fps,
        avg: 7.4,
        p95: 9.8,
        max: 12.1,
        cpu: 54,
        gpu: 12,
      }),
      demoCand({
        backend: 'libx264',
        studioId: 'obs_x264',
        label: 'x264 (superfast)',
        family: 'x264',
        preset: 'superfast',
        w: wTop,
        h: hTop,
        fps,
        avg: 5.2,
        p95: 6.9,
        max: 8.4,
        cpu: 41,
        gpu: 11,
      }),
    ]
  }
  if (profile === 'qsv_stepdown') {
    return [
      demoCand({
        backend: 'h264_qsv',
        studioId: 'ffmpeg_hardware',
        label: 'Intel Quick Sync',
        family: 'qsv',
        w: wTop,
        h: hTop,
        fps: 60,
        avg: 14.6,
        p95: 19.2,
        max: 24.0,
        lag: 6,
        cpu: 22,
        gpu: 88,
      }),
      demoCand({
        backend: 'h264_qsv',
        studioId: 'ffmpeg_hardware',
        label: 'Intel Quick Sync',
        family: 'qsv',
        w: w720,
        h: h720,
        fps: 60,
        avg: 5.6,
        p95: 7.2,
        max: 8.9,
        cpu: 19,
        gpu: 51,
      }),
      demoCand({
        backend: 'libx264',
        studioId: 'obs_x264',
        label: 'x264 (veryfast)',
        family: 'x264',
        preset: 'veryfast',
        w: w720,
        h: h720,
        fps: 60,
        avg: 13.8,
        p95: 17.5,
        max: 21.0,
        lag: 4,
        cpu: 89,
        gpu: 15,
      }),
    ]
  }
  if (profile === 'weak_cpu') {
    return [
      demoCand({
        backend: 'libx264',
        studioId: 'obs_x264',
        label: 'x264 (veryfast)',
        family: 'x264',
        preset: 'veryfast',
        w: wTop,
        h: hTop,
        fps: 60,
        avg: 24.5,
        p95: 31.0,
        max: 39.0,
        skip: 9,
        cpu: 94,
        gpu: null,
      }),
      demoCand({
        backend: 'libx264',
        studioId: 'obs_x264',
        label: 'x264 (superfast)',
        family: 'x264',
        preset: 'superfast',
        w: w720,
        h: h720,
        fps: 30,
        avg: 12.1,
        p95: 15.8,
        max: 18.5,
        cpu: 58,
        gpu: null,
      }),
    ]
  }
  return [
    demoCand({
      backend: 'videotoolbox',
      studioId: 'com.apple.videotoolbox.videoencoder.ave.avc',
      label: 'Apple VideoToolbox',
      family: 'videotoolbox',
      w: wTop,
      h: hTop,
      fps,
      avg: 2.3,
      p95: 3.1,
      max: 4.2,
      cpu: 16,
      gpu: 22,
    }),
    demoCand({
      backend: 'libx264',
      studioId: 'obs_x264',
      label: 'x264 (veryfast)',
      family: 'x264',
      preset: 'veryfast',
      w: wTop,
      h: hTop,
      fps,
      avg: 8.6,
      p95: 11.4,
      max: 14.0,
      cpu: 57,
      gpu: 10,
    }),
    demoCand({
      backend: 'libx264',
      studioId: 'obs_x264',
      label: 'x264 (superfast)',
      family: 'x264',
      preset: 'superfast',
      w: wTop,
      h: hTop,
      fps,
      avg: 5.9,
      p95: 7.7,
      max: 9.8,
      cpu: 42,
      gpu: 10,
    }),
  ]
}

const PLATFORM_CAPS: Record<string, number> = { twitch: 6000, kick: 8000, youtube: 12000 }

function recordKbpsFor(shortEdge: number, fps: number): number {
  const highFps = fps >= 60
  if (shortEdge >= 2160) return highFps ? 32000 : 22000
  if (shortEdge >= 1440) return highFps ? 18000 : 12000
  if (shortEdge >= 1080) return highFps ? 12000 : 8000
  if (shortEdge >= 720) return highFps ? 6500 : 4500
  return 2500
}

function streamTierCap(shortEdge: number, fps: number): number {
  const highFps = fps >= 60
  if (shortEdge >= 1080) return highFps ? 12000 : 8000
  if (shortEdge >= 720) return highFps ? 6000 : 4500
  return 3000
}

function pickDemoRecommendation(
  candidates: AutoConfigCandidate[],
  mode: AutoConfigMode,
  fpsPref: 30 | 60,
  canvas: [number, number],
  uploadKbps: number | null,
  platforms: { id: string; kind: Service; name: string; enhanced: boolean }[],
): AutoConfigRecommendation {
  const cw = Math.max(128, canvas[0] & ~1)
  const ch = Math.max(72, canvas[1] & ~1)
  const canvasShort = Math.min(cw, ch)
  const caps = platforms
    .filter((p) => !((p.kind === 'twitch' || p.kind === 'kick') && p.enhanced))
    .map((p) => PLATFORM_CAPS[p.kind] ?? 12000)
  const cap = Math.min(12000, ...(caps.length ? caps : [12000]))
  const n = Math.max(1, platforms.length)

  let capKbps = 12000
  let [maxW, maxH] = scaleForShortEdge([cw, ch], Math.min(canvasShort, 2160))
  let maxFps: number = fpsPref
  let ceilLimited: LimitedBy = 'balanced'
  if (mode === 'stream') {
    const share = uploadKbps !== null ? (uploadKbps * 0.75) / n : 6000
    capKbps = Math.max(500, Math.min(cap, Math.floor(share / 500) * 500))
    ceilLimited =
      share < 500
        ? 'upload_too_slow'
        : share < cap
          ? 'upload'
          : caps.some((c) => capKbps === c)
            ? 'platform_cap'
            : 'balanced'
    let targetShort: number
    if (fpsPref === 60) {
      if (capKbps >= 6000) targetShort = 1080
      else if (capKbps >= 3500) targetShort = 720
      else {
        maxFps = 30
        targetShort = capKbps >= 2500 ? 720 : 480
      }
    } else targetShort = capKbps >= 4500 ? 1080 : capKbps >= 2500 ? 720 : 480
    ;[maxW, maxH] = scaleForShortEdge([cw, ch], Math.min(canvasShort, targetShort))
  }

  const passing = candidates.filter((c) => c.passed)
  const eff = (c: AutoConfigCandidate) => ({
    w: Math.min(c.width, maxW) & ~1,
    h: Math.min(c.height, maxH) & ~1,
    fps: Math.min(c.fps, maxFps),
  })
  const best = (
    passing.length
      ? [...passing].sort((a, b) => {
          const ea = eff(a)
          const eb = eff(b)
          if (ea.w * ea.h !== eb.w * eb.h) return eb.w * eb.h - ea.w * ea.h
          if (ea.fps !== eb.fps) return eb.fps - ea.fps
          if (a.hardware !== b.hardware) return b.hardware ? 1 : -1
          return b.headroom_pct - a.headroom_pct
        })
      : [...candidates].sort((a, b) => {
          const aRate = (a.skipped_frames + a.lagged_frames) / Math.max(1, a.frames_tested)
          const bRate = (b.skipped_frames + b.lagged_frames) / Math.max(1, b.frames_tested)
          if (aRate !== bRate) return aRate - bRate
          const aRatio = a.encode_ms_avg / Math.max(1, a.budget_ms)
          const bRatio = b.encode_ms_avg / Math.max(1, b.budget_ms)
          if (aRatio !== bRatio) return aRatio - bRatio
          return b.hardware === a.hardware ? 0 : b.hardware ? -1 : 1
        })
  )[0]!

  const out = eff(best)
  const outShort = Math.min(out.w, out.h)
  const scale: [number, number] | null = out.w === cw && out.h === ch ? null : [out.w, out.h]
  const encoderDowngraded = mode === 'stream' && (out.w * out.h < maxW * maxH || out.fps < maxFps)
  const limited_by: LimitedBy =
    mode === 'record'
      ? best.passed && !scale
        ? 'balanced'
        : 'headroom'
      : !best.passed || encoderDowngraded
        ? 'headroom'
        : ceilLimited
  const video_kbps =
    mode === 'record'
      ? recordKbpsFor(outShort, out.fps)
      : encoderDowngraded
        ? Math.max(500, Math.min(capKbps, streamTierCap(outShort, out.fps)))
        : capKbps
  const split = n > 1 && uploadKbps !== null ? ` shared by ${n} platforms` : ''
  const upText =
    uploadKbps !== null && mode === 'stream'
      ? ` ${(uploadKbps / 1000).toFixed(1)} Mbps upload${split}.${
          limited_by === 'upload_too_slow'
            ? " Your upload can't carry even the 500 kbps minimum for each platform: stream to fewer platforms or test a faster connection."
            : ''
        }`
      : ''
  return {
    encoder: best.hardware ? 'hardware' : 'software',
    video_encoder: null,
    studio_encoder_id: best.studio_encoder_id,
    encoder_settings: !best.hardware && best.preset ? { preset: best.preset } : {},
    label: best.label,
    preset: best.preset,
    scale,
    width: out.w,
    height: out.h,
    fps: out.fps,
    video_kbps,
    headroom_pct: best.headroom_pct,
    limited_by,
    why: `${best.label} held ${outShort}p${out.fps} at ${best.encode_ms_avg.toFixed(1)} ms/frame (${Math.round(best.headroom_pct)}% headroom).${upText}`,
  }
}
