/**
 * `/api/purge` — cache-purge webhook, injected into consumer sites by the
 * `arpCms()` integration. The CMS calls it on publish / menu / global-block /
 * redirect / settings changes so the edge cache (populated by the package's
 * caching middleware) is invalidated and visitors see the change.
 *
 * `caches.default.delete()` only clears the local data centre, so a global purge
 * must go through Cloudflare's purge API — which also clears Cache-API entries,
 * since they live in the same edge cache.
 *
 * After a successful purge the edge cache is empty, so the next visitor to each
 * URL pays the full render. To avoid that, the route re-fetches the invalidated
 * URLs in the background (`ctx.waitUntil`) with the `x-arp-cache-warm` header, so
 * the caching middleware repopulates them before a real visitor arrives:
 *   - a targeted `{ urls }` purge warms exactly those URLs;
 *   - a purge-everything (e.g. on deploy) warms every page in `/sitemap.xml`.
 * URLs are warmed in one concurrent wave, up to a safety cap (MAX_WARM_URLS).
 * Warming runs in `ctx.waitUntil`, whose lifetime is bounded, so on a large site
 * some may not finish; those (and any past the cap) self-warm on first visit.
 * Warming is per-colo (it warms the data
 * centre the Worker runs in, not every Cloudflare colo) and needs
 * `ctx.waitUntil`, so it no-ops off Cloudflare.
 *
 * Auth: `Authorization: Bearer <PURGE_SECRET>`.
 * Body (all optional): `{ "everything": true }` | `{ "urls": [...] }` | `{ "tags": [...] }`.
 * Empty/absent body defaults to purge-everything (recommended for small sites).
 *
 * Required Worker secrets (set on the site's Worker):
 *   PURGE_SECRET   — shared secret the CMS sends
 *   CF_ZONE_ID     — the site's Cloudflare zone id
 *   CF_PURGE_TOKEN — CF API token with Zone · Cache Purge for that zone
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/** Warm request marker honoured by the caching middleware (force fresh render + store). */
const WARM_HEADER = 'x-arp-cache-warm';
/** Safety backstop on URLs warmed after a purge — bounds subrequests / waitUntil time. */
const MAX_WARM_URLS = 100;

interface CfExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface PurgeEnv {
  PURGE_SECRET?: string;
  CF_ZONE_ID?: string;
  CF_PURGE_TOKEN?: string;
}

interface PurgeBody {
  everything?: boolean;
  urls?: string[];
  tags?: string[];
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Constant-time string compare (avoids leaking the secret via timing). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * URLs to warm after a purge. A targeted `{ urls }` purge warms exactly those;
 * a purge-everything warms the homepage plus every page in `/sitemap.xml`.
 */
async function warmTargets(origin: string, body: PurgeBody): Promise<string[]> {
  if (body.urls?.length) {
    return [...new Set(body.urls)];
  }

  const urls = new Set<string>([`${origin}/`]);
  try {
    const res = await fetch(new URL('/sitemap.xml', origin).href);
    if (res.ok) {
      const xml = await res.text();
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(m[1]);
    }
  } catch {
    // No sitemap → just warm the homepage.
  }
  return [...urls];
}

/**
 * Warm all URLs in a single concurrent wave so they repopulate the cache as fast
 * as possible. Fired inside `ctx.waitUntil`, which has a bounded lifetime, so a
 * concurrent wave lets as many as possible finish before the runtime cuts it off;
 * anything that does not complete self-warms on first visit.
 */
async function warmAll(urls: string[]): Promise<void> {
  await Promise.allSettled(urls.map((u) => fetch(u, { headers: { [WARM_HEADER]: '1' } })));
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { PURGE_SECRET, CF_ZONE_ID, CF_PURGE_TOKEN } = env as unknown as PurgeEnv;

  if (!PURGE_SECRET || !CF_ZONE_ID || !CF_PURGE_TOKEN) {
    return json(503, { error: 'Purge endpoint not configured' });
  }

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !safeEqual(token, PURGE_SECRET)) {
    return json(401, { error: 'Unauthorized' });
  }

  let body: PurgeBody = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') body = parsed as PurgeBody;
  } catch {
    // No/invalid body → fall through to purge-everything.
  }

  const hasTargets = Boolean(body.urls?.length || body.tags?.length);
  const payload =
    body.everything || !hasTargets
      ? { purge_everything: true }
      : {
          ...(body.urls?.length ? { files: body.urls } : {}),
          ...(body.tags?.length ? { tags: body.tags } : {}),
        };

  const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CF_PURGE_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = (await cfRes.json().catch(() => ({}))) as { success?: boolean };
  if (!cfRes.ok || result.success === false) {
    return json(502, { error: 'Cloudflare purge failed', status: cfRes.status, result });
  }

  // Repopulate the invalidated URLs in the background so visitors hit a warm
  // cache. Needs the CF execution context (Cloudflare only); no-ops elsewhere.
  // Astro v6 exposes it as `locals.cfContext`; `locals.runtime.ctx` was removed
  // and now throws, so it must not be touched.
  const ctx = (locals as { cfContext?: CfExecutionContext }).cfContext;
  let warming = 0;
  let warmTruncated = false;
  if (ctx?.waitUntil) {
    const origin = new URL(request.url).origin;
    const found = await warmTargets(origin, body);
    const targets = found.slice(0, MAX_WARM_URLS);
    warming = targets.length;
    warmTruncated = found.length > targets.length;
    if (warmTruncated) {
      console.warn(
        `[purge] warming ${targets.length} of ${found.length} URLs (MAX_WARM_URLS); ` +
          `the rest self-warm on first visit`,
      );
    }
    ctx.waitUntil(warmAll(targets));
  }

  return json(200, { ok: true, purged: payload, warming, warmTruncated });
};
