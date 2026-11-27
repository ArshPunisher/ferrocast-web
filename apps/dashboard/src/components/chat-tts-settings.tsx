import { useEffect, useState } from 'react'
import {
  CHAT_TTS_LIMITS,
  DEFAULT_CHAT_TTS,
  validateChatTts,
  type ChatTtsConfig,
  type ChatTtsMode,
} from '@ferrocast/api'
import { Field, Input, Segmented } from '@ferrocast/ui'
import { Group, Row, SwitchRow } from './settings-kit'

export interface ChatTtsGroupProps {
  value: ChatTtsConfig | undefined
  hasAlertsOverlay?: boolean | undefined
  onSave: (next: ChatTtsConfig) => void
}

const MODE_OPTIONS: { value: ChatTtsMode; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'subs_mods', label: 'Subs & mods' },
  { value: 'command', label: 'Command' },
]

export function ChatTtsGroup({ value, hasAlertsOverlay = true, onSave }: ChatTtsGroupProps) {
  const saved = value ?? DEFAULT_CHAT_TTS
  const [draft, setDraft] = useState<ChatTtsConfig>(saved)
  const [errors, setErrors] = useState<Partial<Record<keyof ChatTtsConfig, string>>>({})

  useEffect(() => {
    setDraft(value ?? DEFAULT_CHAT_TTS)
    setErrors({})
  }, [value])

  const commit = (candidate: ChatTtsConfig) => {
    const next: ChatTtsConfig = { ...candidate, command: candidate.command.trim() }
    const found = validateChatTts(next)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setDraft(next)
    onSave(next)
  }

  const updateNum = (
    key: 'cooldown_s' | 'global_cooldown_s' | 'queue_limit' | 'max_chars',
    raw: string,
  ) => {
    const parsed = raw.trim() === '' ? Number.NaN : Number(raw)
    const next = { ...draft, [key]: parsed }
    setDraft(next)
    setErrors((prev) => {
      const copy = { ...prev }
      delete copy[key]
      return copy
    })
  }

  return (
    <Group title="Chat messages">
      <SwitchRow
        checked={draft.enabled}
        onChange={(enabled) => {
          if (!enabled) {
            const next = { ...saved, enabled: false }
            setDraft(next)
            setErrors({})
            onSave(next)
            return
          }
          commit({ ...draft, enabled })
        }}
        label="Read chat messages"
        description="Read live chat aloud using this computer’s voice."
      />
      {draft.enabled && (
        <>
          {!hasAlertsOverlay && (
            <Row>
              <p className="text-[13.5px] font-medium text-warn">
                Needs an Alerts overlay in your scene to play on stream.{' '}
                <a className="underline hover:text-text" href="#/overlays">
                  Open Overlays
                </a>
              </p>
            </Row>
          )}
          <Row>
            <div className="flex flex-col items-start gap-2">
              <span className="text-[14.5px] font-semibold text-text">Who can trigger it</span>
              <Segmented<ChatTtsMode>
                label="Who can trigger it"
                size="sm"
                className="flex-wrap"
                value={draft.mode}
                options={MODE_OPTIONS}
                onChange={(mode) => commit({ ...draft, mode })}
              />
            </div>
          </Row>
          {draft.mode === 'command' && (
            <Row>
              <Field
                label="Command"
                hint="Start with ! followed by letters, numbers, - or _ (for example !tts)."
                error={errors.command ?? null}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={draft.command}
                    onChange={(e) => {
                      const command = e.target.value
                      setDraft({ ...draft, command })
                      setErrors((prev) => {
                        const copy = { ...prev }
                        delete copy.command
                        return copy
                      })
                    }}
                    onBlur={() => commit(draft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(draft)
                    }}
                  />
                )}
              </Field>
            </Row>
          )}
          <Row>
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
              <Field
                label="Per-person cooldown (s)"
                hint={`${CHAT_TTS_LIMITS.cooldown_s[0]} to ${CHAT_TTS_LIMITS.cooldown_s[1]} seconds between a viewer’s lines.`}
                error={errors.cooldown_s ?? null}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={CHAT_TTS_LIMITS.cooldown_s[0]}
                    max={CHAT_TTS_LIMITS.cooldown_s[1]}
                    value={Number.isFinite(draft.cooldown_s) ? draft.cooldown_s : ''}
                    onChange={(e) => updateNum('cooldown_s', e.target.value)}
                    onBlur={() => commit(draft)}
                  />
                )}
              </Field>
              <Field
                label="Gap between lines (s)"
                hint={`${CHAT_TTS_LIMITS.global_cooldown_s[0]} to ${CHAT_TTS_LIMITS.global_cooldown_s[1]} seconds between spoken chat messages.`}
                error={errors.global_cooldown_s ?? null}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={CHAT_TTS_LIMITS.global_cooldown_s[0]}
                    max={CHAT_TTS_LIMITS.global_cooldown_s[1]}
                    value={Number.isFinite(draft.global_cooldown_s) ? draft.global_cooldown_s : ''}
                    onChange={(e) => updateNum('global_cooldown_s', e.target.value)}
                    onBlur={() => commit(draft)}
                  />
                )}
              </Field>
              <Field
                label="Max waiting in queue"
                hint={`${CHAT_TTS_LIMITS.queue_limit[0]} to ${CHAT_TTS_LIMITS.queue_limit[1]} waiting lines. Extra messages are skipped while full.`}
                error={errors.queue_limit ?? null}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={CHAT_TTS_LIMITS.queue_limit[0]}
                    max={CHAT_TTS_LIMITS.queue_limit[1]}
                    value={Number.isFinite(draft.queue_limit) ? draft.queue_limit : ''}
                    onChange={(e) => updateNum('queue_limit', e.target.value)}
                    onBlur={() => commit(draft)}
                  />
                )}
              </Field>
              <Field
                label="Longest chat message"
                hint={`${CHAT_TTS_LIMITS.max_chars[0]} to ${CHAT_TTS_LIMITS.max_chars[1]} characters per message.`}
                error={errors.max_chars ?? null}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={CHAT_TTS_LIMITS.max_chars[0]}
                    max={CHAT_TTS_LIMITS.max_chars[1]}
                    value={Number.isFinite(draft.max_chars) ? draft.max_chars : ''}
                    onChange={(e) => updateNum('max_chars', e.target.value)}
                    onBlur={() => commit(draft)}
                  />
                )}
              </Field>
            </div>
          </Row>
          <SwitchRow
            checked={draft.skip_links}
            onChange={(skip_links) => commit({ ...draft, skip_links })}
            label="Skip links"
            description="Skip chat messages containing URLs."
          />
          <SwitchRow
            checked={draft.skip_emote_spam}
            onChange={(skip_emote_spam) => commit({ ...draft, skip_emote_spam })}
            label="Skip emote spam"
            description="Strip emotes and skip emote-only or repeated messages."
          />
          <Row>
            <p className="text-[13px] text-text-3">
              Chat TTS always uses your computer’s local voice and never spends Pro credits.
            </p>
          </Row>
        </>
      )}
    </Group>
  )
}
