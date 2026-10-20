import type { Media } from '@ferrocast/api'

/**
 * The URL a dashboard `<img>`/`<audio>` can load for a library file. The engine's
 * `Media.url` (`/api/v1/media/<id>`) needs the session, which an element can't send as a
 * header, so it goes through `mediaUrl` (session or phone ticket in the query). Only the
 * demo's inline `data:`/`blob:` files are used as they are.
 */
export function previewMediaUrl(
  client: { mediaUrl: (id: string) => string },
  media: readonly Media[] | null | undefined,
  id: string | null | undefined,
): string | null {
  if (!id) return null
  const url = media?.find((m) => m.id === id)?.url
  if (url && (url.startsWith('data:') || url.startsWith('blob:'))) return url
  return client.mediaUrl(id)
}
