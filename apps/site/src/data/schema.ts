// JSON-LD builders shared by pages. Company facts the owner has not confirmed yet are
// left out: search engines keep what they read, so only final values go in.
import { COMPANY, PRO, SITE, confirmed } from './company'

const a = COMPANY.address

/** Organization facts that are safe to publish now. */
export const orgFacts = () => ({
  '@id': `${COMPANY.url}/#org`,
  name: COMPANY.name,
  url: COMPANY.url,
  ...(confirmed('legalName') && { legalName: COMPANY.legalName }),
  ...(confirmed('email') && { email: COMPANY.email }),
  ...(confirmed('phone') && { telephone: COMPANY.phone }),
  ...(confirmed('address') && {
    address: {
      '@type': 'PostalAddress',
      streetAddress: a.street,
      addressLocality: a.city,
      addressRegion: a.region,
      postalCode: a.postalCode,
      addressCountry: a.countryCode,
    },
  }),
})

export const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  ...orgFacts(),
  logo: `${SITE.url}/icon-512.png`,
  sameAs: [COMPANY.github],
}

export const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${SITE.url}/#app`,
  name: 'Ferrocast',
  url: SITE.url,
  applicationCategory: 'MultimediaApplication',
  applicationSubCategory: 'Live streaming tools',
  operatingSystem: 'macOS, Windows, Linux',
  description:
    'Free, open-source, local-first companion app for streamers: alerts, overlays, merged chat, a chatbot and cross-platform moderation for Twitch, YouTube and Kick.',
  license: 'https://www.gnu.org/licenses/gpl-3.0.html',
  isAccessibleForFree: true,
  image: `${SITE.url}/og/home.png`,
  downloadUrl: `${SITE.url}/download/`,
  // The app is free; Pro adds the optional server-side extras, billed in rupees.
  offers: [
    { '@type': 'Offer', name: 'Ferrocast', price: '0', priceCurrency: 'INR' },
    {
      '@type': 'Offer',
      name: 'Ferrocast Pro, monthly',
      price: String(PRO.monthlyInr),
      priceCurrency: 'INR',
      url: `${SITE.url}/pricing/`,
    },
    {
      '@type': 'Offer',
      name: 'Ferrocast Pro, yearly',
      price: String(PRO.yearlyInr),
      priceCurrency: 'INR',
      url: `${SITE.url}/pricing/`,
    },
  ],
  sameAs: [COMPANY.github],
  publisher: {
    '@type': 'Organization',
    '@id': `${COMPANY.url}/#org`,
    name: COMPANY.name,
    url: COMPANY.url,
  },
  featureList: [
    'Alert box with variations, sounds and test buttons',
    'OBS overlays: alerts, chat, events, goals, labels, viewer count',
    'Merged chat for Twitch, YouTube and Kick',
    'Ban on every platform at once and hate-raid panic mode',
    'Chatbot with commands, timers and spam filters',
    'Tip page paid straight to the streamer',
    'Export everything in open formats',
  ],
}

export const faqPage = (items: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((i) => ({
    '@type': 'Question',
    name: i.q,
    acceptedAnswer: { '@type': 'Answer', text: i.a },
  })),
})

export const webPage = (name: string, url: string, description: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name,
  url,
  description,
  isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url },
  publisher: { '@type': 'Organization', '@id': `${COMPANY.url}/#org`, name: COMPANY.name },
})
