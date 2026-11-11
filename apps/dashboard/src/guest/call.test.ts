import { describe, expect, it } from 'vitest'
import { ICE_SERVERS, describeJoinError, describeMediaError, iceServers, inviteToken } from './call'

describe('a guest link', () => {
  it('takes the token after #, and nothing that could be anything else', () => {
    expect(inviteToken('#AbC_12-xyzABCDEF')).toBe('AbC_12-xyzABCDEF')
    expect(inviteToken('')).toBeNull()
    expect(inviteToken('#short')).toBeNull()
    expect(inviteToken('#has space in it')).toBeNull()
    expect(inviteToken('#<script>alert(1)</script>')).toBeNull()
  })
})

describe('what a guest is told', () => {
  it("says the relay's own words when it gives them", () => {
    const body = {
      error: { message: 'This guest link has ended.', hint: 'Ask the streamer for a new link.' },
    }
    expect(describeJoinError(404, body)).toEqual({
      message: 'This guest link has ended.',
      hint: 'Ask the streamer for a new link.',
    })
  })

  it('falls back to a plain sentence for each kind of failure', () => {
    expect(describeJoinError(429, null).message).toBe('Too many tries.')
    expect(describeJoinError(502, 'not json').message).toBe("Couldn't reach the streamer.")
    expect(describeJoinError(400, {}).hint).toBe('Ask the streamer for a new link.')
  })

  it('names why the camera or mic would not start', () => {
    expect(describeMediaError({ name: 'NotAllowedError' }).message).toBe(
      'Your browser blocked the camera and mic.',
    )
    expect(describeMediaError({ name: 'NotFoundError' }).message).toBe(
      'No camera or mic was found.',
    )
    expect(describeMediaError({ name: 'NotReadableError' }).message).toBe(
      'Another app is using your camera or mic.',
    )
    expect(describeMediaError(new Error('?')).hint).toBe('Reload the page and try again.')
  })
})

describe("a guest's ICE servers", () => {
  const answer = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it("takes the relay's list, TURN included", async () => {
    const turn = { urls: ['turn:turn.example:3478'], username: 'u', credential: 'c' }
    const list = await iceServers('tok', answer(200, { iceServers: [ICE_SERVERS[0], turn, { nope: 1 }] }))
    expect(list).toEqual([ICE_SERVERS[0], turn])
  })
  it('falls back to public STUN when the relay says no or is away', async () => {
    expect(await iceServers('tok', answer(404, { error: {} }))).toEqual(ICE_SERVERS)
    expect(await iceServers('tok', answer(200, { iceServers: [] }))).toEqual(ICE_SERVERS)
    const away = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await iceServers('tok', away)).toEqual(ICE_SERVERS)
  })
})
