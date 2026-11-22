import type {
  AutoConfigAppliedSummary,
  AutoConfigCandidate,
  AutoConfigMode,
  AutoConfigRecommendation,
  AutoConfigState,
  EncoderFamily,
  EngineFilter,
  EngineImportPreview,
  EngineImportReport,
  EngineImportSkip,
  EngineLevel,
  EngineObsCollection,
  EngineOption,
  EngineShelf,
  EngineStats,
  LimitedBy,
  NewEngineSource,
  RollbackTrigger,
} from '../../studio-engine'
import type { Service, UploadCheck } from '../../golive'
import { HttpError } from '../http-error'
import { clone, requireObj, type DemoHost } from './host'

export type DemoCollectionPreset = 'normal' | 'empty' | 'broken' | 'huge'
export type DemoMicPreset = 'quiet' | 'good' | 'loud' | 'silent'
export type DemoBenchProfile = 'apple_vt' | 'nvidia_nvenc' | 'weak_cpu' | 'qsv_stepdown'

export interface DemoStudioEngineOptions {
  obsPreset?: DemoCollectionPreset
  streamlabsPreset?: DemoCollectionPreset
  hasCamera?: boolean
  /** The camera is there but this computer won't let the app use it (macOS privacy). */
  cameraDenied?: boolean
  hasMic?: boolean
  micPreset?: DemoMicPreset
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
  private activeScenes: string[] = ['Main', 'BRB']
  private currentScene = 'Main'
  private micSourceName = 'Mic'
  private micDeviceId = 'mic-builtin'
  private cameraSourceName = 'Webcam'
  private filters = new Map<string, EngineFilter[]>()
  private audioVolumeDb = new Map<string, number>()
  private audioMuted = new Map<string, boolean>()
  private streamActive = false
  private recordActive = false
  private simDropped = 0
  private simLagged = 0
  private simSkipped = 0
  private benchJobSeq = 0
  private benchCancelToken = 0
  private applyWatchToken = 0
  private confirmDeadlineAt = 0
  private watchDeadlineAt = 0
  private snapshot: Record<string, unknown> | null = null
  private baselineDropped = 0
  private baselineLagged = 0
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

  constructor(opts: DemoStudioEngineOptions = {}, host: DemoHost | null = null) {
    this.host = host
    this.opts = {
      obsPreset: opts.obsPreset ?? 'normal',
      streamlabsPreset: opts.streamlabsPreset ?? 'normal',
      hasCamera: opts.hasCamera ?? true,
      cameraDenied: opts.cameraDenied ?? false,
      hasMic: opts.hasMic ?? true,
      micPreset: opts.micPreset ?? 'quiet',
      running: opts.running ?? false,
      benchProfile: opts.benchProfile ?? 'apple_vt',
      benchStepMs: opts.benchStepMs ?? 180,
      confirmTimeoutMs: opts.confirmTimeoutMs ?? 30_000,
      watchWindowMs: opts.watchWindowMs ?? 60_000,
    }
    this.filters.set('Mic', [])
    this.filters.set('Desktop Audio', [])
  }

  setAutoConfigDeps(deps: DemoAutoConfigDeps): void {
    this.deps = deps
  }

  setStreamActive(on: boolean): void {
    this.streamActive = on
  }

  setRecordActive(on: boolean): void {
    this.recordActive = on
  }

  injectDroppedFrames(dropped: number, lagged = 0): void {
    this.simDropped += dropped
    this.simLagged += lagged
    this.evaluateWatchStep()
  }

  configure(next: Partial<DemoStudioEngineOptions>): void {
    Object.assign(this.opts, next)
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
      this.activeScenes = [...entry.scenes]
      this.currentScene = entry.scenes[0]!
    }
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

  private requireMicName(name: string): void {
    if (!this.opts.hasMic || name !== this.micSourceName) {
      if (name !== 'Desktop Audio' && name !== this.cameraSourceName) {
        throw new HttpError(
          404,
          'studio_no_source',
          `There’s no source called "${name}".`,
          'Refresh the list of sources.',
        )
      }
    }
  }

  private levelFor(name: string): EngineLevel {
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
    const muted = this.audioMuted.get(name) ?? false
    const volDb = this.audioVolumeDb.get(name) ?? 0
    const phase = (Date.now() % 1800) / 1800
    const ripple = Math.sin(phase * Math.PI * 2) * 3.5 + Math.cos(phase * Math.PI * 4) * 1.2
    const rawBase =
      this.opts.micPreset === 'quiet' ? -27 : this.opts.micPreset === 'loud' ? -1.8 : -15
    const raw = Math.min(-0.2, Math.max(-46, rawBase + ripple))
    if (muted) {
      return { peak: [-100, -100], magnitude: [-100, -100], input_peak: [raw, raw] }
    }
    const chain = (this.filters.get(name) ?? []).filter((f) => f.enabled)
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
      const shelf = rest[3] === 'collections' ? this.shelfCollections : this.shelfProfiles
      if (method === 'GET' && rest.length === 4) return clone(shelf)
      if (method === 'PUT' && rest.length === 5 && rest[4] === 'current') {
        const id = String(requireObj(body).id ?? '')
        if (!shelf.list.some((x) => x.id === id)) {
          throw new HttpError(404, 'studio_no_such', `There’s no collection "${id}".`)
        }
        shelf.current = id
        return { id }
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

    if (method === 'GET' && rest[2] === 'kinds' && rest[4] === 'options') {
      const kind = decodeURIComponent(rest[3]!)
      if (kind === 'av_capture_input_v2' || kind === 'dshow_input' || kind === 'v4l2_input') {
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
      return this.stillForDevice(url?.searchParams.get('value') ?? null)
    }

    if (is('GET', 'studio/engine/scenes')) {
      return {
        current: this.currentScene,
        scenes: this.activeScenes.map((name) => ({
          name,
          items: name === this.currentScene ? 2 : 1,
          current: name === this.currentScene,
        })),
        transition: { kind: 'fade_transition', ms: 300 },
        vertical: null,
      }
    }

    if (is('GET', 'studio/engine/sources')) {
      const list = [
        ...(this.opts.hasCamera
          ? [
              {
                name: this.cameraSourceName,
                kind: 'av_capture_input_v2',
                scenes: [this.currentScene],
              },
            ]
          : []),
        ...(this.opts.hasMic
          ? [
              {
                name: this.micSourceName,
                kind: 'coreaudio_input_capture',
                scenes: [this.currentScene],
              },
            ]
          : []),
        { name: 'Desktop Audio', kind: 'sck_audio_capture', scenes: [this.currentScene] },
      ]
      return list
    }

    if (method === 'GET' && rest[2] === 'scenes' && rest[4] === 'audio') {
      return [
        ...(this.opts.hasMic
          ? [
              {
                name: this.micSourceName,
                kind: 'coreaudio_input_capture',
                channel: 3,
                volume_db: this.audioVolumeDb.get(this.micSourceName) ?? 0,
                muted: this.audioMuted.get(this.micSourceName) ?? false,
                monitor: 'off',
              },
            ]
          : []),
        {
          name: 'Desktop Audio',
          kind: 'sck_audio_capture',
          channel: 1,
          volume_db: this.audioVolumeDb.get('Desktop Audio') ?? 0,
          muted: this.audioMuted.get('Desktop Audio') ?? false,
          monitor: 'off',
        },
      ]
    }

    if (method === 'PUT' && rest[2] === 'channels' && rest.length === 4) {
      const b = requireObj(body)
      if (b.name) this.micSourceName = String(b.name)
      const settings = (b.settings as Record<string, unknown> | undefined) ?? {}
      if (settings.device_id) this.micDeviceId = String(settings.device_id)
      if (!this.filters.has(this.micSourceName)) this.filters.set(this.micSourceName, [])
      return undefined
    }

    if (method === 'GET' && rest[2] === 'sources' && rest[4] === 'picture') {
      return {
        image: this.opts.hasCamera ? cameraFrameSvg(CAMERA_SVGS[0].id) : null,
        width: 1920,
        height: 1080,
      }
    }

    if (method === 'GET' && rest[2] === 'sources' && rest[4] === 'settings') {
      const name = decodeURIComponent(rest[3]!)
      if (name === this.micSourceName) return { device_id: this.micDeviceId }
      return {}
    }

    if (method === 'PUT' && rest[2] === 'sources' && rest[4] === 'settings') {
      // Like the engine: only the keys sent change, and the source keeps its filters and sound.
      const name = decodeURIComponent(rest[3]!)
      this.requireMicName(name)
      const settings = (requireObj(body).settings as Record<string, unknown> | undefined) ?? {}
      if (settings.device_id) this.micDeviceId = String(settings.device_id)
      return undefined
    }

    if (method === 'PUT' && rest[2] === 'sources' && rest[4] === 'audio') {
      const name = decodeURIComponent(rest[3]!)
      this.requireMicName(name)
      const b = requireObj(body)
      if (typeof b.volume_db === 'number') this.audioVolumeDb.set(name, b.volume_db)
      if (typeof b.muted === 'boolean') this.audioMuted.set(name, b.muted)
      return undefined
    }

    if (rest[2] === 'sources' && rest[4] === 'filters') {
      const name = decodeURIComponent(rest[3]!)
      this.requireMicName(name)
      const list = this.filters.get(name) ?? []
      this.filters.set(name, list)
      if (method === 'GET' && rest.length === 5) return clone(list)
      if (method === 'POST' && rest.length === 5) {
        const b = body as NewEngineSource
        const fName = String(b.name ?? '').trim()
        if (!fName) throw new HttpError(400, 'invalid', 'name: 1 to 100 characters.')
        if (list.some((x) => x.name === fName)) {
          throw new HttpError(409, 'studio_name_taken', `Filter "${fName}" already exists.`)
        }
        const created: EngineFilter = { name: fName, kind: String(b.kind), enabled: true }
        list.push(created)
        return clone(created)
      }
      if (method === 'POST' && rest.length === 7 && rest[6] === 'edit') {
        const fName = decodeURIComponent(rest[5]!)
        const idx = list.findIndex((x) => x.name === fName)
        if (idx === -1) throw new HttpError(404, 'studio_no_filter', `No filter "${fName}".`)
        const act = String(requireObj(body).do ?? '')
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
      if (method === 'DELETE' && rest.length === 6) {
        const fName = decodeURIComponent(rest[5]!)
        this.filters.set(
          name,
          list.filter((x) => x.name !== fName),
        )
        return undefined
      }
    }

    if (is('GET', 'studio/engine/settings')) {
      return clone(this.studioSettingsData)
    }
    if (is('PUT', 'studio/engine/settings')) {
      this.studioSettingsData = { ...this.studioSettingsData, ...requireObj(body) }
      return { settings: clone(this.studioSettingsData), restart: null }
    }
    if (is('GET', 'studio/engine/stats')) {
      return this.engineStatsSnapshot()
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

  stillForDevice(device: string | null): { image: string | null; error?: string | null } {
    if (!this.opts.hasCamera) {
      throw new HttpError(404, 'studio_no_source', 'No camera is available on this computer.')
    }
    if (this.opts.cameraDenied)
      return {
        image: null,
        error:
          'The camera is turned off for Ferrocast. Open System Settings, Privacy & Security, Camera, turn Ferrocast on, then press Retry.',
      }
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
    return this.streamActive || this.recordActive || !!this.deps?.isLive()
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
      out.confirm_remaining_s = out.confirmed
        ? 0
        : Math.max(0, Math.ceil((this.confirmDeadlineAt - now) / 1000))
      out.watch_remaining_s = Math.max(0, Math.ceil((this.watchDeadlineAt - now) / 1000))
      out.first_minute_drops = Math.max(0, this.simDropped - this.baselineDropped)
      out.first_minute_lags = Math.max(0, this.simLagged + this.simSkipped - this.baselineLagged)
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

    const includeUpload =
      b.include_upload === undefined ? mode === 'stream' : Boolean(b.include_upload)
    const jobId = `demo-bench-${++this.benchJobSeq}`
    const token = ++this.benchCancelToken
    const width = Number(this.studioSettingsData.width ?? 1920)
    const height = Number(this.studioSettingsData.height ?? 1080)
    const canvas: [number, number] = [width, height]
    const startedAt = Date.now()
    const stepMs = Math.max(20, this.opts.benchStepMs)
    const plan = buildDemoCandidates(this.opts.benchProfile, canvas, fpsPref as 30 | 60)

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
    let stepIdx = 0

    const runStep = () => {
      if (this.benchCancelToken !== token || this.autoConfigState.state !== 'running') return
      if (includeUpload && mode === 'stream' && !uploadCheck) {
        uploadCheck = this.deps?.runUploadCheck() ?? null
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

      const platforms = this.deps?.enabledPlatforms() ?? []
      const picked = pickDemoRecommendation(
        this.autoConfigState.candidates,
        mode as AutoConfigMode,
        fpsPref as 30 | 60,
        canvas,
        uploadCheck?.verdict.upload_kbps ?? null,
        platforms,
      )
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
      (Number(req.video_kbps) < 500 || Number(req.video_kbps) > 60_000)
    ) {
      throw new HttpError(400, 'invalid', 'video_kbps: 500 to 60000.')
    }
    const picked = this.autoConfigState.picked
    if (!picked && req.fps === undefined && req.video_kbps === undefined && !req.encoder) {
      throw new HttpError(400, 'invalid', 'Run the benchmark or provide settings to apply.')
    }

    this.snapshot = clone(this.studioSettingsData)
    const next: Record<string, unknown> = clone(this.studioSettingsData)
    if (picked) {
      next.encoder = picked.encoder
      next.video_encoder = picked.video_encoder
      next.encoder_settings = clone(picked.encoder_settings)
      next.scale = picked.scale ? [...picked.scale] : null
      next.fps = picked.fps
      next.video_kbps = picked.video_kbps
    }
    if (req.encoder !== undefined) next.encoder = req.encoder
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
    this.confirmDeadlineAt = now + this.opts.confirmTimeoutMs
    this.watchDeadlineAt = now + this.opts.watchWindowMs
    this.baselineDropped = this.simDropped
    this.baselineLagged = this.simLagged + this.simSkipped
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
    this.autoConfigState.confirmed = true
    this.autoConfigState.confirm_remaining_s = 0
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
    const drops = Math.max(0, this.simDropped - this.baselineDropped)
    const lags = Math.max(0, this.simLagged + this.simSkipped - this.baselineLagged)
    if (now < this.watchDeadlineAt && drops + lags >= 5) {
      this.performRollback(
        'dropped_frames',
        `Automatically rolled back because the first minute showed ${drops} dropped and ${lags} lagged/skipped frames.`,
      )
      return true
    }
    if (!this.autoConfigState.confirmed && now >= this.confirmDeadlineAt) {
      this.performRollback(
        'timeout',
        'Automatically rolled back after 30 s with no Keep confirmation.',
      )
      return true
    }
    if (this.autoConfigState.confirmed && now >= this.watchDeadlineAt) {
      this.autoConfigState = {
        ...this.autoConfigState,
        state: this.autoConfigState.picked ? 'done' : 'idle',
        applied: null,
        confirmed: false,
        confirm_remaining_s: 0,
        watch_remaining_s: 0,
      }
      this.broadcastAutoConfig()
      return true
    }
    return false
  }

  private performRollback(trigger: RollbackTrigger, reason: string): AutoConfigState {
    this.applyWatchToken++
    const prev = this.snapshot ?? clone(this.studioSettingsData)
    this.studioSettingsData = clone(prev)
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

function buildDemoCandidates(
  profile: DemoBenchProfile,
  canvas: [number, number],
  fps: 30 | 60,
): AutoConfigCandidate[] {
  const [cw, ch] = canvas
  const hTop = Math.min(ch, 1080)
  const wTop = hTop >= ch ? cw : Math.round((cw * hTop) / ch / 2) * 2
  const w720 = Math.round((cw * 720) / ch / 2) * 2

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
        h: 720,
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
        h: 720,
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
        h: 720,
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

function pickDemoRecommendation(
  candidates: AutoConfigCandidate[],
  mode: AutoConfigMode,
  fpsPref: 30 | 60,
  canvas: [number, number],
  uploadKbps: number | null,
  platforms: { id: string; kind: Service; name: string; enhanced: boolean }[],
): AutoConfigRecommendation {
  const [cw, ch] = canvas
  const caps = platforms
    .filter((p) => !(p.kind === 'twitch' && p.enhanced))
    .map((p) => PLATFORM_CAPS[p.kind] ?? 12000)
  const cap = Math.min(12000, ...(caps.length ? caps : [12000]))
  const n = Math.max(1, platforms.length)

  let capKbps = 12000
  let maxW = cw
  let maxH = Math.min(ch, 1080)
  let maxFps: number = fpsPref
  let ceilLimited: LimitedBy = 'balanced'
  if (mode === 'stream') {
    const share = uploadKbps !== null ? (uploadKbps * 0.75) / n : 6000
    capKbps = Math.max(1500, Math.min(cap, Math.floor(share / 500) * 500))
    ceilLimited =
      share < cap ? 'upload' : caps.some((c) => capKbps === c) ? 'platform_cap' : 'balanced'
    let th: number
    if (fpsPref === 60) {
      if (capKbps >= 6000) th = 1080
      else if (capKbps >= 3500) th = 720
      else {
        maxFps = 30
        th = capKbps >= 2500 ? 720 : 480
      }
    } else th = capKbps >= 4500 ? 1080 : capKbps >= 2500 ? 720 : 480
    th = Math.min(ch, th)
    maxH = th
    maxW = th >= ch ? cw : Math.round((cw * th) / ch / 2) * 2
  }

  const passing = candidates.filter((c) => c.passed)
  const pool = passing.length ? passing : candidates
  const eff = (c: AutoConfigCandidate) => ({
    w: Math.min(c.width, maxW) & ~1,
    h: Math.min(c.height, maxH) & ~1,
    fps: Math.min(c.fps, maxFps),
  })
  const best = [...pool].sort((a, b) => {
    const ea = eff(a)
    const eb = eff(b)
    if (ea.w * ea.h !== eb.w * eb.h) return eb.w * eb.h - ea.w * ea.h
    if (ea.fps !== eb.fps) return eb.fps - ea.fps
    if (a.hardware !== b.hardware) return b.hardware ? 1 : -1
    return b.headroom_pct - a.headroom_pct
  })[0]!

  const out = eff(best)
  const scale: [number, number] | null = out.w === cw && out.h === ch ? null : [out.w, out.h]
  const encoderDowngraded = mode === 'stream' && (out.h < maxH || out.fps < maxFps)
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
      ? out.h >= 1080
        ? out.fps >= 60
          ? 12000
          : 8000
        : out.h >= 720
          ? out.fps >= 60
            ? 6500
            : 4500
          : 2500
      : encoderDowngraded
        ? Math.min(capKbps, out.h >= 720 ? 4500 : 2500)
        : capKbps
  const split = n > 1 && uploadKbps !== null ? ` shared by ${n} platforms` : ''
  const upText =
    uploadKbps !== null && mode === 'stream'
      ? ` ${(uploadKbps / 1000).toFixed(1)} Mbps upload${split}.`
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
    why: `${best.label} held ${out.h}p${out.fps} at ${best.encode_ms_avg.toFixed(1)} ms/frame (${Math.round(best.headroom_pct)}% headroom).${upText}`,
  }
}
