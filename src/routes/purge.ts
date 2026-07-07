/**
 * `/api/purge` — cache-purge webhook, injected into consumer sites by the
 * `arpCms()` integration. The CMS calls it on publish / menu / global-block /
 * redirect / settings changes so the edge cache is invalidated and visitors
 * see the change.
 *
 * The edge cache is Cloudflare Workers Cache (`cache.enabled` in the site's
 * wrangler config): Cloudflare caches the Worker's responses per their
 * Cache-Control headers and serves hits without invoking the Worker. This
 * route purges that cache in-process via `cache.purge()` from
 * `cloudflare:workers`. No zone credentials are needed; the Worker owns its
 * cache. Invalidation is global (all tiers/colos), and the cache is
 * partitioned by Worker version, so deploys invalidate automatically.
 *
 * Auth: `Authorization: Bearer <PURGE_SECRET>`.
 * Body (all optional): `{ "everything": true }` | `{ "urls": [...] }` | `{ "tags": [...] }`.
 * Empty/absent body defaults to purge-everything (recommended for small sites).
 * `urls` are mapped to their pathnames and purged as path prefixes, which can
 * over-purge (a purged path also drops its sub-paths; purging `/` drops all).
 * Over-purging is safe: it re-renders, never serves stale.
 *
 * Required Worker secret: PURGE_SECRET (the shared secret the CMS sends).
 */
import type { APIRoute } from 'astro';
import { env, cache } from 'cloudflare:workers';

export const prerender = false;

interface PurgeEnv {
  PURGE_SECRET?: string;
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

/** Map reported URLs to unique pathnames (Workers Cache purges by path prefix). */
function toPathPrefixes(urls: string[]): string[] {
  const paths = new Set<string>();
  for (const u of urls) {
    try {
      paths.add(new URL(u).pathname);
    } catch {
      // Not an absolute URL; accept a bare path, ignore anything else.
      if (u.startsWith('/')) paths.add(u);
    }
  }
  return [...paths];
}

export const POST: APIRoute = async ({ request }) => {
  const { PURGE_SECRET } = env as unknown as PurgeEnv;

  if (!PURGE_SECRET) {
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

  const pathPrefixes = body.urls?.length ? toPathPrefixes(body.urls) : [];
  const tags = body.tags ?? [];
  const hasTargets = pathPrefixes.length > 0 || tags.length > 0;
  // Purging `/` is purge-everything by prefix; collapse to the explicit mode.
  const everything = Boolean(body.everything) || !hasTargets || pathPrefixes.includes('/');

  const options = everything
    ? { purgeEverything: true as const }
    : {
        ...(pathPrefixes.length ? { pathPrefixes } : {}),
        ...(tags.length ? { tags } : {}),
      };

  try {
    await cache.purge(options);
  } catch (err) {
    // Most likely Workers Cache is not enabled on this Worker (`cache.enabled`),
    // or the runtime does not support it (e.g. not on Cloudflare).
    return json(502, {
      error: 'Cache purge failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return json(200, { ok: true, purged: options });
};
