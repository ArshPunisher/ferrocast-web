// Every company fact the site prints, in one place. Legal pages, the contact page, the
// footer and the JSON-LD read from here.
//
// Confirmed by the owner on 17 October 2026 against the Udyam registration certificate
// (UDYAM-PB-01-0155844). Razorpay checks that the legal name, address and contact details
// on these pages match the KYC documents exactly, so change them only together with KYC.
// A field that ever needs re-checking goes back into UNCONFIRMED; the build lists them.

export const COMPANY = {
  /** Brand name used in copy. */
  name: 'ClearCraft Labs',
  /** Registered legal name exactly as on PAN / GST / bank KYC. */
  legalName: 'ClearCraft Labs',
  /** Type of entity, written as it reads mid-sentence. */
  entityType: 'sole proprietorship',
  /** The proprietor, exactly as on PAN. */
  proprietor: 'Arshdeep Singh',
  /** MSME (Udyam) registration. */
  udyam: 'UDYAM-PB-01-0155844',
  url: 'https://clearcraftlabs.com',
  /** Support inbox. */
  email: 'hello@clearcraftlabs.com',
  /** Inbox for privacy and data requests. */
  privacyEmail: 'privacy@clearcraftlabs.com',
  /** Inbox for billing, refunds and cancellations (the support inbox for now). */
  billingEmail: 'hello@clearcraftlabs.com',
  /** Support phone, as on the Udyam certificate. */
  phone: '+91 70877 95553',
  /** Registered business address (contact, terms, privacy, refunds). */
  address: {
    street: 'Jandiala Guru',
    city: 'Amritsar',
    region: 'Punjab',
    postalCode: '143115',
    country: 'India',
    countryCode: 'IN',
  },
  /** GSTIN, or null when not registered for GST (not registered: below the threshold). */
  gstin: null as string | null,
  /** Grievance officer required by India's IT Rules and DPDP Act. */
  grievanceOfficer: {
    name: 'Arshdeep Singh',
    email: 'privacy@clearcraftlabs.com',
    /** E-Commerce Rules 2020: acknowledge within 48 hours, resolve within one month. */
    ackHours: 48,
    resolveDays: 30,
  },
  /** Courts for disputes. */
  jurisdiction: 'the courts at Amritsar, Punjab',
  /** Working days we answer within. */
  responseDays: 3,
  github: 'https://github.com/ArshPunisher/ferrocast',
  githubWeb: 'https://github.com/ArshPunisher/ferrocast-web',
  /** Date the legal pages were last changed. */
  legalUpdated: '22 October 2026',
  legalUpdatedIso: '2026-10-22',
} as const

export type CompanyField = keyof typeof COMPANY

/**
 * Fields still waiting for the owner. Unconfirmed fields never go into JSON-LD; the
 * address, GSTIN and phone are not printed on pages until confirmed.
 */
export const UNCONFIRMED: ReadonlySet<CompanyField> = new Set<CompanyField>([])

export const confirmed = (field: CompanyField): boolean => !UNCONFIRMED.has(field)

export const SITE = {
  url: 'https://ferrocast.clearcraftlabs.com',
  name: 'Ferrocast',
  tagline: 'Free stream tools that run on your PC',
} as const

/** Rupee amount as people write it in India: ₹1,999. */
/** How tax reads next to a price, from the GSTIN above. */
export const taxNote = (): string =>
  COMPANY.gstin
    ? 'The price includes GST, with no other charges.'
    : 'We are not registered for GST (our turnover is below the limit), so no GST is added: the price shown is the full price, with no other charges.'

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
