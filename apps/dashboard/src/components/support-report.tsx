// One-click support report generator & diagnostics preview (#7).
// Works in both Desktop (folder picker via engine) and Browser/Demo (zip download),
// presenting likely causes at the top and keeping all sensitive data redacted.

import { useState } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  FileArchive,
  FolderOpen,
  Info,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  describeError,
  formatSupportTimestamp,
  type CauseSeverity,
  type FerroClient,
  type SupportReport,
  type WrittenSupportReport,
} from '@ferrocast/api'
import { Button, Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError } from './Panel'
import { Group, Row } from './settings-kit'
import { inDesktopApp } from '../lib/external'
import { useClient, useResource } from '../lib/hooks'

const CAUSE_TONE: Record<CauseSeverity, { className: string; label: string }> = {
  critical: {
    className: 'border-danger/45 bg-danger-soft text-text',
    label: 'Critical',
  },
  warning: {
    className: 'border-warn/45 bg-warn-soft text-text',
    label: 'Warning',
  },
  info: {
    className: 'border-accent-line bg-accent-soft text-accent-text',
    label: 'Note',
  },
}

const CHIP_BASE =
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[12.5px] font-semibold whitespace-nowrap'

function CauseIcon({ severity }: { severity: CauseSeverity }) {
  if (severity === 'critical')
    return <WarningCircle size={18} className="shrink-0 text-danger" aria-hidden="true" />
  if (severity === 'warning')
    return <Warning size={18} className="shrink-0 text-warn" aria-hidden="true" />
  return <Info size={18} className="shrink-0 text-arc" aria-hidden="true" />
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export async function downloadSupportArchive(client: FerroClient): Promise<string> {
  const { blob, filename } =
    typeof client.downloadSupportReportFile === 'function'
      ? await client.downloadSupportReportFile()
      : {
          blob: await client.downloadSupportReportZip(),
          filename: `ferrocast-support-${formatSupportTimestamp()}.zip`,
        }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return filename
}

export function SupportReportSection({ compact = false }: { compact?: boolean }) {
  const client = useClient()
  const preview = useResource((c) => c.diagnosticsPreview(), [], { enabled: !compact })
  const [busyAction, setBusyAction] = useState<'save' | 'download' | null>(null)
  const [saved, setSaved] = useState<WrittenSupportReport | null>(null)
  // The report of the last save is what was written; a Refresh asks for what is true now.
  const [showSaved, setShowSaved] = useState(true)
  const [downloaded, setDownloaded] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  const createZip = async (forceDownload = false) => {
    const mode = inDesktopApp() && !forceDownload ? 'save' : 'download'
    setBusyAction(mode)
    setError(null)
    try {
      if (mode === 'save') {
        const res = await client.createSupportReport(null)
        if (res.cancelled) {
          toast({ tone: 'info', message: 'Support report cancelled. No folder picked.' })
          return
        }
        setSaved(res)
        setShowSaved(true)
        setDownloaded(null)
        toast({
          tone: 'ok',
          message: 'Support report saved.',
          ...(res.path ? { hint: res.path } : {}),
        })
        return
      }
      const filename = await downloadSupportArchive(client)
      setDownloaded(filename)
      setSaved(null)
      toast({
        tone: 'ok',
        message: 'Support report downloaded.',
        hint: 'Keys, tokens, emails, IPs, and folder usernames were removed first.',
      })
    } catch (e) {
      const d = describeError(e)
      setError({ message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setBusyAction(null)
    }
  }

  const report: SupportReport | null =
    (showSaved ? saved?.report : undefined) ?? preview.data ?? saved?.report ?? null

  return (
    <div id="support" className="scroll-mt-8">
      <Group
        title={compact ? 'One-click support report' : 'Help and support report'}
        note="Creates a redacted zip with likely causes, hardware, audio sample rates, recent stream health, logs, and crash dumps."
      >
        <Row
          label="Support archive (.zip)"
          description={
            inDesktopApp()
              ? 'Pick any folder to save the redacted zip.'
              : 'Downloads a redacted zip to your computer.'
          }
          control={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                icon={inDesktopApp() ? <FolderOpen size={16} /> : <FileArchive size={16} />}
                busy={busyAction === 'save' || (!inDesktopApp() && busyAction === 'download')}
                disabled={busyAction !== null}
                onClick={() => void createZip(false)}
              >
                {inDesktopApp() ? 'Create support report…' : 'Create support report'}
              </Button>
              {inDesktopApp() && (
                <Button
                  variant="outline"
                  icon={<DownloadSimple size={16} />}
                  busy={busyAction === 'download'}
                  disabled={busyAction !== null}
                  onClick={() => void createZip(true)}
                >
                  Download copy
                </Button>
              )}
            </div>
          }
        >
          {error && (
            <div
              role="alert"
              className="rounded-control border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-[14px] text-text"
            >
              <p className="font-semibold text-danger">{error.message}</p>
              {error.hint && <p className="mt-0.5 text-text-2">{error.hint}</p>}
            </div>
          )}

          {saved && saved.path && (
            <div
              role="status"
              data-testid="support-report-saved"
              className="flex flex-col gap-1 rounded-control border border-ok/35 bg-ok-soft px-3.5 py-2.5 text-[14px]"
            >
              <div className="flex items-center gap-2 font-semibold text-text">
                <CheckCircle size={17} className="text-ok" aria-hidden="true" />
                Saved {saved.filename} ({formatBytes(saved.size_bytes)})
              </div>
              <code className="font-mono text-[12.5px] break-all text-text-2">{saved.path}</code>
            </div>
          )}

          {downloaded && (
            <div
              role="status"
              data-testid="support-report-downloaded"
              className="flex items-center gap-2 rounded-control border border-ok/35 bg-ok-soft px-3.5 py-2.5 text-[14px] font-medium text-text"
            >
              <CheckCircle size={17} className="text-ok" aria-hidden="true" />
              Downloaded {downloaded}
            </div>
          )}

          {!compact && (
            <div className="mt-1 flex flex-col gap-3">
              {preview.loading && !report && <Skeleton className="h-32 w-full" />}
              {Boolean(preview.error) && !report && (
                <LoadError error={preview.error} onRetry={preview.reload} />
              )}
              {report && (
                <ReportSummaryCard
                  report={report}
                  refreshing={preview.loading}
                  onRefresh={() => {
                    setShowSaved(false)
                    preview.reload()
                  }}
                />
              )}
              <p className="m-0 text-[13px] text-text-3">
                Privacy check: stream keys, OAuth tokens, passwords, email addresses, IP addresses,
                and OS usernames in file paths are removed automatically before the zip is written.
              </p>
            </div>
          )}
        </Row>
      </Group>
    </div>
  )
}

function ReportSummaryCard({
  report,
  refreshing = false,
  onRefresh,
}: {
  report: SupportReport
  refreshing?: boolean
  onRefresh?: () => void
}) {
  const hwEncoder = report.encoders.find((e) => e.selected) ?? report.encoders[0]
  return (
    <div
      data-testid="support-report-preview"
      className="flex flex-col gap-3.5 rounded-card border border-line bg-inset p-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="m-0 font-display text-[15px] font-bold tracking-tight text-text">
            Likely causes
          </h4>
          <div className="flex items-center gap-2">
            <span
              className={cx(
                CHIP_BASE,
                report.likely_causes.length > 0
                  ? 'border-warn/45 bg-warn-soft text-text'
                  : 'border-ok/45 bg-ok-soft text-text',
              )}
            >
              {report.likely_causes.length === 0
                ? 'Healthy'
                : `${report.likely_causes.length} ${report.likely_causes.length === 1 ? 'finding' : 'findings'}`}
            </span>
            {onRefresh && (
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowClockwise size={14} />}
                busy={refreshing}
                onClick={onRefresh}
              >
                Refresh
              </Button>
            )}
          </div>
        </div>

        {report.likely_causes.length === 0 ? (
          <p className="m-0 text-[14px] text-text-2">
            No obvious issues detected across your last streams, encoders, audio devices, or logs.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {report.likely_causes.map((c) => {
              const tone = CAUSE_TONE[c.severity]
              return (
                <li
                  key={c.code}
                  className={cx(
                    'flex flex-col gap-1 rounded-control border border-line bg-surface-1 px-3 py-2.5',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span className="mt-0.5 shrink-0">
                        <CauseIcon severity={c.severity} />
                      </span>
                      <span className="text-[14px] leading-snug font-semibold break-words text-text">
                        {c.title}
                      </span>
                    </div>
                    <span className={cx(CHIP_BASE, tone.className)}>{tone.label}</span>
                  </div>
                  <p className="m-0 text-[13.5px] text-text-2">{c.detail}</p>
                  <p className="m-0 text-[13px] font-medium text-text-3">{c.recommendation}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 border-t border-line pt-3 text-[13px] sm:grid-cols-2">
        <div className="flex flex-col gap-0.5 rounded-control bg-surface-1 px-3 py-2">
          <span className="font-semibold text-text-3">App & OS</span>
          <span className="font-mono break-words text-text">
            Ferrocast {report.app.version} · {report.os.name || report.app.os} {report.os.version}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-control bg-surface-1 px-3 py-2">
          <span className="font-semibold text-text-3">GPU & Encoder</span>
          <span className="font-mono break-words text-text">
            {report.gpu.name || 'Unavailable'} ({report.gpu.backend})
            {hwEncoder ? ` · ${hwEncoder.label}` : ''}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-control bg-surface-1 px-3 py-2">
          <span className="font-semibold text-text-3">Audio & Sample Rate</span>
          <span className="font-mono break-words text-text">
            {report.audio.studio_sample_rate_hz} Hz ·{' '}
            {report.audio.enumeration_supported === false
              ? 'Enumeration unsupported'
              : `${report.audio.devices.length} device(s)`}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-control bg-surface-1 px-3 py-2">
          <span className="font-semibold text-text-3">Stream History & Crashes</span>
          <span className="font-mono break-words text-text">
            {report.last_streams.length} recent stream(s) · {report.crashes.length} crash dump(s)
          </span>
        </div>
      </div>
    </div>
  )
}
