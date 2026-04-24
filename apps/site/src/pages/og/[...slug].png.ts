import type { APIRoute, GetStaticPaths } from 'astro'
import { PAGES, ogSlug } from '../../data/pages'
import { renderCard } from '../../lib/card'

export const getStaticPaths: GetStaticPaths = () =>
  Object.values(PAGES).map((p) => ({
    params: { slug: ogSlug(p.path) },
    props: { title: p.ogTitle, kicker: p.ogKicker },
  }))

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard({ title: String(props.title), kicker: String(props.kicker) })
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } })
}
