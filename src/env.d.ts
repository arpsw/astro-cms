// Type-check only (not a build entry, so it is not published): the Cloudflare
// adapter resolves this virtual module at runtime, and Astro v6 exposes Worker
// secrets through it. Declared so `tsc` can type `env` in routes/purge.ts.
declare module 'cloudflare:workers' {
  export const env: Record<string, string | undefined>;
}
