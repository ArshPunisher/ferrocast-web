// Cloudflare Pages Function: /dl/v<version>/<file> serves a Ferrocast release download
// through Cloudflare's cache. GitHub's release downloads can crawl in some regions (India:
// ~0.4 MB/s where Cloudflare gives 10 MB/s), so the update feed and the download page point
// here. Only files of a tagged release are served, and the app still checks every update's
// signature, so the mirror can't change what gets installed.

const REPO = 'https://github.com/ArshPunisher/ferrocast/releases/download'
const TAG = /^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/
const FILE = /^[A-Za-z0-9._+-]+\.(?:tar\.gz|sig|dmg|exe|msi|AppImage|deb|rpm|zip|txt)$/
const YEAR = 31_536_000

export async function onRequest({ request, params, waitUntil }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  const parts = Array.isArray(params.path) ? params.path : []
  const [tag, file] = parts
  if (parts.length !== 2 || !TAG.test(tag) || !FILE.test(file)) {
    return new Response('Not found', { status: 404 })
  }
  const origin = `${REPO}/${tag}/${file}`
  // Cached under the stable GitHub address, so every visitor after the first gets
  // Cloudflare's copy without asking GitHub at all.
  const key = new Request(origin)
  const cache = caches.default
  let res = await cache.match(key)
  if (!res) {
    // GitHub answers with a redirect to a short-lived signed address.
    const hop = await fetch(origin, { redirect: 'manual' })
    const target = hop.status >= 300 && hop.status < 400 ? hop.headers.get('Location') : null
    if (!target) {
      return new Response(hop.status === 404 ? 'Not found' : 'Download unavailable', {
        status: hop.status === 404 ? 404 : 502,
      })
    }
    const got = await fetch(target)
    if (!got.ok || !got.body) return new Response('Download unavailable', { status: 502 })
    res = new Response(got.body, { status: 200, headers: headersFor(got.headers, file) })
    waitUntil(cache.put(key, res.clone()))
  }
  return request.method === 'HEAD' ? new Response(null, { status: 200, headers: res.headers }) : res
}

function headersFor(from, file) {
  const headers = new Headers()
  for (const h of ['Content-Length', 'ETag', 'Last-Modified']) {
    const v = from.get(h)
    if (v) headers.set(h, v)
  }
  headers.set('Content-Type', 'application/octet-stream')
  headers.set('Content-Disposition', `attachment; filename="${file}"`)
  headers.set('Cache-Control', `public, max-age=${YEAR}, immutable`)
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}
