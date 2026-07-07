// Type-check only (not a build entry, so it is not published): the Cloudflare
// adapter resolves this virtual module at runtime. Declared so `tsc` can type
// the Worker env and the Workers Cache purge API used in routes/purge.ts.
declare module 'cloudflare:workers' {
  export const env: Record<string, string | undefined>;

  /** Workers Cache purge API (https://developers.cloudflare.com/workers/cache/purge/). */
  export const cache: {
    purge(
      options: { purgeEverything: true } | { tags?: string[]; pathPrefixes?: string[] },
    ): Promise<unknown>;
  };
}
