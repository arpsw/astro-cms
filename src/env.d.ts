// Type-check only (not a build entry, so it is not published): the Cloudflare
// adapter resolves this virtual module at runtime. Declared so `tsc` can type
// the Worker env and the Workers Cache purge API used in routes/purge.ts.
declare module 'cloudflare:workers' {
  export const env: Record<string, string | undefined>;

  type CacheSelector = { purgeEverything: true } | { tags?: string[]; pathPrefixes?: string[] };

  /** Workers Cache purge API (https://developers.cloudflare.com/workers/cache/purge/). */
  export const cache: {
    /** Delete matching entries. */
    purge(options: CacheSelector): Promise<unknown>;
    /** Mark matching entries stale (soft purge); same selectors as `purge()`. */
    invalidate(options: CacheSelector): Promise<unknown>;
  };
}
