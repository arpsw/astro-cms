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

export const POST: APIRoute = async ({ request }) => {
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

  return json(200, { ok: true, purged: payload });
};
