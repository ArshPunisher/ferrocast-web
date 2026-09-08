// What the demo engine lends its feature modules (points, polls, giveaways…), so each
// feature keeps its own state and routes in its own file.

import type { Actor, ChatPlatform, FerroEvent } from '../../types'
import { HttpError } from '../http-error'

/** A demo feature: its routes, and (optionally) every chat message as it arrives. */
export interface DemoFeature {
  route(method: string, seg: string[], body: unknown, url: URL): unknown
  onChat?(e: FerroEvent): void
  /** Every event after the engine handled it (Studio's "Don't miss" lane). */
  onEvent?(e: FerroEvent): void
}

/** Returned by a feature's `route` when the request isn't one of its routes. */
export const NOT_MINE = Symbol('not mine')
export type Routed = unknown | typeof NOT_MINE

export interface DemoHost {
  /** Sends a frame to every open dashboard socket. */
  broadcastLive(frame: unknown): void
  /** Sends a `state` frame (partial overlay state) to every overlay socket. */
  pushOverlayState(partial: Record<string, unknown>): void
  /** The bot says something in chat on every connected platform (shown as the streamer). */
  say(text: string): void
  /** A viewer chats (demo audience): goes through the same path as real chat. */
  chat(actor: Actor, text: string): void
  /** Chat platforms that are connected right now. */
  connectedChat(): ChatPlatform[]
  /** People the demo knows (its seeded chatters), with stable ids. */
  knownActors(): Actor[]
  /** Anyone who chatted or did something here (from the event log), like the engine's viewers. */
  seenActor(platform: string, userId: string): Actor | null
  isLive(): boolean
  /** Runs `fn` after `ms`, cancelled when the demo is disposed. */
  later(fn: () => void, ms: number): void
  random(): number
}

export function requireObj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new HttpError(400, 'invalid', 'The request body must be a JSON object.')
  return v as Record<string, unknown>
}

export const clone = <T>(v: T): T => structuredClone(v)

export function isWhole(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

/** "1,234". */
export function group(n: number): string {
  return Math.trunc(n).toLocaleString('en-US')
}
