// Every company fact the site prints, in one place. Legal pages, the contact page, the
// footer and the JSON-LD read from here.
//
// TODO(owner): every field listed in UNCONFIRMED must be confirmed before the site goes
// live and before applying for Razorpay. Razorpay checks that the legal name, address and
// contact details on these pages match the KYC documents exactly. Once a value is final,
// remove its key from UNCONFIRMED. The build prints the fields still waiting.

export const COMPANY = {
  /** Brand name used in copy. */
  name: 'ClearCraft Labs',
  /** Registered legal name exactly as on PAN / GST / bank KYC. */
  legalName: 'ClearCraft Labs',
  /** Type of entity, written as it reads mid-sentence. */
  entityType: 'sole proprietorship',
  url: 'https://clearcraftlabs.com',
  /** Support inbox. */
  email: 'hello@clearcraftlabs.com',
  /** Inbox for privacy and data requests. */
  privacyEmail: 'privacy@clearcraftlabs.com',
  /** Inbox for billing, refunds and cancellations. */
  billingEmail: 'billing@clearcraftlabs.com',
  /** Support phone in E.164 form. Shown only once confirmed. */
  phone: '+91 00000 00000',
  /** Registered business address (contact, terms, privacy, refunds). */
  address: {
    street: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'India',
    countryCode: 'IN',
  },
  /** GSTIN, or null when not registered for GST. */
  gstin: null as string | null,
  /** Grievance officer required by India's IT Rules and DPDP Act. */
  grievanceOfficer: {
    name: 'Grievance Officer, ClearCraft Labs',
    email: 'grievance@clearcraftlabs.com',
  },
  /** Courts for disputes. */
  jurisdiction: 'the courts of India',
  /** Working days we answer within. */
  responseDays: 3,
  github: 'https://github.com/ArshPunisher/ferrocast',
  githubWeb: 'https://github.com/ArshPunisher/ferrocast-web',
  /** Date the legal pages were last changed. */
  legalUpdated: '17 October 2026',
  legalUpdatedIso: '2026-10-17',
} as const

export type CompanyField = keyof typeof COMPANY

/**
 * Fields still waiting for the owner. Unconfirmed fields never go into JSON-LD; the
 * address, GSTIN and phone are not printed on pages until confirmed.
 */
export const UNCONFIRMED: ReadonlySet<CompanyField> = new Set<CompanyField>([
  'legalName',
  'entityType',
  'email',
  'privacyEmail',
  'billingEmail',
  'phone',
  'address',
  'gstin',
  'grievanceOfficer',
  'jurisdiction',
])

export const confirmed = (field: CompanyField): boolean => !UNCONFIRMED.has(field)

export const SITE = {
  url: 'https://ferrocast.clearcraftlabs.com',
  name: 'Ferrocast',
  tagline: 'Free stream tools that run on your PC',
} as const

/** Rupee amount as people write it in India: ₹1,999. */
export const inr = (n: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)

/** Pro pricing (R-68: India first, billed in INR). USD values are approximate. */
export const PRO = {
  monthlyInr: 199,
  yearlyInr: 1999,
  monthlyUsdApprox: '2.40',
  yearlyUsdApprox: '24',
} as const
