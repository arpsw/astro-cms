/**
 * Enter-preview handshake — injected into consumer sites at `/preview/enter` by
 * the `arpCms()` integration (so every CMS site gets an identical, maintained
 * endpoint without copying route files).
 *
 * An editor opens `/preview/enter?token=<grant>&path=/some-page` from the CMS
 * admin's "Preview" action. `token` is normally a short-lived signed grant
 * minted by Laravel (so the long-lived secret never appears in a URL or admin
 * HTML); the raw preview token is also accepted as a fallback for scripted use.
 * We verify it, mint a signed, time-boxed httpOnly cookie, and redirect to the
 * page under `/preview/...`. The token only ever appears on this one bare
 * redirect (no body → can't leak via Referer); every later draft view is
 * authorized by the cookie via `verifyPreviewSession`.
 */
import type { APIRoute } from 'astro';
// Import the package's PUBLIC runtime (not relative modules): that entry is the
// one the integration marks `ssr.noExternal`, so the resolved config `define`
// is applied to it. This route stays a thin wrapper — correct regardless of
// whether Astro bundles or externalizes the injected route file itself.
import {
  createPreviewSession,
  isPreviewConfigured,
  previewCookieOptions,
  previewTokenMatches,
  verifyPreviewGrant,
  PREVIEW_COOKIE_NAME,
} from '@arpsw/astro-cms/runtime';

export const prerender = false;

/** Collapse an arbitrary `path` param to a safe, on-site `/preview/...` target. */
function safePreviewTarget(raw: string | null): string {
  let path = raw ?? '/';
  // Drop scheme + host if an absolute URL was passed.
  path = path.replace(/^https?:\/\/[^/]+/i, '');
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  // Collapse leading slashes so `//evil.com` can't become a protocol-relative
  // redirect off-site.
  path = path.replace(/^\/+/, '/');

  if (path === '/preview' || path.startsWith('/preview/')) {
    return path;
  }
  return path === '/' ? '/preview' : `/preview${path}`;
}

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (!isPreviewConfigured()) {
    return new Response('CMS preview is not configured.', { status: 503 });
  }

  const token = url.searchParams.get('token');
  const granted = previewTokenMatches(token) || (await verifyPreviewGrant(token));
  if (!granted) {
    return new Response('Invalid, expired, or missing preview token.', { status: 401 });
  }

  const session = await createPreviewSession();
  cookies.set(
    PREVIEW_COOKIE_NAME,
    session.value,
    previewCookieOptions(url.protocol === 'https:', session.maxAge),
  );

  return redirect(safePreviewTarget(url.searchParams.get('path')), 302);
};
