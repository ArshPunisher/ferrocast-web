import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import {
  MAX_CUSTOM_LINKS,
  MAX_LABEL_CHARS,
  MAX_LINK_CHARS,
  accountUrl,
  describeError,
  resolveLinks,
  validateCreatorLinks,
  type AccountPlatform,
  type CreatorLinks,
  type CustomLink,
  type LinksResponse,
} from '@ferrocast/api'
import { Badge, Button, Field, IconButton, Input, cx, toast } from '@ferrocast/ui'
import { useClient, useResource } from '../lib/hooks'
import { beginLinksLoad, useLive } from '../lib/store'
import { LoadError } from './Panel'
import { Group, Row } from './settings-kit'

const PLATFORM_LABELS: Record<AccountPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  facebook: 'Facebook',
}

const OTHER_FIELDS: {
  key: 'discord' | 'instagram' | 'x' | 'tiktok' | 'website' | 'schedule_text'
  label: string
  placeholder: string
  hint?: string
}[] = [
  { key: 'discord', label: 'Discord', placeholder: 'discord.gg/yourserver' },
  { key: 'instagram', label: 'Instagram', placeholder: '@handle or instagram.com/handle' },
  { key: 'x', label: 'X', placeholder: '@handle or x.com/handle' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@handle or tiktok.com/@handle' },
  { key: 'website', label: 'Website', placeholder: 'https://yoursite.gg' },
  {
    key: 'schedule_text',
    label: 'Next stream fallback',
    placeholder: 'Fridays, 8 PM',
    hint: 'Shown in {next_stream} when no scheduled stream is coming up.',
  },
]

interface DraftLinks {
  twitch: string
  youtube: string
  kick: string
  facebook: string
  discord: string
  instagram: string
  x: string
  tiktok: string
  website: string
  schedule_text: string
  custom: CustomLink[]
}

function emptyDraft(): DraftLinks {
  return {
    twitch: '',
    youtube: '',
    kick: '',
    facebook: '',
    discord: '',
    instagram: '',
    x: '',
    tiktok: '',
    website: '',
    schedule_text: '',
    custom: [],
  }
}

function draftFromResponse(r: LinksResponse | CreatorLinks): DraftLinks {
  return {
    twitch: r.twitch ?? '',
    youtube: r.youtube ?? '',
    kick: r.kick ?? '',
    facebook: r.facebook ?? '',
    discord: r.discord ?? '',
    instagram: r.instagram ?? '',
    x: r.x ?? '',
    tiktok: r.tiktok ?? '',
    website: r.website ?? '',
    schedule_text: r.schedule_text ?? '',
    custom: (r.custom ?? []).map((c) => ({ label: c.label, value: c.value })),
  }
}

function draftToPayload(d: DraftLinks): CreatorLinks {
  return {
    twitch: d.twitch || null,
    youtube: d.youtube || null,
    kick: d.kick || null,
    facebook: d.facebook || null,
    discord: d.discord || null,
    instagram: d.instagram || null,
    x: d.x || null,
    tiktok: d.tiktok || null,
    website: d.website || null,
    schedule_text: d.schedule_text || null,
    custom: d.custom.map((c) => ({ label: c.label, value: c.value })),
  }
}

function parseFieldError(message: string): { field: string; text: string } {
  const idx = message.indexOf(':')
  if (idx > 0 && idx < 32) {
    const prefix = message.slice(0, idx).trim()
    const rest = message.slice(idx + 1).trim()
    if (/^[a-z0-9_.]+$/.test(prefix) && rest) return { field: prefix, text: rest }
  }
  return { field: '_form', text: message }
}

/** Creator social links and schedule fallback card shown in Settings > Accounts. */
export function MyLinksCard() {
  const client = useClient()
  const connectors = useLive((s) => s.connectors)
  const connectorKey = (['twitch', 'youtube', 'kick', 'facebook'] as const)
    .map((p) => {
      const c = connectors?.[p]
      return `${p}:${c?.state ?? ''}:${c?.account?.url ?? ''}:${c?.account?.login ?? ''}`
    })
    .join('|')
  const linksLoadGenRef = useRef(0)
  const res = useResource(
    (c) => {
      linksLoadGenRef.current = beginLinksLoad()
      return c.links()
    },
    [connectorKey],
  )

  const [draft, setDraft] = useState<DraftLinks>(() => emptyDraft())
  const [savedSig, setSavedSig] = useState(() => JSON.stringify(emptyDraft()))
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<{ field: string; text: string } | null>(null)
  const livePreviewId = useId()
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (!res.data) return
    useLive.getState().setLinks(res.data.resolved, linksLoadGenRef.current)
    // Preserve in-flight submission or unsaved local edits if a connector update reloads links.
    if (savingRef.current || dirtyRef.current) return
    const next = draftFromResponse(res.data)
    setDraft(next)
    setSavedSig(JSON.stringify(next))
    setServerError(null)
  }, [res.data])

  const validation = useMemo(() => {
    try {
      const clean = validateCreatorLinks(draftToPayload(draft))
      return { clean, error: null as { field: string; text: string } | null }
    } catch (e) {
      return {
        clean: null,
        error: parseFieldError(e instanceof Error ? e.message : 'Check this link.'),
      }
    }
  }, [draft])

  const accountsForPreview = useMemo(() => {
    const out: { platform: AccountPlatform; name: string; login?: string; url?: string | null }[] =
      []
    for (const p of ['twitch', 'youtube', 'kick', 'facebook'] as const) {
      const c = connectors?.[p]
      if (c?.state !== 'connected' || !c.account) continue
      const derivedUrl =
        c.account.url !== undefined
          ? c.account.url
          : accountUrl(p, c.account.login ?? c.account.name ?? '', '')
      out.push({
        platform: p,
        name: c.account.name,
        ...(c.account.login !== undefined ? { login: c.account.login } : {}),
        ...(derivedUrl !== undefined ? { url: derivedUrl } : {}),
      })
    }
    return out
  }, [connectors])

  const liveResolved = useMemo(() => {
    const source = validation.clean ?? draftToPayload(draft)
    const nextAt = res.data?.resolved.next_stream_at ?? null
    return resolveLinks(source, accountsForPreview, nextAt)
  }, [validation.clean, draft, accountsForPreview, res.data?.resolved.next_stream_at])

  const dirty = JSON.stringify(draft) !== savedSig
  dirtyRef.current = dirty
  const activeError = serverError ?? (dirty ? validation.error : null)
  const fieldError = (name: string) => (activeError?.field === name ? activeError.text : null)

  const updateField = (key: Exclude<keyof DraftLinks, 'custom'>, value: string) => {
    if (saving) return
    setServerError(null)
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const updateCustom = (idx: number, part: 'label' | 'value', val: string) => {
    if (saving) return
    setServerError(null)
    setDraft((prev) => ({
      ...prev,
      custom: prev.custom.map((row, i) => (i === idx ? { ...row, [part]: val } : row)),
    }))
  }

  const removeCustom = (idx: number) => {
    if (saving) return
    setServerError(null)
    setDraft((prev) => ({
      ...prev,
      custom: prev.custom.filter((_, i) => i !== idx),
    }))
  }

  const addCustom = () => {
    if (saving || draft.custom.length >= MAX_CUSTOM_LINKS) return
    setServerError(null)
    setDraft((prev) => ({
      ...prev,
      custom: [...prev.custom, { label: '', value: '' }],
    }))
  }

  const save = async () => {
    if (saving) return
    if (validation.error) {
      setServerError(validation.error)
      return
    }
    savingRef.current = true
    setSaving(true)
    setServerError(null)
    try {
      const saved = await client.saveLinks(draftToPayload(draft))
      res.set(saved)
      const next = draftFromResponse(saved)
      setDraft(next)
      setSavedSig(JSON.stringify(next))
      useLive.getState().setLinks(saved.resolved)
      toast({ key: 'my-links', tone: 'ok', message: 'My links saved. Overlays updated.' })
    } catch (e) {
      const msg = describeError(e).message
      setServerError(parseFieldError(msg))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Group
      id="my-links"
      title="My links"
      note="Used automatically in overlay scenes and rotators. Unfilled links stay hidden on stream."
    >
      {res.error ? (
        <Row>
          <LoadError error={res.error} onRetry={res.reload} />
        </Row>
      ) : (
        <>
          <Row
            label="Connected channels"
            description="Filled from your connected accounts. Leave an override blank to keep the automatic link."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['twitch', 'youtube', 'kick', 'facebook'] as const).map((p) => {
                const c = connectors?.[p]
                const connected = c?.state === 'connected' && c.account
                const autoUrl = connected
                  ? (c.account?.url ??
                    (c.account?.login ? accountUrl(p, c.account.login, '') : null))
                  : null
                const hint = connected
                  ? autoUrl
                    ? `Auto: ${autoUrl}`
                    : p === 'facebook'
                      ? 'Facebook gives no public URL. Enter a link below if you want one.'
                      : 'Connected'
                  : 'Not connected'
                return (
                  <Field
                    key={p}
                    label={`${PLATFORM_LABELS[p]} override`}
                    hint={hint}
                    hintVisible
                    error={fieldError(p)}
                  >
                    {(props) => (
                      <Input
                        {...props}
                        dir="auto"
                        disabled={saving}
                        maxLength={MAX_LINK_CHARS}
                        value={draft[p]}
                        placeholder={autoUrl ?? `Optional ${PLATFORM_LABELS[p]} URL`}
                        onChange={(e) => updateField(p, e.target.value)}
                      />
                    )}
                  </Field>
                )
              })}
            </div>
          </Row>

          <Row
            label="Other links & schedule"
            description="Shown alongside your streaming links when configured."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {OTHER_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  hintVisible={Boolean(f.hint)}
                  error={fieldError(f.key)}
                >
                  {(props) => (
                    <Input
                      {...props}
                      dir="auto"
                      disabled={saving}
                      maxLength={MAX_LINK_CHARS}
                      value={draft[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) => updateField(f.key, e.target.value)}
                    />
                  )}
                </Field>
              ))}
            </div>
          </Row>

          <Row
            label={
              <span className="inline-flex items-center gap-2">
                Custom links
                <Badge tone="neutral">
                  {draft.custom.length} / {MAX_CUSTOM_LINKS}
                </Badge>
              </span>
            }
            description="Merch stores, tip pages, or community servers shown in {socials}."
          >
            <div className="flex flex-col gap-3">
              {draft.custom.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-[10px] border border-line bg-surface-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-end"
                >
                  <Field label={`Label ${idx + 1}`} error={fieldError(`custom.${idx}.label`)}>
                    {(props) => (
                      <Input
                        {...props}
                        dir="auto"
                        disabled={saving}
                        maxLength={MAX_LABEL_CHARS}
                        value={row.label}
                        placeholder="Merch"
                        onChange={(e) => updateCustom(idx, 'label', e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Link or handle" error={fieldError(`custom.${idx}.value`)}>
                    {(props) => (
                      <Input
                        {...props}
                        dir="auto"
                        disabled={saving}
                        maxLength={MAX_LINK_CHARS}
                        value={row.value}
                        placeholder="https://shop.example.gg"
                        onChange={(e) => updateCustom(idx, 'value', e.target.value)}
                      />
                    )}
                  </Field>
                  <div className="flex justify-end sm:pb-0.5">
                    <IconButton
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      label={`Remove custom link ${idx + 1}`}
                      onClick={() => removeCustom(idx)}
                    >
                      <Trash size={16} />
                    </IconButton>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus size={14} weight="bold" />}
                  disabled={saving || draft.custom.length >= MAX_CUSTOM_LINKS}
                  onClick={addCustom}
                >
                  Add custom link
                </Button>
                {fieldError('custom') && (
                  <p role="alert" className="text-[13.5px] font-medium text-danger">
                    {fieldError('custom')}
                  </p>
                )}
              </div>
            </div>
          </Row>

          <Row>
            <div
              aria-labelledby={livePreviewId}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div id={livePreviewId} className="text-[13px] font-semibold text-text-3">
                  Live overlay preview
                </div>
                <p
                  dir="auto"
                  data-testid="my-links-preview"
                  className={cx(
                    'mt-1 truncate text-[14.5px] font-medium',
                    liveResolved.socials.length > 0 ? 'text-text' : 'text-text-3',
                  )}
                >
                  {liveResolved.socials.length > 0
                    ? liveResolved.socials.join(' · ')
                    : 'No links configured yet. Stream overlays hide social slots.'}
                </p>
                {liveResolved.next_stream && (
                  <p dir="auto" className="mt-0.5 truncate text-[13.5px] text-text-2">
                    Next stream: {liveResolved.next_stream}
                  </p>
                )}
                {activeError?.field === '_form' && (
                  <p role="alert" className="mt-1.5 text-[13.5px] font-medium text-danger">
                    {activeError.text}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {dirty && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      setDraft(JSON.parse(savedSig) as DraftLinks)
                      setServerError(null)
                    }}
                  >
                    Reset
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  busy={saving}
                  disabled={!res.data || (!dirty && !serverError) || Boolean(validation.error)}
                  onClick={() => void save()}
                >
                  Save links
                </Button>
              </div>
            </div>
          </Row>
        </>
      )}
    </Group>
  )
}
