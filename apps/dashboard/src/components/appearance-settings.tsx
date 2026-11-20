// Settings › Appearance: text size and row density; Accessibility: motion, the meters' colours
// and the colour of what's picked (OBS's own two pages). Kept per window (lib/appearance.ts).

import { useId } from 'react'
import { Button, Segmented } from '@ferrocast/ui'
import {
  COLORBLIND,
  DEFAULT_APPEARANCE,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  setAppearance,
  type Appearance,
  type Density,
  type MeterPreset,
} from '../lib/appearance'
import { useAppearance } from '../lib/use-appearance'
import { Group, Row, SwitchRow } from './settings-kit'

function ColorBox({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[14px] text-text-2">
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 cursor-pointer rounded-control border border-line bg-transparent p-0.5"
      />
      {label}
    </label>
  )
}

/** A strip of the three zones in the colours chosen, as the mixer draws them. */
function MeterSample({ ok, warn, clip }: { ok: string; warn: string; clip: string }) {
  return (
    <div
      aria-hidden
      data-testid="meter-sample"
      className="h-2.5 w-40 rounded-full"
      style={{
        background: `linear-gradient(90deg,${ok} 0 66.6%,${warn} 66.6% 85%,${clip} 85% 100%)`,
      }}
    />
  )
}

export function AppearanceGroups() {
  const a = useAppearance()
  const sizeId = useId()
  const put = (patch: Partial<Appearance>) => setAppearance({ ...a, ...patch })
  const shown =
    a.meters === 'colorblind'
      ? COLORBLIND
      : a.meters === 'custom'
        ? a.custom
        : { ok: '#3dd193', warn: '#f2b84b', clip: '#ff5d6c' }
  return (
    <>
      <Group title="Size and spacing" note="Kept on this computer, in this window.">
        <Row
          label="Text size"
          description="Everything sized in the app’s own units grows or shrinks with it."
          htmlFor={sizeId}
          control={
            <span className="flex items-center gap-2.5">
              <input
                id={sizeId}
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={SCALE_STEP}
                value={a.scale}
                onChange={(e) => put({ scale: Number(e.target.value) })}
                className="w-36 accent-[var(--fc-pick)]"
                aria-valuetext={`${a.scale}%`}
              />
              <output
                htmlFor={sizeId}
                className="w-11 text-right text-[14px] text-text-2 tabular-nums"
              >
                {a.scale}%
              </output>
            </span>
          }
        />
        <Row
          label="Row spacing"
          description="Rows in the Studio’s option lists."
          control={
            <Segmented
              label="Row spacing"
              value={a.density}
              onChange={(density: Density) => put({ density })}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'normal', label: 'Normal' },
                { value: 'comfortable', label: 'Roomy' },
              ]}
            />
          }
        />
      </Group>
      <Group title="Accessibility">
        <SwitchRow
          checked={a.reduceMotion}
          onChange={(reduceMotion) => put({ reduceMotion })}
          label="Reduce motion"
          description="Nothing slides or fades. It also follows your computer’s own setting."
        />
        <Row
          label="Meter colours"
          description="The mixer’s normal, loud and clipping zones."
          control={
            <Segmented
              label="Meter colours"
              value={a.meters}
              onChange={(meters: MeterPreset) => put({ meters })}
              options={[
                { value: 'default', label: 'Normal' },
                { value: 'colorblind', label: 'Colour-blind friendly' },
                { value: 'custom', label: 'Your own' },
              ]}
            />
          }
        />
        <Row child label="Preview">
          <MeterSample {...shown} />
        </Row>
        {a.meters === 'custom' && (
          <Row child label="Your colours">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <ColorBox
                label="Normal"
                value={a.custom.ok}
                onChange={(ok) => put({ custom: { ...a.custom, ok } })}
              />
              <ColorBox
                label="Loud"
                value={a.custom.warn}
                onChange={(warn) => put({ custom: { ...a.custom, warn } })}
              />
              <ColorBox
                label="Clipping"
                value={a.custom.clip}
                onChange={(clip) => put({ custom: { ...a.custom, clip } })}
              />
            </div>
          </Row>
        )}
        <Row
          label="Selection colour"
          description="What’s picked in lists and choices."
          control={
            <span className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Selection colour"
                value={a.select ?? (a.meters === 'colorblind' ? COLORBLIND.select : '#08597d')}
                onChange={(e) => put({ select: e.target.value })}
                className="size-8 cursor-pointer rounded-control border border-line bg-transparent p-0.5"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={a.select === null}
                onClick={() => put({ select: null })}
              >
                Reset
              </Button>
            </span>
          }
        />
        <Row
          label="Back to the defaults"
          control={
            <Button size="sm" variant="secondary" onClick={() => setAppearance(DEFAULT_APPEARANCE)}>
              Reset all
            </Button>
          }
        />
      </Group>
    </>
  )
}
