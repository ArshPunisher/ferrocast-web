// Community Theme Store in the demo engine (R37): serves a signed-style fixture catalog,
// validates custom alert HTML/CSS through the p2e sandbox rules, tracks installed designs/rules/
// plugins, supports update/uninstall/one-click undo, resolves ferrocast:// confirmation links,
// and lets tests trigger fault/tamper modes cleanly.

import { newAlertDesign, validateDesign } from '../../design'
import { checkCss } from '../../css-check'
import { checkCustomHtml, defaultAlertAnim } from '../../alert'
import {
  parseFerrocastStoreLink,
  type StoreCatalogResponse,
  type StoreCreator,
  type StoreInstalledItem,
  type StoreItem,
  type StoreLinkPreview,
  type StoreMutationResult,
  type StoreUndoResult,
  type StoreUndoSummary,
} from '../../store'
import type { Plugin } from '../../plugins'
import type { AlertRule, Design, Variation } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

export type StoreFault =
  | 'bad_signature'
  | 'oversized'
  | 'invalid_schema'
  | 'unreachable'
  | 'tampered_asset'
  | 'stale'
  | null

export interface DemoStoreHost {
  allDesigns(): Design[]
  addDesign(d: Design): void
  deleteDesign(id: string): void
  activeAlert(): string | null
  setActiveAlert(id: string | null): void
  rules(): AlertRule[]
  saveRule(r: AlertRule): AlertRule
  plugins(): Plugin[]
  upsertPlugin(p: Plugin): void
  removePlugin(id: string): void
  now(): number
  newId(): string
}

interface InternalItem extends StoreItem {
  bundle_designs?: Design[]
  bundle_alert?: { events: ('follow' | 'sub')[]; variation: Variation }
  bundle_plugin?: Omit<Plugin, 'on' | 'problem'>
}

interface UndoSnapshot {
  token: string
  action: 'install' | 'update' | 'uninstall'
  item_id: string
  item_title: string
  created_at: number
  prev_install: StoreInstalledItem | null
  created_design_ids: string[]
  prev_designs: Design[]
  prev_active_alert: string | null
  prev_rules: AlertRule[]
  created_plugin_id: string | null
  prev_plugin: Plugin | null
}

// 1x1 PNG sample bytes for asset verification simulation.
const SAMPLE_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

function newer(a: string, b: string): boolean {
  const n = (v: string) => v.split(/[.-]/).map((x) => Number(x) || 0)
  const [x, y] = [n(a), n(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

function makeAuroraDesigns(): { theme: Design; alert: Design } {
  const baseAlert = newAlertDesign('Aurora Pulse Alerts')
  const follow = 'events' in baseAlert.content ? baseAlert.content.events.follow : undefined
  if (follow?.variations[0]) {
    follow.variations[0].look.colors = {
      text: '#eef2f7',
      highlight: '#33d4ff',
      plate: '#0f141c',
      accent: '#33d4ff',
      outline: '#07080a',
    }
  }
  const alert: Design = {
    ...baseAlert,
    id: 'store-tpl-aurora-alert',
    name: 'Aurora Pulse Alerts',
    description: 'Arc cyan glow alert companion from the Aurora Pulse pack.',
    tags: { style: 'tech', motion: 'smooth' },
    origin: { type: 'import', from: 'store:aurora-pulse' },
  }
  const theme: Design = {
    schema: 1,
    id: 'store-tpl-aurora-theme',
    name: 'Aurora Pulse',
    description: 'Low-overhead cyan telemetry theme with in-game frame and BRB slate.',
    tags: { style: 'tech', motion: 'smooth' },
    pro: false,
    built_in: false,
    branded: false,
    origin: { type: 'import', from: 'store:aurora-pulse' },
    kind: 'theme',
    content: {
      alert_design: alert.id,
      scenes: [
        {
          key: 'in_game',
          name: 'In game',
          width: 1920,
          height: 1080,
          background: '#0a0d12',
          layers: [
            {
              id: 'aurora-bar',
              kind: 'layer',
              x: 40,
              y: 36,
              w: 440,
              h: 68,
              config: {
                type: 'shape',
                shape: 'rect',
                fill: '#101622',
                stroke: '#33d4ff',
                stroke_width: 2,
              },
            },
            {
              id: 'aurora-label',
              kind: 'label',
              x: 56,
              y: 44,
              w: 408,
              h: 52,
              config: { source: 'latest_follower', template: 'Latest: {value}', theme: 'molten' },
            },
          ],
        },
        {
          key: 'brb',
          name: 'Be right back',
          width: 1920,
          height: 1080,
          background: '#0a0d12',
          layers: [
            {
              id: 'aurora-brb-title',
              kind: 'layer',
              x: 200,
              y: 440,
              w: 1520,
              h: 160,
              config: {
                type: 'text',
                text: 'Be right back',
                size: 112,
                weight: 800,
                color: '#eef2f7',
                align: 'center',
              },
            },
            {
              id: 'aurora-events',
              kind: 'events',
              x: 1420,
              y: 60,
              w: 440,
              h: 320,
              config: { kinds: ['follow', 'tip'], max_items: 5, theme: 'molten' },
            },
          ],
        },
      ],
    },
    created_at: 1793900000000,
    updated_at: 1793900000000,
  }
  return { theme, alert }
}

function makeMoltenFrameDesign(): Design {
  return {
    schema: 1,
    id: 'store-tpl-molten-frame',
    name: 'Molten Studio Frame',
    description: 'High-contrast forged amber overlay bundle for talk shows and variety streams.',
    tags: { style: 'bold', motion: 'lively' },
    pro: false,
    built_in: false,
    branded: false,
    origin: { type: 'import', from: 'store:molten-studio-frame' },
    kind: 'theme',
    content: {
      alert_design: null,
      scenes: [
        {
          key: 'just_chatting',
          name: 'Just chatting',
          width: 1920,
          height: 1080,
          background: '#0e0f12',
          layers: [
            {
              id: 'mf-cam',
              kind: 'layer',
              x: 80,
              y: 80,
              w: 1180,
              h: 664,
              config: {
                type: 'shape',
                shape: 'rect',
                fill: '#15181e',
                stroke: '#ffa424',
                stroke_width: 3,
              },
            },
            {
              id: 'mf-chat',
              kind: 'chat',
              x: 1300,
              y: 80,
              w: 540,
              h: 720,
              config: {
                platforms: ['twitch', 'youtube'],
                max_messages: 8,
                fade_after_s: 30,
                show_badges: true,
                show_platform: true,
                hide_commands: false,
                hide_bots: true,
                font_size: 16,
                theme: 'molten',
              },
            },
          ],
        },
      ],
    },
    created_at: 1793910000000,
    updated_at: 1793910000000,
  }
}

function makeGoalWidgetDesign(): Design {
  return {
    schema: 1,
    id: 'store-tpl-foundry-goal',
    name: 'Foundry Segmented Goal',
    description: 'Clean notched milestone meter for follower and sub drives.',
    tags: { style: 'bold', motion: 'smooth' },
    pro: false,
    built_in: false,
    branded: false,
    origin: { type: 'import', from: 'store:foundry-goal-widget' },
    kind: 'widget',
    content: {
      widget: 'goal',
      w: 640,
      h: 96,
      config: { goal_id: '', theme: 'molten' },
      style: { variant: 'segments', accent: '#ffa424', track: '#16191e', radius: 12 },
    },
    created_at: 1793920000000,
    updated_at: 1793920000000,
  }
}

function makeSlateSceneDesign(versionLabel: string): Design {
  return {
    schema: 1,
    id: 'store-tpl-intermission-slate',
    name: `Clean Intermission Slate (${versionLabel})`,
    description: 'Lightweight monochrome intermission canvas engineered for zero frame drop.',
    tags: { style: 'minimal', motion: 'still' },
    pro: false,
    built_in: false,
    branded: false,
    origin: { type: 'import', from: 'store:intermission-slate' },
    kind: 'scene',
    content: {
      key: 'brb',
      name: 'Intermission',
      width: 1920,
      height: 1080,
      background: '#0b0d10',
      layers: [
        {
          id: 'slate-title',
          kind: 'layer',
          x: 200,
          y: 450,
          w: 1520,
          h: 140,
          config: {
            type: 'text',
            text: 'Taking a quick breather',
            size: 84,
            weight: 700,
            color: '#f2f4f8',
            align: 'center',
          },
        },
      ],
    },
    created_at: 1793930000000,
    updated_at: 1793930000000,
  }
}

const CUSTOM_ALERT_HTML = `<div class="arcade-card">
  <span class="arcade-pill">{badge_text}</span>
  <h2 class="arcade-title">{name}</h2>
  <p class="arcade-msg">{message}</p>
</div>`

const CUSTOM_ALERT_CSS = `.arcade-card {
  padding: 20px 28px;
  border-radius: 14px;
  background: rgba(13, 16, 23, 0.94);
  border: 2px solid var(--field-border_tint, #ffa424);
  color: #f3f5f8;
  text-align: center;
  font-family: system-ui, sans-serif;
}
.arcade-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--field-border_tint, #ffa424);
  color: #0d1017;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.arcade-title { margin: 10px 0 4px; font-size: 28px; }
.arcade-msg { margin: 0; opacity: 0.86; font-size: 16px; }`

const CREATORS: StoreCreator[] = [
  {
    id: 'mira-atelier',
    name: 'Mira Atelier',
    handle: '@miraatelier',
    bio: 'Motion designer building crisp, low-overhead sci-fi overlays and typography-first packs.',
    verified: true,
    links: {
      website: 'https://ferrocast.clearcraftlabs.com/compare/',
      github: 'https://github.com/ArshPunisher',
    },
  },
  {
    id: 'kaito-lab',
    name: 'Kaito Lab',
    handle: '@kaitolab',
    bio: 'Interactive alert smiths crafting sandboxed HTML alert templates and progress widgets.',
    verified: true,
    links: {
      twitch: 'https://twitch.tv/ferrocast',
    },
  },
  {
    id: 'vela-forge',
    name: 'Vela Forge',
    handle: '@velaforge',
    bio: 'Studio broadcast frames and hardware-friendly WGSL shaders tested at 60 fps.',
    verified: false,
    links: {
      youtube: 'https://youtube.com/@ferrocast',
    },
  },
]

function seedCatalog(): InternalItem[] {
  const aurora = makeAuroraDesigns()
  const moltenFrame = makeMoltenFrameDesign()
  const goal = makeGoalWidgetDesign()
  const slate = makeSlateSceneDesign('1.1.0')
  const sha = (tag: string) =>
    tag
      .split('')
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0xffffff, 0xabc123)
      .toString(16)
      .padStart(64, 'a')
      .slice(0, 64)

  return [
    {
      id: 'aurora-pulse',
      kind: 'theme',
      title: 'Aurora Pulse',
      summary: 'Dark obsidian theme with cyan telemetry bars, BRB ticker, and matched alert look.',
      version: '1.2.0',
      creator_id: 'mira-atelier',
      tags: ['scifi', 'dark', 'minimal'],
      license: 'CC-BY-4.0',
      sandboxed: false,
      plugin_kind: null,
      plugin_actions: [],
      alert_events: [],
      featured: true,
      created_at: 1793900000000,
      updated_at: 1794000000000,
      package: {
        format: 'ferrodesign',
        url: 'packages/aurora-pulse-1.2.0.ferrodesign',
        sha256: sha('aurora-pulse'),
        size: 48_240,
      },
      assets: [
        {
          name: 'preview.png',
          role: 'preview',
          url: 'assets/aurora-preview.png',
          sha256: sha('aurora-preview'),
          size: SAMPLE_PNG.byteLength,
          mime: 'image/png',
        },
      ],
      stats: { installs: 2480, rating_avg: 4.9, rating_count: 142 },
      preview: {
        palette: ['#0a0d12', '#33d4ff', '#ffa424'],
        style: 'tech',
        motion: 'smooth',
        headline: 'Aurora Pulse',
        subline: '2 scenes + alert design · pure data',
        layers_hint: 5,
        design: aurora.theme,
      },
      installed_version: null,
      update_available: false,
      bundle_designs: [aurora.alert, aurora.theme],
    },
    {
      id: 'molten-studio-frame',
      kind: 'theme',
      title: 'Molten Studio Frame',
      summary: 'Warm industrial camera & chat frame built for Just Chatting and IRL podcasts.',
      version: '1.0.0',
      creator_id: 'vela-forge',
      tags: ['bold', 'talkshow', 'dark'],
      license: 'CC-BY-4.0',
      sandboxed: false,
      plugin_kind: null,
      plugin_actions: [],
      alert_events: [],
      featured: true,
      created_at: 1793910000000,
      updated_at: 1793950000000,
      package: {
        format: 'ferrodesign',
        url: 'packages/molten-studio-1.0.0.ferrodesign',
        sha256: sha('molten-studio-frame'),
        size: 31_400,
      },
      assets: [],
      stats: { installs: 1190, rating_avg: 4.8, rating_count: 64 },
      preview: {
        palette: ['#0e0f12', '#ffa424', '#eef0f4'],
        style: 'bold',
        motion: 'lively',
        headline: 'Molten Studio Frame',
        subline: 'Just Chatting camera + chat widget',
        layers_hint: 4,
        design: moltenFrame,
      },
      installed_version: null,
      update_available: false,
      bundle_designs: [moltenFrame],
    },
    {
      id: 'arcade-ticker-alert',
      kind: 'alert',
      title: 'Arcade Ticker Alert',
      summary: 'Custom HTML/CSS follower banner strictly sandboxed in Ferrocast’s p2e frame.',
      version: '1.0.0',
      creator_id: 'kaito-lab',
      tags: ['retro', 'custom-html', 'sandboxed'],
      license: 'MIT',
      sandboxed: true,
      plugin_kind: null,
      plugin_actions: [],
      alert_events: ['follow'],
      featured: true,
      created_at: 1793920000000,
      updated_at: 1793960000000,
      package: {
        format: 'ferroalert',
        url: 'packages/arcade-ticker-1.0.0.ferroalert',
        sha256: sha('arcade-ticker'),
        size: 4_120,
      },
      assets: [],
      stats: { installs: 935, rating_avg: 4.7, rating_count: 58 },
      preview: {
        palette: ['#0d1017', '#ffa424', '#33d4ff'],
        style: 'retro',
        motion: 'lively',
        headline: '{name} joined the squad!',
        subline: 'Sandboxed p2e HTML + 2 editable fields',
        layers_hint: 3,
        custom_alert: {
          html: CUSTOM_ALERT_HTML,
          css: CUSTOM_ALERT_CSS,
          fields: [
            { key: 'badge_text', label: 'Badge label', type: 'text', default: 'NEW CHALLENGER' },
            { key: 'border_tint', label: 'Border colour', type: 'color', default: '#ffa424' },
          ],
          field_values: { badge_text: 'NEW CHALLENGER', border_tint: '#ffa424' },
        },
      },
      installed_version: null,
      update_available: false,
      bundle_alert: {
        events: ['follow'],
        variation: {
          id: 'arcade-default',
          name: 'Arcade Default',
          condition: null,
          priority: 0,
          weight: 1,
          title: '{name} joined the squad!',
          body: '{message}',
          image: null,
          sound: null,
          volume: 70,
          duration_ms: 5000,
          tts: false,
          layout: 'stack',
          css: CUSTOM_ALERT_CSS,
          anim: defaultAlertAnim(),
          custom_enabled: true,
          html: CUSTOM_ALERT_HTML,
          fields: [
            { key: 'badge_text', label: 'Badge label', type: 'text', default: 'NEW CHALLENGER' },
            { key: 'border_tint', label: 'Border colour', type: 'color', default: '#ffa424' },
          ],
          field_values: { badge_text: 'NEW CHALLENGER', border_tint: '#ffa424' },
        },
      },
    },
    {
      id: 'foundry-goal-widget',
      kind: 'widget',
      title: 'Foundry Segmented Goal',
      summary: 'High-legibility segmented milestone bar for subscriber and donation goals.',
      version: '1.0.0',
      creator_id: 'kaito-lab',
      tags: ['goal', 'widget', 'clean'],
      license: 'CC0-1.0',
      sandboxed: false,
      plugin_kind: null,
      plugin_actions: [],
      alert_events: [],
      featured: false,
      created_at: 1793925000000,
      updated_at: 1793925000000,
      package: {
        format: 'ferrodesign',
        url: 'packages/foundry-goal-1.0.0.ferrodesign',
        sha256: sha('foundry-goal'),
        size: 12_800,
      },
      assets: [],
      stats: { installs: 1540, rating_avg: 4.8, rating_count: 91 },
      preview: {
        palette: ['#16191e', '#ffa424', '#eef0f4'],
        style: 'bold',
        motion: 'smooth',
        headline: 'Subscriber Drive · 34 / 50',
        subline: '640×96 widget design',
        layers_hint: 2,
        design: goal,
      },
      installed_version: null,
      update_available: false,
      bundle_designs: [goal],
    },
    {
      id: 'intermission-slate',
      kind: 'overlay',
      title: 'Clean Intermission Slate',
      summary: 'Minimal 1080p BRB scene engineered for zero GPU overhead between matches.',
      version: '1.1.0',
      creator_id: 'mira-atelier',
      tags: ['brb', 'minimal', 'lightweight'],
      license: 'CC-BY-4.0',
      sandboxed: false,
      plugin_kind: null,
      plugin_actions: [],
      alert_events: [],
      featured: false,
      created_at: 1793880000000,
      updated_at: 1794010000000,
      package: {
        format: 'ferrodesign',
        url: 'packages/intermission-slate-1.1.0.ferrodesign',
        sha256: sha('intermission-slate-1.1.0'),
        size: 9_600,
      },
      assets: [],
      stats: { installs: 1875, rating_avg: 4.6, rating_count: 47 },
      preview: {
        palette: ['#0b0d10', '#33d4ff', '#f2f4f8'],
        style: 'minimal',
        motion: 'still',
        headline: 'Taking a quick breather',
        subline: '1920×1080 single-layer scene',
        layers_hint: 1,
        design: slate,
      },
      installed_version: null,
      update_available: false,
      bundle_designs: [slate],
    },
    {
      id: 'soft-dimmer-shader',
      kind: 'plugin',
      title: 'Soft Studio Dimmer',
      summary: 'Safe WGSL vignette & dim filter validated by Ferrocast’s GPU shader checker.',
      version: '1.0.0',
      creator_id: 'vela-forge',
      tags: ['shader', 'wgsl', 'effect'],
      license: 'GPL-3.0-only',
      sandboxed: true,
      plugin_kind: 'effect',
      plugin_actions: [],
      alert_events: [],
      featured: false,
      created_at: 1793940000000,
      updated_at: 1793940000000,
      package: {
        format: 'ferroplugin',
        url: 'packages/soft-dimmer-1.0.0.zip',
        sha256: sha('soft-dimmer'),
        size: 1_840,
      },
      assets: [],
      stats: { installs: 420, rating_avg: 4.5, rating_count: 22 },
      preview: {
        palette: ['#101216', '#ff5aa5', '#33d4ff'],
        style: 'minimal',
        motion: 'still',
        headline: 'WGSL Shader Effect',
        subline: 'Sandboxed GPU effect · 0 external permissions',
        layers_hint: 1,
      },
      installed_version: null,
      update_available: false,
      bundle_plugin: {
        id: 'com.velaforge.softdimmer',
        name: 'Soft Studio Dimmer',
        version: '1.0.0',
        author: 'Vela Forge',
        description: 'Softens bright game captures cleanly during menus and chat breaks.',
        kind: 'effect',
        actions: [],
      },
    },
  ]
}

export class DemoStore implements DemoFeature {
  private readonly host: DemoStoreHost
  private items: InternalItem[] = seedCatalog()
  private installs = new Map<string, StoreInstalledItem>()
  private undos: UndoSnapshot[] = []
  fault: StoreFault = null

  constructor(host: DemoStoreHost) {
    this.host = host
  }

  /** Test helper: bumps a catalog item's version so installed copies see an available update. */
  bumpVersion(id: string, version: string): void {
    const it = this.items.find((i) => i.id === id)
    if (!it) return
    it.version = version
    it.updated_at = this.host.now()
  }

  private lastUndo(): StoreUndoSummary | null {
    const u = this.undos[0]
    if (!u) return null
    return {
      token: u.token,
      action: u.action,
      item_id: u.item_id,
      item_title: u.item_title,
      created_at: u.created_at,
    }
  }

  private toPublicItem(it: InternalItem): StoreItem {
    const { bundle_designs: _d, bundle_alert: _a, bundle_plugin: _p, ...rest } = it
    const inst = this.installs.get(it.id)
    return {
      ...clone(rest),
      installed_version: inst?.version ?? null,
      update_available: inst ? newer(it.version, inst.version) : false,
    }
  }

  private installedList(): StoreInstalledItem[] {
    const undo = this.lastUndo()
    return [...this.installs.values()]
      .sort((a, b) => b.updated_at - a.updated_at)
      .map((rec) => {
        const latest = this.items.find((i) => i.id === rec.item_id)?.version ?? null
        return {
          ...clone(rec),
          latest_version: latest,
          update_available: latest !== null && newer(latest, rec.version),
          can_undo: undo?.item_id === rec.item_id,
          undo_token: undo?.item_id === rec.item_id ? undo.token : null,
        }
      })
  }

  private checkCatalogFault(): void {
    switch (this.fault) {
      case 'bad_signature':
        throw new HttpError(
          502,
          'store_bad_signature',
          'The Community Store catalog signature isn’t valid, so it wasn’t opened.',
          'Installed items stay safe and working. Try refreshing later.',
        )
      case 'oversized':
        throw new HttpError(
          413,
          'store_catalog_too_large',
          'The Community Store catalog exceeds the 2 MB size cap.',
          'Installed items still work cleanly.',
        )
      case 'invalid_schema':
        throw new HttpError(
          422,
          'store_catalog_invalid',
          'The Community Store catalog schema isn’t valid.',
          'Installed items still work cleanly.',
        )
      case 'unreachable':
        throw new HttpError(
          502,
          'store_unreachable',
          'The catalog server didn’t answer.',
          'Check your connection and try again; installed items still work.',
        )
      default:
        break
    }
  }

  catalog(): StoreCatalogResponse {
    this.checkCatalogFault()
    const now = this.host.now()
    const stale = this.fault === 'stale'
    return {
      version: 1,
      generated_at: stale ? now - 10 * 24 * 60 * 60 * 1000 : now - 60_000,
      fetched_at: now,
      stale,
      creators: clone(CREATORS),
      items: this.items.map((it) => this.toPublicItem(it)),
      installed: this.installedList(),
      last_undo: this.lastUndo(),
      warnings: stale
        ? ['Catalog timestamp is older than 7 days; showing last verified snapshot.']
        : [],
    }
  }

  private installOrUpdate(id: string, mode: 'install' | 'update'): StoreMutationResult {
    this.checkCatalogFault()
    if (this.fault === 'tampered_asset') {
      throw new HttpError(
        502,
        'store_asset_tampered',
        'That package failed the SHA-256 fingerprint check, so nothing was installed.',
        'The catalog file or asset changed after signing.',
      )
    }
    const item = this.items.find((i) => i.id === id)
    if (!item) {
      throw new HttpError(
        404,
        'store_item_not_found',
        `The catalog has no item called "${id}".`,
        'Refresh the Store.',
      )
    }
    const existing = this.installs.get(id) ?? null
    if (mode === 'install' && existing) {
      throw new HttpError(
        409,
        'conflict',
        'This store item is already installed.',
        'Use Update when a newer version ships.',
      )
    }
    if (mode === 'update') {
      if (!existing) {
        throw new HttpError(
          404,
          'store_item_not_found',
          'That store item isn’t installed.',
          'Install it first.',
        )
      }
      if (!newer(item.version, existing.version)) {
        throw new HttpError(
          409,
          'store_up_to_date',
          `${item.title} is already at the latest version.`,
        )
      }
    }

    const prev_designs = existing
      ? this.host
          .allDesigns()
          .filter((d) => existing.design_ids.includes(d.id))
          .map(clone)
      : []
    const prev_active_alert = this.host.activeAlert()
    const prev_rules = existing
      ? this.host
          .rules()
          .filter((r) => existing.rule_ids.includes(r.id))
          .map(clone)
      : []
    const prev_plugin = existing?.plugin_id
      ? clone(this.host.plugins().find((p) => p.id === existing.plugin_id) ?? null)
      : null

    const createdDesigns: Design[] = []
    const ruleIds: string[] = []
    let pluginId: string | null = null

    if (item.package.format === 'ferrodesign' && item.bundle_designs) {
      const idMap = new Map<string, string>()
      for (const src of item.bundle_designs) idMap.set(src.id, this.host.newId())
      for (const src of item.bundle_designs) {
        const next: Design = clone(src)
        next.id = idMap.get(src.id) ?? this.host.newId()
        next.built_in = false
        next.branded = false
        next.pro = false
        next.origin = { type: 'import', from: `store:${item.id}` }
        if (
          next.kind === 'theme' &&
          next.content.alert_design &&
          idMap.has(next.content.alert_design)
        ) {
          next.content.alert_design = idMap.get(next.content.alert_design) ?? null
        }
        const err = validateDesign(next)
        if (err) throw new HttpError(422, 'store_unsafe_package', err)
        this.host.addDesign(next)
        createdDesigns.push(clone(next))
      }
      if (mode === 'update' && existing) {
        for (const oldId of existing.design_ids) {
          if (this.host.activeAlert() === oldId) this.host.setActiveAlert(null)
          this.host.deleteDesign(oldId)
        }
      }
    } else if (item.package.format === 'ferroalert' && item.bundle_alert) {
      const v = clone(item.bundle_alert.variation)
      if (v.html) {
        const htmlErr = checkCustomHtml(v.name, v.html, new Set((v.fields ?? []).map((f) => f.key)))
        if (htmlErr) throw new HttpError(422, 'store_unsafe_package', htmlErr)
      }
      if (v.css) {
        const cssErr = checkCss(`variation '${v.name}'.css`, v.css)
        if (cssErr) throw new HttpError(422, 'store_unsafe_package', cssErr)
      }
      const prefix = `store:${item.id}:`
      const eventMap: Record<'follow' | 'sub', string> = { follow: 'follow', sub: 'subscription' }
      for (const ev of item.bundle_alert.events) {
        const kind = eventMap[ev]
        const rule = this.host.rules().find((r) => r.kinds.includes(kind))
        if (!rule) continue
        if (!prev_rules.some((p) => p.id === rule.id)) prev_rules.push(clone(rule))
        const nextRule = clone(rule)
        nextRule.variations = nextRule.variations.filter(
          (x) => !x.id.startsWith(prefix) && x.condition !== null,
        )
        nextRule.variations.push({ ...v, id: `${prefix}${v.id}` })
        this.host.saveRule(nextRule)
        ruleIds.push(nextRule.id)
      }
    } else if (item.package.format === 'ferroplugin' && item.bundle_plugin) {
      const p: Plugin = { ...clone(item.bundle_plugin), on: true, problem: null }
      this.host.upsertPlugin(p)
      pluginId = p.id
    }

    const creator = CREATORS.find((c) => c.id === item.creator_id)
    const now = this.host.now()
    const rec: StoreInstalledItem = {
      item_id: item.id,
      kind: item.kind,
      format: item.package.format,
      title: item.title,
      version: item.version,
      creator_id: item.creator_id,
      creator_name: creator?.name ?? item.creator_id,
      installed_at: existing?.installed_at ?? now,
      updated_at: now,
      package_sha256: item.package.sha256,
      design_ids: createdDesigns.map((d) => d.id),
      rule_ids: ruleIds,
      plugin_id: pluginId,
      can_undo: true,
      undo_token: null,
      latest_version: item.version,
      update_available: false,
    }
    this.installs.set(item.id, rec)

    const token = `su_${this.host.newId()}`
    const snap: UndoSnapshot = {
      token,
      action: mode,
      item_id: item.id,
      item_title: item.title,
      created_at: now,
      prev_install: existing ? clone(existing) : null,
      created_design_ids: createdDesigns.map((d) => d.id),
      prev_designs,
      prev_active_alert,
      prev_rules,
      created_plugin_id: pluginId,
      prev_plugin,
    }
    this.undos.unshift(snap)
    if (this.undos.length > 20) this.undos.length = 20

    const summary: StoreUndoSummary = {
      token,
      action: mode,
      item_id: item.id,
      item_title: item.title,
      created_at: now,
    }
    return {
      action: mode,
      installed: this.installedList().find((r) => r.item_id === item.id) ?? null,
      designs: createdDesigns,
      undo: summary,
    }
  }

  private uninstall(id: string): StoreMutationResult {
    const existing = this.installs.get(id)
    if (!existing) {
      throw new HttpError(
        404,
        'store_item_not_found',
        'That store item isn’t installed.',
        'Reload Installed items.',
      )
    }
    const prev_active_alert = this.host.activeAlert()
    const prev_designs = this.host
      .allDesigns()
      .filter((d) => existing.design_ids.includes(d.id))
      .map(clone)
    for (const did of existing.design_ids) {
      if (this.host.activeAlert() === did) this.host.setActiveAlert(null)
      this.host.deleteDesign(did)
    }
    const prev_rules: AlertRule[] = []
    if (existing.rule_ids.length > 0) {
      const prefix = `store:${existing.item_id}:`
      for (const r of this.host.rules()) {
        if (!existing.rule_ids.includes(r.id)) continue
        prev_rules.push(clone(r))
        const next = clone(r)
        next.variations = next.variations.filter((v) => !v.id.startsWith(prefix))
        if (!next.variations.some((v) => v.condition === null)) {
          next.variations.unshift({
            id: `def_${this.host.newId()}`,
            name: 'Default',
            condition: null,
            priority: 0,
            weight: 1,
            title: '{name} followed',
            body: '{message}',
            image: null,
            sound: null,
            volume: 70,
            duration_ms: 5000,
            tts: false,
            layout: 'stack',
            css: '',
            anim: defaultAlertAnim(),
            custom_enabled: false,
            html: '',
            fields: [],
            field_values: {},
          })
        }
        this.host.saveRule(next)
      }
    }
    const prev_plugin = existing.plugin_id
      ? clone(this.host.plugins().find((p) => p.id === existing.plugin_id) ?? null)
      : null
    if (existing.plugin_id) this.host.removePlugin(existing.plugin_id)

    this.installs.delete(id)
    const now = this.host.now()
    const token = `su_${this.host.newId()}`
    const snap: UndoSnapshot = {
      token,
      action: 'uninstall',
      item_id: existing.item_id,
      item_title: existing.title,
      created_at: now,
      prev_install: clone(existing),
      created_design_ids: [],
      prev_designs,
      prev_active_alert,
      prev_rules,
      created_plugin_id: null,
      prev_plugin,
    }
    this.undos.unshift(snap)
    if (this.undos.length > 20) this.undos.length = 20

    return {
      action: 'uninstall',
      installed: null,
      designs: [],
      undo: {
        token,
        action: 'uninstall',
        item_id: existing.item_id,
        item_title: existing.title,
        created_at: now,
      },
    }
  }

  private undo(token?: string): StoreUndoResult {
    const idx = token ? this.undos.findIndex((u) => u.token === token) : 0
    const snap = idx >= 0 ? this.undos[idx] : undefined
    if (!snap) {
      throw new HttpError(404, 'not_found', 'That undo action is no longer available.')
    }
    this.undos.splice(idx, 1)
    for (const did of snap.created_design_ids) {
      if (this.host.activeAlert() === did) this.host.setActiveAlert(null)
      try {
        this.host.deleteDesign(did)
      } catch {
        // Ignore if user already deleted it manually.
      }
    }
    for (const d of snap.prev_designs) {
      this.host.addDesign(clone(d))
    }
    if (snap.prev_active_alert !== null) {
      this.host.setActiveAlert(snap.prev_active_alert)
    }
    for (const r of snap.prev_rules) {
      this.host.saveRule(clone(r))
    }
    if (snap.created_plugin_id && snap.prev_plugin?.id !== snap.created_plugin_id) {
      this.host.removePlugin(snap.created_plugin_id)
    }
    if (snap.prev_plugin) {
      this.host.upsertPlugin(clone(snap.prev_plugin))
    }
    if (snap.prev_install) {
      this.installs.set(snap.item_id, clone(snap.prev_install))
    } else {
      this.installs.delete(snap.item_id)
    }
    return {
      reverted_action: snap.action,
      item_id: snap.item_id,
      item_title: snap.item_title,
      installed: this.installedList(),
    }
  }

  private resolveLink(uri: string): StoreLinkPreview {
    const parsed = parseFerrocastStoreLink(uri)
    if (!parsed) {
      throw new HttpError(
        400,
        'invalid',
        'uri: expected ferrocast://store/install/<id> or ferrocast://store/item/<id>.',
      )
    }
    const cat = this.catalog()
    const item = cat.items.find((i) => i.id === parsed.id)
    if (!item) {
      throw new HttpError(
        404,
        'store_item_not_found',
        `Catalog doesn’t have an item called "${parsed.id}".`,
      )
    }
    const creator = cat.creators.find((c) => c.id === item.creator_id)
    if (!creator) {
      throw new HttpError(404, 'not_found', 'Creator not found.')
    }
    const installed = cat.installed.find((r) => r.item_id === item.id) ?? null
    const safety_notes = [
      'Catalog signature verified (minisign).',
      `Package size ${Math.max(1, Math.round(item.package.size / 1024))} KB · SHA-256 checked on install.`,
      item.package.format === 'ferrodesign'
        ? 'Pure data (.ferrodesign): contains no executable scripts or remote code.'
        : item.package.format === 'ferroalert'
          ? 'Custom alert HTML/CSS verified by p2e sandbox rules (isolated iframe, no scripts).'
          : 'Sandboxed plugin verified (WGSL shader / bounded WASM / CSP no-network panel).',
    ]
    return {
      uri,
      action: parsed.action,
      item,
      creator,
      installed,
      update_available: item.update_available,
      safety_notes,
      requires_confirmation: true,
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'store') return NOT_MINE
    const [, sub, a, b] = seg
    const is = (m: string, n: number) => method === m && seg.length === n
    if (sub === 'catalog' && is('GET', 2)) return this.catalog()
    if (sub === 'installed' && is('GET', 2)) {
      return { installed: this.installedList(), last_undo: this.lastUndo() }
    }
    if (sub === 'assets' && is('GET', 4) && a && b) {
      if (this.fault === 'tampered_asset') {
        throw new HttpError(502, 'store_asset_tampered', 'Asset SHA-256 check failed.')
      }
      return new Blob([SAMPLE_PNG], { type: 'image/png' })
    }
    if (sub === 'install' && is('POST', 2)) {
      const o = requireObj(body)
      if (typeof o.id !== 'string' || !o.id)
        throw new HttpError(400, 'invalid', 'id: expected store item id.')
      return this.installOrUpdate(o.id, 'install')
    }
    if (sub === 'update' && is('POST', 2)) {
      const o = requireObj(body)
      if (typeof o.id !== 'string' || !o.id)
        throw new HttpError(400, 'invalid', 'id: expected store item id.')
      return this.installOrUpdate(o.id, 'update')
    }
    if (sub === 'uninstall' && is('POST', 2)) {
      const o = requireObj(body)
      if (typeof o.id !== 'string' || !o.id)
        throw new HttpError(400, 'invalid', 'id: expected store item id.')
      return this.uninstall(o.id)
    }
    if (sub === 'undo' && is('POST', 2)) {
      const o = body && typeof body === 'object' ? (body as { token?: unknown }) : {}
      return this.undo(typeof o.token === 'string' ? o.token : undefined)
    }
    if (sub === 'resolve-link' && is('POST', 2)) {
      const o = requireObj(body)
      if (typeof o.uri !== 'string')
        throw new HttpError(400, 'invalid', 'uri: expected ferrocast:// link.')
      return this.resolveLink(o.uri)
    }
    return NOT_MINE
  }
}
