/**
 * Edge-cache SSR HTML in the Cloudflare Worker — injected into consumer sites by
 * the `arpCms()` integration via `addMiddleware`.
 *
 * Cloudflare Workers run in front of the CDN cache, and a Worker's own generated
 * response is NOT stored by Cache Rules — so dashboard cache config does nothing
 * for CMS HTML. We cache it ourselves with the Workers Cache API (`caches.default`),
 * keyed by request URL; the stored TTL follows the response's `Cache-Control`
 * (the integration's `cache.page` default is `s-maxage=3600`). Content stays
 * near-instant because the CMS purges affected URLs on publish (via `/api/purge`),
 * and Cache-API entries live in the same edge cache, so they're purged too.
 *
 * Only plain, cookie-free, cacheable HTML 200s are stored; `/preview` and `/api`
 * are always bypassed (preview serves drafts + sends `no-store`; `/api/purge`
 * must never be cached). `caches.default` exists only in the Cloudflare runtime,
 * so any other adapter (and `astro dev`) transparently no-ops.
 */
import type { MiddlewareHandler } from 'astro';

/** Minimal structural types — avoids depending on ambient CF/DOM lib globals. */
interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}
interface CfExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { request } = context;
  const { pathname } = new URL(request.url);

  const cache = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;

  const bypass =
    request.method !== 'GET' || pathname.startsWith('/preview') || pathname.startsWith('/api');

  if (!cache || bypass) {
    return next();
  }

  const hit = await cache.match(request);
  if (hit) {
    // A response from `caches.default` has immutable headers. Astro's middleware
    // finalizer sets headers on whatever a middleware returns, which throws
    // ("Can't modify immutable headers") on a cached response. Reconstruct it so
    // the headers are a fresh, mutable copy the finalizer can write to.
    return new Response(hit.body, {
      status: hit.status,
      statusText: hit.statusText,
      headers: hit.headers,
    });
  }

  const response = await next();

  const cacheControl = response.headers.get('cache-control') ?? '';
  const contentType = response.headers.get('content-type') ?? '';
  const storable =
    response.status === 200 &&
    contentType.includes('text/html') &&
    !response.headers.has('set-cookie') &&
    cacheControl.includes('s-maxage=') &&
    !/no-store|private/.test(cacheControl);

  if (storable) {
    const cfContext = (context.locals as { cfContext?: CfExecutionContext }).cfContext;
    // cache.put throws on some non-cacheable responses — swallow so a caching
    // hiccup never breaks the actual page render.
    const put = cache.put(request, response.clone()).catch(() => {});
    if (cfContext?.waitUntil) {
      cfContext.waitUntil(put);
    } else {
      await put;
    }
  }

  return response;
};
