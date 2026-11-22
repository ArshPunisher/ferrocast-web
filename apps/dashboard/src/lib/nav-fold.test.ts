import { describe, expect, it } from 'vitest'
import { enterFolding, initialNav, isFolded, leaveFolding, toggleNav } from './nav-fold'

describe('the sidebar with a folding screen', () => {
  it('folds an open sidebar on arriving and puts it back on leaving', () => {
    let s = initialNav(false)
    s = enterFolding(s)
    expect(isFolded(s)).toBe(true)
    s = leaveFolding(s)
    expect(isFolded(s)).toBe(false)
    expect(s.pref).toBe(false)
  })

  it('leaves an already folded sidebar alone everywhere', () => {
    let s = initialNav(true)
    s = enterFolding(s)
    expect(isFolded(s)).toBe(true)
    s = leaveFolding(s)
    expect(isFolded(s)).toBe(true)
    expect(s.pref).toBe(true)
  })

  it('lets the person open it on the folding screen, and it stays open there', () => {
    let s = enterFolding(initialNav(true))
    s = toggleNav(s)
    expect(isFolded(s)).toBe(false)
    // Entering again while there (a re-render, a rule switched) does not fold it again.
    s = enterFolding(s)
    expect(isFolded(s)).toBe(false)
  })

  it('does not change the saved choice from the folding screen', () => {
    let s = enterFolding(initialNav(false))
    s = toggleNav(s)
    expect(s.pref).toBe(false)
    s = leaveFolding(s)
    expect(isFolded(s)).toBe(false)
    let t = enterFolding(initialNav(true))
    t = toggleNav(t)
    t = leaveFolding(t)
    expect(isFolded(t)).toBe(true)
  })

  it('a toggle anywhere else is the choice', () => {
    let s = initialNav(false)
    s = toggleNav(s)
    expect(s).toEqual({ pref: true, alertsFolded: null })
    s = toggleNav(s)
    expect(isFolded(s)).toBe(false)
  })

  it('leaving when never there changes nothing', () => {
    const s = initialNav(true)
    expect(leaveFolding(s)).toBe(s)
  })
})
