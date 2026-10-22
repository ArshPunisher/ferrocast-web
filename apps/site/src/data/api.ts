// Ferrocast's server for sign-in and the web dashboard (plan §9: the dashboard and website
// share ferrocast.clearcraftlabs.com; sign-in and live data stay on the API host, reached
// through the server's Cloudflare Tunnel). The build can point it elsewhere for testing.
export const API_ORIGIN: string =
  // `import.meta.env` is Vite's; plain Node (the browser tests) has none.
  (import.meta.env?.PUBLIC_FC_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') ??
  'https://api.clearcraftlabs.com'
