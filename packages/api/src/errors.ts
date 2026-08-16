import type { ApiErrorBody } from './types'

/** Statuses the engine documents (API.md §1), plus 0 for "the engine isn't reachable". */
export type KnownStatus = 0 | 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 502 | 503

/**
 * One error type for every failed call. `message` is always something a streamer can
 * read; `hint` says what to do about it. Nothing reaches the UI as a raw exception.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly hint: string | null
  /** Seconds to wait before trying again (429 and 503). */
  readonly retryAfter: number | null

  constructor(
    status: number,
    code: string,
    message: string,
    hint: string | null = null,
    retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.hint = hint
    this.retryAfter = retryAfter
  }

  /** The engine is down or unreachable, as opposed to refusing the request. */
  get offline(): boolean {
    return this.status === 0
  }
}

/** Fallback copy per status, used when the engine's body is missing or unreadable. */
export const STATUS_COPY: Record<KnownStatus, { message: string; hint: string | null }> = {
  0: {
    message: "Can't reach Ferrocast.",
    hint: 'Make sure the Ferrocast app is running, then try again.',
  },
  400: { message: "Something in that form isn't right.", hint: 'Check the highlighted field.' },
  401: {
    message: 'This session has ended.',
    hint: 'Open the dashboard again from the Ferrocast app to sign back in.',
  },
  403: {
    message: 'Ferrocast blocked this request.',
    hint: 'Open the dashboard from the Ferrocast app, or turn on LAN access in Settings.',
  },
  404: { message: "That doesn't exist anymore.", hint: 'Reload the page to get the latest list.' },
  409: { message: 'That clashes with something you already have.', hint: null },
  413: { message: 'That file is too big.', hint: 'Sounds can be up to 5 MB, images up to 10 MB.' },
  415: {
    message: "That file type isn't supported.",
    hint: 'Use PNG, JPEG, GIF or WebP images, MP3, OGG or WAV sounds, WebM or MP4 video.',
  },
  422: { message: "That can't run right now.", hint: null },
  429: { message: "You're going a bit fast.", hint: 'Wait a moment and try again.' },
  502: {
    message: 'Another service Ferrocast was talking to had a problem.',
    hint: 'Nothing was changed. Try again in a few minutes.',
  },
  503: { message: 'Ferrocast is still starting.', hint: 'This takes a second or two.' },
}

function isKnown(status: number): status is KnownStatus {
  return status in STATUS_COPY
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false
  const e = (v as { error: unknown }).error
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { code?: unknown }).code === 'string' &&
    typeof (e as { message?: unknown }).message === 'string'
  )
}

/** Parses `Retry-After` (seconds or an HTTP date). Clamped to 0–300 s. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  if (Number.isFinite(n)) return Math.min(Math.max(Math.round(n), 0), 300)
  const at = Date.parse(value)
  if (Number.isNaN(at)) return null
  return Math.min(Math.max(Math.round((at - now) / 1000), 0), 300)
}

/** Builds an ApiError from a failed response, trusting the engine's copy when it has some. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = null
  }
  const retry = parseRetryAfter(res.headers.get('Retry-After'))
  const fallback = isKnown(res.status)
    ? STATUS_COPY[res.status]
    : { message: 'Something went wrong in Ferrocast.', hint: 'Try again in a moment.' }
  if (isErrorBody(body)) {
    const msg = body.error.message.trim() || fallback.message
    const hint = body.error.hint?.trim() || fallback.hint
    return new ApiError(res.status, body.error.code, msg, hint, retry)
  }
  return new ApiError(res.status, `http_${res.status}`, fallback.message, fallback.hint, retry)
}

export function offlineError(): ApiError {
  return new ApiError(0, 'offline', STATUS_COPY[0].message, STATUS_COPY[0].hint)
}

/** Turns anything thrown into readable copy for a toast or inline message. */
export function describeError(err: unknown): { message: string; hint: string | null } {
  if (err instanceof ApiError) return { message: err.message, hint: err.hint }
  return { message: 'Something went wrong.', hint: 'Try again in a moment.' }
}
