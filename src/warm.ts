/**
 * Edge-cache warmer (`@arpsw/astro-cms/warm`).
 *
 * Workers Cache has no pre-populate API: a page is cached only after it has
 * been served once, and each Worker version starts with an empty cache. This
 * module requests the URLs listed in the site's `/sitemap.xml` so visitors and
 * crawlers find them cached. One request per URL from anywhere is enough: the
 * cache is tiered, so it fills the shared upper tier every location reads from.
 *
 * Two ways to run it:
 * - `createScheduledWarmer()` as the Worker's `scheduled` handler (Cron
 *   Trigger). Each run warms one slice of the sitemap (`perRun` URLs, default
 *   45) and rotates through the slices, so it fits the Workers Free plan's 50
 *   subrequests per invocation.
 * - The `astro-cms-warm <siteUrl>` CLI after a deploy (e.g. chained to the
 *   Workers Builds deploy command), which warms the whole sitemap at once.
 *
 * Cached pages are answered by the edge without running the Worker, so a warm
 * run only renders the pages that are actually missing.
 */

export interface WarmOptions {
  /** Site origin, e.g. `https://arp.software`. Its `/sitemap.xml` lists the URLs. */
  siteUrl: string;
  /** Parallel requests. Default 6. */
  concurrency?: number;
  /**
   * Warm one slice per run instead of everything: the sitemap is split into
   * slices of `perRun` URLs and `tick` (any counter that advances between runs)
   * picks the slice.
   */
  rotate?: { perRun: number; tick: number };
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** `fetch` implementation; defaults to the global one. */
  fetch?: typeof fetch;
  /** User-Agent sent with every request. */
  userAgent?: string;
}

export interface WarmResult {
  /** URLs found in the sitemap. */
  total: number;
  /** URLs requested in this run. */
  requested: number;
  /** Already cached (`cf-cache-status: HIT`). */
  cached: number;
  /** Rendered or refreshed by this run (any other 2xx). */
  warmed: number;
  /** Non-2xx responses and network errors. */
  failed: Array<{ url: string; status: number | string }>;
  /** Slice warmed in this run, when rotating. */
  slice?: { index: number; count: number };
  durationMs: number;
}

const DEFAULT_USER_AGENT = 'astro-cms-warm/1.0 (+https://www.npmjs.com/package/@arpsw/astro-cms)';
const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
const MAX_SITEMAPS = 20;

const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Page URLs listed in the site's sitemap. Follows a sitemap index one level
 * down and keeps only URLs on the site's own origin.
 */
export async function sitemapUrls(
  siteUrl: string,
  options: Pick<WarmOptions, 'fetch' | 'userAgent' | 'timeoutMs'> = {},
): Promise<string[]> {
  const fetchImpl = options.fetch ?? fetch;
  const origin = new URL(siteUrl).origin;
  const queue = [`${origin}/sitemap.xml`];
  const seen = new Set<string>();
  const urls = new Set<string>();

  while (queue.length && seen.size < MAX_SITEMAPS) {
    const sitemap = queue.shift()!;
    if (seen.has(sitemap)) continue;
    seen.add(sitemap);

    const res = await fetchImpl(sitemap, {
      headers: { 'user-agent': options.userAgent ?? DEFAULT_USER_AGENT },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new Error(`Sitemap ${sitemap} returned ${res.status}`);

    const xml = await res.text();
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    for (const match of xml.matchAll(LOC)) {
      const url = decodeXml(match[1]!);
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }
      if (parsed.origin !== origin) continue;
      if (isIndex) queue.push(parsed.href);
      else urls.add(parsed.href);
    }
  }

  return [...urls];
}

/** Request every sitemap URL (or one rotating slice of them). */
export async function warmSitemap(options: WarmOptions): Promise<WarmResult> {
  const started = Date.now();
  const fetchImpl = options.fetch ?? fetch;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 30_000;

  const all = await sitemapUrls(options.siteUrl, { fetch: fetchImpl, userAgent, timeoutMs });

  let urls = all;
  let slice: WarmResult['slice'];
  if (options.rotate && all.length) {
    const perRun = Math.max(1, Math.floor(options.rotate.perRun));
    const count = Math.ceil(all.length / perRun);
    const index = ((Math.floor(options.rotate.tick) % count) + count) % count;
    urls = all.slice(index * perRun, (index + 1) * perRun);
    slice = { index, count };
  }

  const result: WarmResult = {
    total: all.length,
    requested: urls.length,
    cached: 0,
    warmed: 0,
    failed: [],
    ...(slice ? { slice } : {}),
    durationMs: 0,
  };

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < urls.length) {
      const url = urls[next++]!;
      try {
        const res = await fetchImpl(url, {
          headers: { 'user-agent': userAgent, accept: 'text/html,*/*;q=0.8' },
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
        // Read the body so the full response is produced and stored.
        await res.arrayBuffer();
        if (res.status >= 200 && res.status < 300) {
          if (res.headers.get('cf-cache-status') === 'HIT') result.cached++;
          else result.warmed++;
        } else {
          result.failed.push({ url, status: res.status });
        }
      } catch (err) {
        result.failed.push({ url, status: err instanceof Error ? err.message : String(err) });
      }
    }
  };

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, urls.length || 1));
  await Promise.all(Array.from({ length: concurrency }, worker));

  result.durationMs = Date.now() - started;
  return result;
}

export interface ScheduledWarmerOptions {
  /** Site origin whose sitemap is warmed. */
  siteUrl: string;
  /**
   * URLs per run. Default 45, which with the sitemap request stays under the
   * Workers Free plan's 50 subrequests per invocation. Raise it on a paid plan.
   */
  perRun?: number;
  /**
   * Minutes between Cron Trigger runs; used to advance the slice. Match it to
   * the cron schedule. Default 10.
   */
  intervalMinutes?: number;
  /** Parallel requests. Default 6. */
  concurrency?: number;
}

/**
 * A Worker `scheduled` handler that warms one slice of the sitemap per run.
 *
 * ```ts
 * // src/worker.ts (wrangler `main`), with `triggers.crons: ["*\/10 * * * *"]`
 * import { handle } from '@astrojs/cloudflare/handler';
 * import { createScheduledWarmer } from '@arpsw/astro-cms/warm';
 *
 * export default {
 *   fetch: handle,
 *   scheduled: createScheduledWarmer({ siteUrl: 'https://example.com' }),
 * };
 * ```
 */
export function createScheduledWarmer(options: ScheduledWarmerOptions) {
  const intervalMs = Math.max(1, options.intervalMinutes ?? 10) * 60_000;
  return async (controller: { scheduledTime: number }): Promise<void> => {
    const result = await warmSitemap({
      siteUrl: options.siteUrl,
      concurrency: options.concurrency,
      rotate: {
        perRun: options.perRun ?? 45,
        tick: Math.floor(controller.scheduledTime / intervalMs),
      },
    });
    console.log(JSON.stringify({ event: 'astro-cms-warm', ...result }));
  };
}
