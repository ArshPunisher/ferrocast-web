// Chat TTS safety and link guards matching crates/core/src/{filter,tts}.rs for DemoEngine.

const SHORT_DOMAINS = [
  't.co',
  'youtu.be',
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
  't.ly',
]

const GENERIC_TLDS = new Set([
  'com',
  'net',
  'org',
  'dev',
  'app',
  'xyz',
  'info',
  'biz',
  'live',
  'link',
  'site',
  'online',
  'store',
  'shop',
  'club',
  'top',
  'vip',
  'fun',
  'pro',
  'art',
  'blog',
  'chat',
  'click',
  'cloud',
  'games',
  'icu',
  'lol',
  'monster',
  'rest',
  'sbs',
  'space',
  'tech',
  'today',
  'website',
  'win',
  'zip',
  'gay',
  'ink',
])

const COUNTRY_TLDS = new Set([
  'ac',
  'ae',
  'ag',
  'ai',
  'al',
  'am',
  'ar',
  'at',
  'au',
  'az',
  'ba',
  'bd',
  'be',
  'bg',
  'bh',
  'br',
  'by',
  'bz',
  'ca',
  'cc',
  'cf',
  'ch',
  'cl',
  'cn',
  'co',
  'cx',
  'cz',
  'de',
  'dk',
  'ee',
  'eg',
  'es',
  'fi',
  'fm',
  'fo',
  'fr',
  'ga',
  'ge',
  'gg',
  'gl',
  'gq',
  'gr',
  'gy',
  'hk',
  'hr',
  'hu',
  'id',
  'ie',
  'il',
  'im',
  'in',
  'io',
  'ir',
  'is',
  'it',
  'jo',
  'jp',
  'ke',
  'kr',
  'kw',
  'kz',
  'la',
  'lb',
  'lc',
  'li',
  'lk',
  'lt',
  'lu',
  'lv',
  'ly',
  'ma',
  'md',
  'me',
  'mk',
  'ml',
  'mn',
  'ms',
  'mu',
  'mx',
  'my',
  'ng',
  'nl',
  'no',
  'np',
  'nu',
  'nz',
  'om',
  'pe',
  'ph',
  'pk',
  'pl',
  'pt',
  'pw',
  'qa',
  'ro',
  'rs',
  'ru',
  'sa',
  'sc',
  'se',
  'sg',
  'sh',
  'si',
  'sk',
  'so',
  'su',
  'th',
  'tk',
  'to',
  'tr',
  'tv',
  'tw',
  'ua',
  'uk',
  'us',
  'uz',
  'vg',
  'vn',
  'ws',
  'za',
])

const UNAMBIGUOUS_SPACED_TLDS = new Set([
  'com',
  'net',
  'org',
  'xyz',
  'dev',
  'app',
  'biz',
  'icu',
  'sbs',
  'monster',
  'website',
  'io',
  'gg',
  'ly',
  'co',
  'uk',
  'ru',
  'de',
  'fr',
  'jp',
  'cn',
  'br',
  'kr',
  'pl',
  'nl',
  'se',
  'cz',
  'ua',
  'tr',
  'hk',
  'sg',
  'tw',
  'vg',
  'tk',
  'pw',
  'cc',
  'ws',
])

function isTld(t: string): boolean {
  return GENERIC_TLDS.has(t) || COUNTRY_TLDS.has(t)
}

function stripPort(host: string): string {
  const idx = host.lastIndexOf(':')
  if (idx > 0 && /^\d+$/.test(host.slice(idx + 1))) return host.slice(0, idx)
  return host
}

function stripTokenPunct(token: string): string {
  return token.replace(/^[\s.,!?;:()[\]{}<>"'`]+|[\s.,!?;:()[\]{}<>"'`]+$/g, '')
}

function isInvisibleOrControl(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0
  if (isInvisible(ch)) return true
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x20) return false
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)
}

export function normalizeChatTtsText(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFKC')) {
    if (!isInvisibleOrControl(ch)) out += ch
  }
  return out
}

export function isEmailToken(raw: string): boolean {
  const token = stripTokenPunct(normalizeChatTtsText(raw))
  if (
    !token ||
    token.includes('/') ||
    token.includes('\\') ||
    token.includes(':') ||
    token.includes('?') ||
    token.includes('#')
  )
    return false
  const lower = token.toLowerCase()
  if (lower.includes('://') || lower.startsWith('www.')) return false
  const at = token.indexOf('@')
  if (at <= 0 || token.indexOf('@', at + 1) !== -1) return false
  const local = token.slice(0, at)
  const domain = token.slice(at + 1)
  if (!local || !domain || !domain.includes('.')) return false
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false
  const tld = domain.slice(domain.lastIndexOf('.') + 1).toLowerCase()
  return /^[a-z]{2,}$/.test(tld)
}

function collapseSpacedDots(s: string): string {
  const tokens = s.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return s
  const out: string[] = []
  for (const tok of tokens) {
    const prev = out[out.length - 1]
    if (prev) {
      if (tok.startsWith('.') && !tok.startsWith('..') && /[\p{L}\p{N}]$/u.test(prev)) {
        const hostPart = tok.slice(1).split(/[/?#@]/)[0] ?? ''
        const tld = stripPort(hostPart).replace(/[^a-z0-9]+$/i, '')
        if (isTld(tld)) {
          out[out.length - 1] = `${prev}${tok}`
          continue
        }
      }
      if (prev.endsWith('.') && !prev.endsWith('..') && /[\p{L}\p{N}]\.$/u.test(prev)) {
        const trimmed = tok.replace(/[^a-z0-9/]+$/gi, '')
        const hasPath = /[/?#@]/.test(trimmed)
        const hostPart = trimmed.split(/[/?#@]/)[0] ?? ''
        const tld = stripPort(hostPart).replace(/[^a-z0-9]+$/i, '')
        if (hasPath ? isTld(tld) : UNAMBIGUOUS_SPACED_TLDS.has(tld)) {
          out[out.length - 1] = `${prev}${tok}`
          continue
        }
      }
    }
    out.push(tok)
  }
  return out.join(' ')
}

export function hasAnyLink(text: string): boolean {
  const norm = normalizeChatTtsText(text).toLowerCase()
  const pre = norm
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .replaceAll('[ . ]', '.')
    .replaceAll('( . )', '.')
    .replaceAll('{ . }', '.')
    .replaceAll('[.]', '.')
    .replaceAll('(.)', '.')
    .replaceAll('{.}', '.')
    .replaceAll(' dot ', '.')
    .replaceAll(' . ', '.')
    .replaceAll(' : //', '://')
    .replaceAll(': //', '://')
    .replaceAll(' ://', '://')
    .replaceAll(':// ', '://')
    .replaceAll('www . ', 'www.')
    .replaceAll('www. ', 'www.')
  if (/(?:https?|hxxps?):\/\/|www\./i.test(pre) || pre.includes('://')) return true
  const spaced = collapseSpacedDots(pre)
  for (const rawTok of spaced.split(/\s+/)) {
    if (!rawTok || isEmailToken(rawTok)) continue
    const w = rawTok.replace(/^[^\p{L}\p{N}/.:]+|[^\p{L}\p{N}/.:]+$/gu, '')
    const withoutScheme = w.replace(/^(?:https?|hxxps?):\/\//i, '')
    const rawHost = withoutScheme.split(/[/?#]/)[0] ?? ''
    const host = stripPort(rawHost)
      .replace(/\.+$/, '')
      .replace(/^www\./i, '')
    if (!host || host.includes('..')) continue
    const parts = host.split('.')
    const tld = parts[parts.length - 1] ?? ''
    if (parts.length >= 2 && parts.every(Boolean) && isTld(tld)) return true
    if (SHORT_DOMAINS.some((d) => host === d || rawTok.startsWith(`${d}/`))) return true
  }
  return false
}

function lookalike(c: string): string {
  switch (c) {
    case '0':
      return 'o'
    case '1':
    case '!':
    case '|':
      return 'i'
    case '3':
      return 'e'
    case '4':
    case '@':
      return 'a'
    case '5':
    case '$':
      return 's'
    case '7':
      return 't'
    case '8':
      return 'b'
    case '9':
      return 'g'
    case '\u0430':
    case '\u03b1':
      return 'a'
    case '\u0435':
    case '\u03b5':
      return 'e'
    case '\u043e':
    case '\u03bf':
      return 'o'
    case '\u0440':
    case '\u03c1':
      return 'p'
    case '\u0441':
      return 'c'
    case '\u0443':
      return 'y'
    case '\u0445':
    case '\u03c7':
      return 'x'
    case '\u0456':
    case '\u03b9':
      return 'i'
    case '\u0458':
      return 'j'
    case '\u0455':
      return 's'
    case '\u043a':
    case '\u03ba':
      return 'k'
    case '\u043c':
      return 'm'
    case '\u043d':
    case '\u03b7':
      return 'n'
    case '\u0442':
    case '\u03c4':
      return 't'
    case '\u0432':
    case '\u03b2':
      return 'b'
    case '\u03bd':
      return 'v'
    case '\u0261':
      return 'g'
    default:
      return c
  }
}

function isInvisible(c: string): boolean {
  const cp = c.codePointAt(0) ?? 0
  return (
    cp === 0x00ad ||
    cp === 0x034f ||
    cp === 0x061c ||
    cp === 0x180e ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0xfeff ||
    (cp >= 0xe0000 && cp <= 0xe007f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  )
}

function squeezeWith(word: string, keepDouble: (c: string) => boolean): string {
  let out = ''
  let prev = ''
  let run = 0
  for (const ch of word) {
    if (ch === prev) {
      run += 1
      if (keepDouble(ch) && run === 2) out += ch
    } else {
      prev = ch
      run = 1
      out += ch
    }
  }
  return out
}

function foldWith(text: string, keepDouble: (c: string) => boolean): string {
  let mapped = ''
  for (const ch of text.normalize('NFKC').toLowerCase()) {
    if (!isInvisible(ch)) mapped += lookalike(ch)
  }
  const tokens = mapped.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const words: string[] = []
  let run = ''
  for (const t of tokens) {
    if ([...t].length === 1) {
      run += t
    } else {
      if (run) {
        words.push(run)
        run = ''
      }
      words.push(t)
    }
  }
  if (run) words.push(run)
  return words.map((w) => squeezeWith(w, keepDouble)).join(' ')
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const encoder = new TextEncoder()

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

function sha256Prefix16Hex(input: string): string {
  const bytes = encoder.encode(input)
  const bitLen = bytes.length * 8
  const padLen = Math.ceil((bytes.length + 9) / 64) * 64
  const buf = new Uint8Array(padLen)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x1_0000_0000), false)
  dv.setUint32(padLen - 4, bitLen >>> 0, false)

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[]
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)
      const ch = (e! & f!) ^ (~e! & g!)
      const temp1 = (hh! + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0
      const s0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!)
      const temp2 = (s0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d! + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h[0] = (h[0]! + a!) >>> 0
    h[1] = (h[1]! + b!) >>> 0
    h[2] = (h[2]! + c!) >>> 0
    h[3] = (h[3]! + d!) >>> 0
  }
  return Array.from(h.slice(0, 4))
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('')
}

const WHOLE_WORD_FOLDED_1 = new Set([
  '9915ba2d822280f22c283df4e76584a4',
  '17bde8b4064612e266eaa1b5b1dfa054',
  '63bd9333b1a0b11da8d0b206c4b86cd2',
  '693ee9961bef39c102f077c046c93cc9',
  '158869a97379229b7681efae9d7f9c92',
  'c1cabb6f6e431f9c4dea4c3b3264d6fe',
  'bd331fb1d24298f52943034a243a3418',
  'b27c1d7f1e7ff7b34e25ac2db5dc5f2f',
  '76b30a2ce85f13c1a38343979a83db15',
  'c3de533e9b7fe63b79f648687a30d286',
  '268651b3ece980102f18871fde071893',
  '3c8400b402baa7f1b8cac94e00b9b913',
  '79301d9ccedae2a293a9955a2c6ebc1a',
  'f9d0d9b18ae9033a5ea36df19bf279b0',
  '45cd3e1bb472d8e285a160a95f6409ec',
  '98b52c4b6b7d1f48e7477a5ccc10955d',
  '044eb98b18769b887d5a0258f675e413',
  'eef3bd091670c3447022d619c06ad15d',
  '0ce875d620076b533c6e681abaa0dc5d',
  '566f532d486c947709d3d0e6b7575af8',
  '517ae3f73216da641d8d3187ca354fec',
  '886d51e97ad7931d0d2af8439ca6d9e4',
  '92a9bf818e7e00021b6d6959f877f5df',
  '12e6274e4309293e2d480272b49a6c7c',
  'bb209d506bb8b17815af0e50923c3d8f',
  'cc02032349c833ac5e97bac094560ed4',
  '82159dd02870c13ec30e4f146db7c317',
  'e742d17ff490c87e19d0cfbfdb18c691',
  '22fc75e65a0e9d34324092a7c6a8dba9',
  '333f7618092958c75b8c5af6f1ec77b4',
])

const SUBSTRING_FOLDED_1 = new Set([
  '63bd9333b1a0b11da8d0b206c4b86cd2',
  '693ee9961bef39c102f077c046c93cc9',
  '158869a97379229b7681efae9d7f9c92',
  'c1cabb6f6e431f9c4dea4c3b3264d6fe',
  'bd331fb1d24298f52943034a243a3418',
  'eef3bd091670c3447022d619c06ad15d',
  '0ce875d620076b533c6e681abaa0dc5d',
  '12e6274e4309293e2d480272b49a6c7c',
  'bb209d506bb8b17815af0e50923c3d8f',
  'e742d17ff490c87e19d0cfbfdb18c691',
  '22fc75e65a0e9d34324092a7c6a8dba9',
  '333f7618092958c75b8c5af6f1ec77b4',
])

const WHOLE_WORD_FOLDED_GO = new Set([
  '120f6e5b4ea32f65bda68452fcfaaef0',
  '5b3ae48be122f7ed19b4cc587649f41f',
  '08a841e996781e9e77d30a4e4420a8f5',
  '341d56384afc0f47b34ca18273e793be',
  'e7b98c6aa5b944e0b315d350d423f895',
  'daec0c235d3135fc1c60aee787f784c5',
])

const SUBSTRING_FOLDED_GO = new Set([
  '120f6e5b4ea32f65bda68452fcfaaef0',
  '5b3ae48be122f7ed19b4cc587649f41f',
  '08a841e996781e9e77d30a4e4420a8f5',
  '341d56384afc0f47b34ca18273e793be',
])

function containsSubtokenHash(
  token: string,
  hashes: Set<string>,
  minLen: number,
  maxLen: number,
): boolean {
  const chars = [...token]
  if (chars.length < minLen) return false
  for (let len = minLen; len <= Math.min(maxLen, chars.length); len++) {
    for (let start = 0; start <= chars.length - len; start++) {
      if (hashes.has(sha256Prefix16Hex(chars.slice(start, start + len).join('')))) return true
    }
  }
  return false
}

function matchesSetWithOptionalPlural(token: string, hashes: Set<string>): boolean {
  if (hashes.has(sha256Prefix16Hex(token))) return true
  return (
    token.endsWith('s') && token.length > 3 && hashes.has(sha256Prefix16Hex(token.slice(0, -1)))
  )
}

function foldChunk(chunk: string, keepDouble: (c: string) => boolean): string {
  let mapped = ''
  for (const ch of chunk.toLowerCase()) {
    const l = lookalike(ch)
    if (/[\p{L}\p{N}]/u.test(l)) mapped += l
  }
  return squeezeWith(mapped, keepDouble)
}

function matchesSlurToken(
  token: string,
  wholeWord: Set<string>,
  substring: Set<string>,
  minLen: number,
  maxLen: number,
): boolean {
  if (wholeWord.has(sha256Prefix16Hex(token))) return true
  if (
    token.endsWith('s') &&
    [...token].length >= 5 &&
    wholeWord.has(sha256Prefix16Hex(token.slice(0, -1)))
  ) {
    return true
  }
  return containsSubtokenHash(token, substring, minLen, maxLen)
}

function containsSevereSlurWithPolicy(
  norm: string,
  keepDouble: (c: string) => boolean,
  wholeWord: Set<string>,
  substring: Set<string>,
  minLen: number,
  maxLen: number,
): boolean {
  const chunks = norm
    .split(/\s+/)
    .map((raw) => foldChunk(raw, keepDouble))
    .filter(Boolean)

  for (const chunk of chunks) {
    if (matchesSlurToken(chunk, wholeWord, substring, minLen, maxLen)) return true
  }

  const tokens: string[] = []
  let run = ''
  for (const c of chunks) {
    if ([...c].length === 1) {
      run += c
    } else {
      if (run) {
        tokens.push(squeezeWith(run, keepDouble))
        run = ''
      }
      tokens.push(c)
    }
  }
  if (run) tokens.push(squeezeWith(run, keepDouble))

  for (const tok of tokens) {
    if (matchesSlurToken(tok, wholeWord, substring, minLen, maxLen)) return true
  }

  for (let span = 2; span <= 4; span++) {
    for (let i = 0; i + span <= tokens.length; i++) {
      const joined = squeezeWith(tokens.slice(i, i + span).join(''), keepDouble)
      const len = [...joined].length
      if (len >= 4 && len <= maxLen + 2) {
        if (wholeWord.has(sha256Prefix16Hex(joined))) return true
        if (
          joined.endsWith('s') &&
          len >= 5 &&
          wholeWord.has(sha256Prefix16Hex(joined.slice(0, -1)))
        ) {
          return true
        }
      }
      if (len >= minLen && len <= maxLen + 1) {
        if (matchesSetWithOptionalPlural(joined, substring)) return true
      }
    }
  }
  return false
}

export function containsSevereSlur(text: string): boolean {
  const norm = normalizeChatTtsText(text)
  if (
    containsSevereSlurWithPolicy(norm, () => false, WHOLE_WORD_FOLDED_1, SUBSTRING_FOLDED_1, 5, 12)
  ) {
    return true
  }
  return containsSevereSlurWithPolicy(
    norm,
    (c) => c === 'g' || c === 'o',
    WHOLE_WORD_FOLDED_GO,
    SUBSTRING_FOLDED_GO,
    5,
    8,
  )
}

function containsTerm(folded: string, needle: string): boolean {
  if (needle.includes(' ') || [...needle].length >= 5) {
    const joined = folded.replaceAll(' ', '')
    return folded.includes(needle) || joined.includes(needle.replaceAll(' ', ''))
  }
  return folded.split(' ').some((w) => w === needle)
}

function containsPlain(text: string, needle: string): boolean {
  let idx = text.indexOf(needle)
  while (idx !== -1) {
    const before = idx > 0 ? text[idx - 1]! : ''
    const after = idx + needle.length < text.length ? text[idx + needle.length]! : ''
    const beforeAlnum = before ? /[\p{L}\p{N}]/u.test(before) : false
    const afterAlnum = after ? /[\p{L}\p{N}]/u.test(after) : false
    if (!beforeAlnum && !afterAlnum) return true
    idx = text.indexOf(needle, idx + 1)
  }
  return false
}

function collapseIntraWordSeparators(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => [...w].filter((c) => /[\p{L}\p{N}]/u.test(c)).join(''))
    .filter(Boolean)
    .join(' ')
}

export function hasBlockedWord(
  text: string,
  list: readonly string[],
  lookalikes: boolean,
): boolean {
  if (list.length === 0) return false
  const norm = normalizeChatTtsText(text)
  if (lookalikes) {
    const folded = foldWith(norm, () => false)
    const collapsed = foldWith(collapseIntraWordSeparators(norm), () => false)
    for (const rawTerm of list) {
      const needle = foldWith(rawTerm, () => false)
      if (!needle) continue
      if (containsTerm(folded, needle) || containsTerm(collapsed, needle)) return true
    }
    return false
  }
  const plain = norm.toLowerCase()
  for (const rawTerm of list) {
    const needle = normalizeChatTtsText(rawTerm).trim().toLowerCase()
    if (needle && containsPlain(plain, needle)) return true
  }
  return false
}

function squeezeRuns(word: string, max: number): string {
  let out = ''
  let last = ''
  let run = 0
  for (const ch of word) {
    run = ch === last ? run + 1 : 1
    last = ch
    if (run <= max) out += ch
  }
  return out
}

export function cleanChatTtsText(text: string, maxChars: number): string {
  const stripped = normalizeChatTtsText(text).replace(/[[\]<>]/g, ' ')
  const words = stripped
    .split(/\s+/)
    .filter((w) => w && !hasAnyLink(w) && !w.includes('@') && !isEmailToken(w))
    .map((w) => ((w.match(/\d/g)?.length ?? 0) >= 5 ? 'number' : squeezeRuns(w, 3)))
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
  let out = ''
  let outLen = 0
  for (const w of words) {
    const wLen = [...w].length
    const sep = outLen > 0 ? 1 : 0
    if (outLen + wLen + sep > maxChars) break
    if (outLen > 0) out += ' '
    out += w
    outLen += wLen + sep
  }
  return out
}
