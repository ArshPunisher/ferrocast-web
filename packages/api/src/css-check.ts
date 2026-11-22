export const MAX_CSS = 20_000

const clip = (s: string) => Array.from(s).slice(0, 40).join('')

export function isColor(s: unknown): boolean {
  if (typeof s !== 'string') return false
  if (s === 'transparent') return true
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)
}

/** core::layer::normalize_css: comments removed, escapes decoded, lowercase. */
export function normalizeCss(css: string): string {
  let noComments = ''
  let quote: string | null = null
  for (let i = 0; i < css.length; i++) {
    const c = css[i] as string
    if (quote) {
      noComments += c
      if (c === '\\') noComments += css[++i] ?? ''
      else if (c === quote || c === '\n') quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      noComments += c
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? css.length : end + 1
    } else noComments += c
  }
  let out = ''
  for (let i = 0; i < noComments.length; i++) {
    const c = noComments[i] as string
    if (c !== '\\') {
      out += c
      continue
    }
    let hex = ''
    while (
      hex.length < 6 &&
      i + 1 < noComments.length &&
      /[0-9a-fA-F]/.test(noComments[i + 1] as string)
    )
      hex += noComments[++i]
    if (!hex) {
      const n = noComments[++i]
      if (n !== undefined && n !== '\n') out += n
      continue
    }
    if (/\s/.test(noComments[i + 1] ?? '')) i += 1
    const cp = parseInt(hex, 16)
    out += cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\ufffd'
  }
  return out.toLowerCase()
}

export function checkCss(path: string, css: string): string | null {
  if (Array.from(css).length > MAX_CSS)
    return `${path}: custom CSS can be up to ${MAX_CSS} characters.`
  const lower = normalizeCss(css)
  if (lower.includes('@import')) return `${path}: @import isn't allowed; paste the CSS itself.`
  for (const bad of [
    'expression(',
    'javascript:',
    '-moz-binding',
    'behavior:',
    'image-set(',
    'src(',
  ])
    if (lower.includes(bad)) return `${path}: "${bad}" isn't allowed in custom CSS.`
  let rest = lower
  let at = rest.indexOf('url(')
  while (at >= 0) {
    const inner = rest
      .slice(at + 4)
      .trimStart()
      .replace(/^["']+/, '')
    if (!inner.startsWith('data:image/'))
      return `${path}: url() can only use data:image/… pictures; files from the internet aren't allowed.${clip('')}`
    rest = rest.slice(at + 4)
    at = rest.indexOf('url(')
  }
  return null
}
