import {
  resolveTransitionFromScenes,
  type EncodeBudget,
  type EngineFilter,
  type EngineImportPreview,
  type EngineImportReport,
  type EngineImportSkip,
  type EngineLevel,
  type EngineNamedTransition,
  type EngineObsCollection,
  type EngineOption,
  type EngineSettings,
  type EngineShelf,
  type EngineStudioOptions,
  type EngineTransition,
  type EngineTransitionMatrixRule,
  type NewEngineSource,
} from '../../studio-engine'
import { HttpError } from '../http-error'
import { clone, requireObj } from './host'

export type DemoCollectionPreset = 'normal' | 'empty' | 'broken' | 'huge'
export type DemoMicPreset = 'quiet' | 'good' | 'loud' | 'silent'

export interface DemoStudioEngineOptions {
  obsPreset?: DemoCollectionPreset
  streamlabsPreset?: DemoCollectionPreset
  hasCamera?: boolean
  /** The camera is there but this computer won't let the app use it (macOS privacy). */
  cameraDenied?: boolean
  hasMic?: boolean
  micPreset?: DemoMicPreset
  running?: boolean
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
  private shelfCollections: EngineShelf = {
    current: 'untitled',
    list: [{ id: 'untitled', name: 'Untitled' }],
  }
  private shelfProfiles: EngineShelf = {
    current: 'default',
    list: [{ id: 'default', name: 'Default' }],
  }
  private activeScenes: string[] = ['Main', 'Gameplay', 'Chatting', 'BRB']
  private currentScene = 'Main'
  private previewScene: string | null = null
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
  private filters = new Map<string, EngineFilter[]>()
  private audioVolumeDb = new Map<string, number>()
  private audioMuted = new Map<string, boolean>()
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

  constructor(opts: DemoStudioEngineOptions = {}) {
    this.opts = {
      obsPreset: opts.obsPreset ?? 'normal',
      streamlabsPreset: opts.streamlabsPreset ?? 'normal',
      hasCamera: opts.hasCamera ?? true,
      cameraDenied: opts.cameraDenied ?? false,
      hasMic: opts.hasMic ?? true,
      micPreset: opts.micPreset ?? 'quiet',
      running: opts.running ?? false,
    }
    this.filters.set('Mic', [])
    this.filters.set('Desktop Audio', [])
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
          { id: 'swipe_transition', name: 'Swipe' },
          { id: 'slide_transition', name: 'Slide' },
          { id: 'fade_to_color_transition', name: 'Fade to colour' },
          { id: 'wipe_transition', name: 'Wipe' },
          { id: 'obs_stinger_transition', name: 'Stinger' },
          { id: 'ferrocast_move', name: 'Move' },
        ],
        encoders: [{ id: 'obs_x264', name: 'x264' }],
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
      return this.scenesPayload()
    }
    if (is('POST', 'studio/engine/scenes')) {
      const b = requireObj(body)
      const name = String(b.name ?? '').trim()
      if (!name || name.length > 100) {
        throw new HttpError(400, 'invalid', 'name: 1 to 100 letters on one line.')
      }
      if (this.activeScenes.includes(name)) {
        throw new HttpError(409, 'studio_name_taken', `"${name}" is taken: pick another name.`)
      }
      this.activeScenes.push(name)
      return { name, items: 0, current: false, preview: false, transition: null }
    }
    if (method === 'DELETE' && rest[2] === 'scenes' && rest.length === 4) {
      const name = decodeURIComponent(rest[3]!)
      if (!this.activeScenes.includes(name)) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${name}".`)
      }
      if (this.activeScenes.length < 2) {
        throw new HttpError(409, 'studio_last_scene', 'A collection keeps at least one scene.')
      }
      this.activeScenes = this.activeScenes.filter((s) => s !== name)
      this.transitionMatrix = this.transitionMatrix.filter((r) => r.from !== name && r.to !== name)
      this.legacySceneTransitions.delete(name)
      if (this.currentScene === name) this.currentScene = this.activeScenes[0]!
      if (this.previewScene === name) this.previewScene = this.activeScenes[0]!
      return undefined
    }
    if (method === 'POST' && rest[2] === 'scenes' && rest[4] === 'current') {
      const name = decodeURIComponent(rest[3]!)
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
      if (!this.activeScenes.includes(src)) {
        throw new HttpError(404, 'studio_no_scene', `There's no scene called "${src}".`)
      }
      if (!name || this.activeScenes.includes(name)) {
        throw new HttpError(409, 'studio_name_taken', `"${name}" is taken: pick another name.`)
      }
      const idx = this.activeScenes.indexOf(src)
      this.activeScenes.splice(idx + 1, 0, name)
      return { name }
    }
    if (method === 'POST' && rest[2] === 'scenes' && rest[4] === 'move') {
      const src = decodeURIComponent(rest[3]!)
      const to = Number(requireObj(body).to ?? 0)
      const idx = this.activeScenes.indexOf(src)
      if (idx < 0) throw new HttpError(404, 'studio_no_scene', `There's no scene called "${src}".`)
      const [item] = this.activeScenes.splice(idx, 1)
      this.activeScenes.splice(Math.max(0, Math.min(to, this.activeScenes.length)), 0, item!)
      return undefined
    }
    if (method === 'GET' && rest[2] === 'scenes' && rest[4] === 'items') {
      return []
    }
    if (method === 'POST' && rest[2] === 'sources' && rest[4] === 'rename') {
      const from = decodeURIComponent(rest[3]!)
      const to = String(requireObj(body).name ?? '').trim()
      if (!to) throw new HttpError(400, 'invalid', 'name: 1 to 100 letters on one line.')
      if (this.activeScenes.includes(from)) {
        if (from !== to && this.activeScenes.includes(to)) {
          throw new HttpError(409, 'studio_name_taken', `"${to}" is taken: pick another name.`)
        }
        this.activeScenes = this.activeScenes.map((s) => (s === from ? to : s))
        if (this.currentScene === from) this.currentScene = to
        if (this.previewScene === from) this.previewScene = to
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
      return {
        engine: { cpu: 4.2, fps: 60, frame_ms: 4.1, lagged: 0, frames: 3600, memory_mb: 240 },
        canvas: { width: 1920, height: 1080, fps: 60 },
        stream: null,
        record: null,
        scene: this.currentScene,
      }
    }
    if (is('GET', 'studio/engine/history')) return { undo: [], redo: [] }
    if (is('GET', 'studio/engine/audio-care')) return { ducking: null, loudness_lufs: null }
    if (is('GET', 'studio/engine/privacy')) return { hide_notifications: true, hide_apps: [] }
    if (is('GET', 'studio/engine/screens')) return []
    if (is('GET', 'studio/engine/missing-files')) return []
    if (is('GET', 'studio/engine/stream')) return null
    if (is('GET', 'studio/engine/virtualcam/setup')) return { active: false, every_app: false }
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
      const budget: EncodeBudget = {
        budget_mpx: null,
        shared: true,
        why_not_shared: null,
        level: 'unknown',
      }
      return budget
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

  private scenesPayload() {
    const def = this.namedTransitions.find((t) => t.default) ?? this.namedTransitions[0]!
    return {
      current: this.currentScene,
      scenes: this.activeScenes.map((name) => {
        const anyTo = this.transitionMatrix.find((r) => r.from === null && r.to === name)
        const anyToT = anyTo
          ? this.namedTransitions.find((t) => t.name === anyTo.transition)
          : undefined
        const leg = this.legacySceneTransitions.get(name)
        return {
          name,
          items: name === this.currentScene ? 2 : 1,
          current: name === this.currentScene,
          preview: this.previewScene === name,
          transition: anyToT
            ? { kind: anyToT.kind, ms: anyToT.kind === 'cut_transition' ? 0 : anyToT.ms }
            : (leg ?? null),
          ...(anyToT ? { transition_name: anyToT.name } : {}),
        }
      }),
      transition: { kind: def.kind, ms: def.kind === 'cut_transition' ? 0 : def.ms },
      named_transitions: clone(this.namedTransitions),
      transition_matrix: clone(this.transitionMatrix),
      preview: this.previewScene,
      quick: clone(this.quickTransitions),
      studio_options: clone(this.studioModeOptions),
      tbar: clone(this.tbarState),
      black: this.black,
      vertical: null,
      top_layer: null,
    }
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
}
