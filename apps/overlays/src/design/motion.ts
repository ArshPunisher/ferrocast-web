// Entrance, exit and per-letter text animations for alert designs, as Web Animations
// keyframes. Transform and opacity only, plus clip-path for wipes (R-38). Reduced motion
// and low-motion overlays turn every entrance and exit into a short fade and drop the text
// animation.

import type { AnimIn, AnimOut, TextAnim } from '@ferrocast/api/types'

type Frames = Keyframe[]

export const EASE_IN = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const EASE_OUT = 'cubic-bezier(0.55, 0, 0.75, 0.2)'

export const IN: Record<AnimIn, { kf: Frames; ease?: string }> = {
  none: { kf: [] },
  fade: { kf: [{ opacity: 0 }, { opacity: 1 }] },
  rise: {
    kf: [
      { opacity: 0, transform: 'translateY(60px)' },
      { opacity: 1, transform: 'none' },
    ],
  },
  drop: {
    kf: [
      { opacity: 0, transform: 'translateY(-90px)' },
      { opacity: 1, transform: 'translateY(6px)', offset: 0.75 },
      { opacity: 1, transform: 'none' },
    ],
  },
  slide_left: {
    kf: [
      { opacity: 0, transform: 'translateX(-320px)' },
      { opacity: 1, transform: 'none' },
    ],
  },
  slide_right: {
    kf: [
      { opacity: 0, transform: 'translateX(320px)' },
      { opacity: 1, transform: 'none' },
    ],
  },
  zoom: {
    kf: [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'none' },
    ],
  },
  pop: {
    kf: [
      { opacity: 0, transform: 'scale(0.4)' },
      { opacity: 1, transform: 'scale(1.08)', offset: 0.6 },
      { transform: 'scale(0.98)', offset: 0.82 },
      { opacity: 1, transform: 'none' },
    ],
    ease: 'cubic-bezier(.3,.7,.4,1)',
  },
  bounce: {
    kf: [
      { opacity: 0, transform: 'translateY(-140px)' },
      { opacity: 1, transform: 'none', offset: 0.5 },
      { transform: 'translateY(-26px)', offset: 0.68 },
      { transform: 'none', offset: 0.84 },
      { transform: 'translateY(-7px)', offset: 0.92 },
      { transform: 'none' },
    ],
    ease: 'linear',
  },
  flip: {
    kf: [
      { opacity: 0, transform: 'perspective(900px) rotateX(-85deg)' },
      { opacity: 1, transform: 'perspective(900px) rotateX(0)' },
    ],
  },
  wipe: { kf: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }] },
  // A magnet pull: rises from just below and settles (no blur: OBS on Linux).
  magnet: {
    kf: [
      { opacity: 0, transform: 'translateY(36px) scale(0.96)' },
      { opacity: 1, transform: 'translateY(-3px) scale(1.01)', offset: 0.7 },
      { opacity: 1, transform: 'none' },
    ],
  },
}

export const OUT: Record<AnimOut, Frames> = {
  none: [],
  fade: [{ opacity: 1 }, { opacity: 0 }],
  sink: [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateY(50px)' },
  ],
  lift: [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateY(-60px)' },
  ],
  slide_left: [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateX(-320px)' },
  ],
  slide_right: [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateX(320px)' },
  ],
  zoom: [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'scale(0.7)' },
  ],
  shrink: [
    { transform: 'none' },
    { transform: 'scale(1.06)', offset: 0.3 },
    { opacity: 0, transform: 'scale(0.3)' },
  ],
  flip: [
    { opacity: 1, transform: 'perspective(900px) rotateX(0)' },
    { opacity: 0, transform: 'perspective(900px) rotateX(85deg)' },
  ],
  wipe: [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }],
}

export type Animate = (
  node: Element,
  kf: Frames,
  opts: KeyframeAnimationOptions,
) => Animation | null

/**
 * Per-letter animation of the headline. Looping ones (wave, wiggle, glow) only run while the
 * alert holds; the caller cancels them before the exit.
 */
export function textAnimation(
  kind: TextAnim,
  chars: Element[],
  highlights: Element[],
  t0: number,
  A: Animate,
): void {
  const n = chars.length
  switch (kind) {
    case 'wave':
      chars.forEach((c, i) =>
        A(
          c,
          [
            { transform: 'none' },
            { transform: 'translateY(-9px)', offset: 0.25 },
            { transform: 'none', offset: 0.5 },
            { transform: 'none' },
          ],
          { duration: 1400, delay: t0 + 300 + i * 55, iterations: 3, easing: 'ease-in-out' },
        ),
      )
      break
    case 'wiggle':
      chars.forEach((c, i) =>
        A(c, [{ transform: 'rotate(-7deg)' }, { transform: 'rotate(7deg)' }], {
          duration: 260,
          delay: t0 + (i % 4) * 40,
          iterations: 12,
          direction: 'alternate',
          easing: 'ease-in-out',
        }),
      )
      break
    case 'bounce':
      chars.forEach((c, i) =>
        A(
          c,
          [
            { opacity: 0, transform: 'translateY(-38px)' },
            { opacity: 1, transform: 'none', offset: 0.55 },
            { transform: 'translateY(-8px)', offset: 0.75 },
            { transform: 'none' },
          ],
          { duration: 560, delay: t0 + i * 32, fill: 'backwards', easing: 'ease-out' },
        ),
      )
      break
    case 'pop':
      chars.forEach((c, i) =>
        A(
          c,
          [
            { opacity: 0, transform: 'scale(0)' },
            { opacity: 1, transform: 'scale(1.25)', offset: 0.6 },
            { transform: 'none' },
          ],
          {
            duration: 380,
            delay: t0 + i * 28,
            fill: 'backwards',
            easing: 'ease-out',
          },
        ),
      )
      break
    case 'type':
      chars.forEach((c, i) =>
        A(c, [{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }], {
          duration: 1,
          delay: t0 + i * Math.min(55, 1400 / Math.max(1, n)),
          fill: 'backwards',
        }),
      )
      break
    case 'glow':
      highlights.forEach((h) =>
        A(
          h,
          [
            { textShadow: '0 0 0 transparent' },
            { textShadow: '0 0 18px currentColor, 0 0 4px currentColor' },
            { textShadow: '0 0 0 transparent' },
          ],
          { duration: 1500, delay: t0, iterations: 3, easing: 'ease-in-out' },
        ),
      )
      break
    case 'none':
      break
  }
}
