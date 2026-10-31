/**
 * A guest's side of a call into a streamer's Studio (engine crates/guest, relay guests.rs): the
 * browser's camera and mic sent over WebRTC, straight to the streamer's computer. The relay only
 * passes the offer and answer (`POST /g/v1/offer` on this page's own origin).
 */

/** The invite token, after `#` in the link (it never reaches a server log). */
export function inviteToken(hash: string): string | null {
  const t = hash.replace(/^#/, '').trim()
  return /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null
}

/** Public STUN: the browser learns its own public address, so the PC can reach it. */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]

/** The video a guest sends: sharp, at most 4 Mbps, keeping its size on a poor network. */
export const MAX_VIDEO_BPS = 4_000_000

/** What went wrong, said plainly, and what the guest can do. */
export interface CallError {
  message: string
  hint?: string | undefined
}

/** The relay's `{error:{message,hint}}`, or a plain fallback for the status. */
export function describeJoinError(status: number, body: unknown): CallError {
  const e = (body as { error?: { message?: unknown; hint?: unknown } } | null)?.error
  if (e && typeof e.message === 'string') {
    return { message: e.message, hint: typeof e.hint === 'string' ? e.hint : undefined }
  }
  if (status === 429) return { message: 'Too many tries.', hint: 'Wait a minute, then try again.' }
  if (status >= 500)
    return { message: "Couldn't reach the streamer.", hint: 'Try again in a moment.' }
  return { message: "Couldn't join.", hint: 'Ask the streamer for a new link.' }
}

/** Why the browser refused the camera or mic, said plainly. */
export function describeMediaError(err: unknown): CallError {
  const name = (err as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      message: 'Your browser blocked the camera and mic.',
      hint: 'Allow them in the address bar, then try again.',
    }
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { message: 'No camera or mic was found.', hint: 'Plug one in, then try again.' }
  }
  if (name === 'NotReadableError') {
    return {
      message: 'Another app is using your camera or mic.',
      hint: 'Close it, then try again.',
    }
  }
  return { message: "Your camera and mic couldn't start.", hint: 'Reload the page and try again.' }
}

/** The camera and mic, from the chosen devices (or the defaults). */
export function openMedia(cameraId?: string, micId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: {
      ...(micId ? { deviceId: { exact: micId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
}

/** Waits until the browser has listed every way to reach it, at most `ms`. */
function gathered(pc: RTCPeerConnection, ms = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const done = () => {
      if (pc.iceGatheringState !== 'complete') return
      pc.removeEventListener('icegatheringstatechange', done)
      resolve()
    }
    pc.addEventListener('icegatheringstatechange', done)
    setTimeout(resolve, ms)
  })
}

/** A call under way: its connection and the senders whose tracks can be swapped. */
export interface Call {
  pc: RTCPeerConnection
  video?: RTCRtpSender
  audio?: RTCRtpSender
}

/**
 * Joins: sends the camera and mic, posts the offer through the relay, applies the answer.
 * Throws a `CallError` when the relay or the streamer's PC says no.
 */
export async function join(
  token: string,
  name: string,
  media: MediaStream,
  post: typeof fetch = fetch,
): Promise<Call> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  const call: Call = { pc }
  try {
    for (const track of media.getTracks()) {
      const t = pc.addTransceiver(track, { direction: 'sendonly', streams: [media] })
      if (track.kind === 'video') {
        call.video = t.sender
        // The video stays sharp: lower frame rate first on a poor network, up to 4 Mbps.
        const p = t.sender.getParameters()
        p.degradationPreference = 'maintain-resolution'
        p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: MAX_VIDEO_BPS }]
        await t.sender.setParameters(p).catch(() => undefined)
      } else {
        call.audio = t.sender
      }
    }
    await pc.setLocalDescription(await pc.createOffer())
    await gathered(pc)
    const local = pc.localDescription
    if (!local) throw { message: "Your browser couldn't start the call." } satisfies CallError
    let res: Response
    try {
      res = await post('/g/v1/offer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name, offer: { type: local.type, sdp: local.sdp } }),
      })
    } catch {
      throw {
        message: "Couldn't reach Ferrocast.",
        hint: 'Check your internet, then try again.',
      } satisfies CallError
    }
    const body: unknown = await res.json().catch(() => null)
    const answer = (body as { answer?: RTCSessionDescriptionInit } | null)?.answer
    if (!res.ok || !answer?.sdp) throw describeJoinError(res.status, body)
    await pc.setRemoteDescription(answer)
    return call
  } catch (e) {
    pc.close()
    throw e
  }
}
