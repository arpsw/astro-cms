/**
 * Runtime entry (`@arpsw/astro-cms/runtime`) — import from pages/components.
 *
 * Re-exports the CMS client + i18n helpers, and adds `resolveRequest()`: the
 * one-call request handler a site's catch-all route uses. This module reads the
 * resolved config (injected by the integration as a Vite `define`), so it must
 * NOT be imported from `astro.config` (use the `.` entry — the integration —
 * there); the define is only applied to the app/runtime build.
 */
import { config } from './config';
import { CmsApiError, getMenu, resolvePath, resolvePathPreview } from './client';
import { resolveLocaleAndPath } from './i18n';
import type { Alternate, Locale, Menu, Resolved } from './types';

export interface ResolveRequestOptions {
  /** Hit the preview/draft endpoints (sets no-store + noindex). */
  preview?: boolean;
}

export interface ResolveRequestResult {
  /** Active locale resolved from host/path. */
  locale: Locale;
  /** CMS-facing logical path (locale prefix stripped). */
  path: string;
  /** The resolve envelope, or null if the CMS call errored. */
  resolved: Resolved | null;
  /**
   * Language variants of the resolved document (self included), hoisted from
   * `resolved.data.alternates` so consumers stay content-type-blind — pass
   * straight to `languageSwitchEntries(url, alternates)` and hreflang tags.
   * Null when nothing resolved or the CMS predates translation groups.
   */
  alternates: Alternate[] | null;
  /** The site nav menu (config.cms.menuSlug), or null if unavailable. */
  menu: Menu | null;
  /** Set when the CMS returned a redirect — the caller should `Astro.redirect`. */
  redirect: { to: string; code: number } | null;
  /** HTTP status that was set on the response. */
  status: number;
  /** Human-readable error message when the CMS call failed. */
  error: string | null;
}

interface RequestContext {
  url: URL;
  // `status` is optional to match Astro's `Astro.response` (number | undefined).
  response: { status?: number; headers: Headers };
}

/**
 * Resolve an incoming request end-to-end: locale/path → CMS `resolve` lookup →
 * nav menu → response status + edge `Cache-Control` headers. Returns the data
 * for the route to render; on a CMS redirect it returns `redirect` for the
 * caller to `return Astro.redirect(redirect.to, redirect.code)`.
 */
export async function resolveRequest(
  ctx: RequestContext,
  options: ResolveRequestOptions = {},
): Promise<ResolveRequestResult> {
  const { locale, path } = resolveLocaleAndPath(ctx.url);

  let resolved: Resolved | null = null;
  let error: string | null = null;
  let status = 200;

  try {
    resolved = options.preview
      ? await resolvePathPreview(path, locale)
      : await resolvePath(path, locale);
  } catch (e) {
    if (e instanceof CmsApiError) {
      error = `CMS API returned ${e.status}.`;
      status = 502;
    } else {
      error = e instanceof Error ? e.message : 'Unknown error.';
      status = 500;
    }
  }

  if (resolved?.type === 'redirect') {
    ctx.response.headers.set('Cache-Control', config.cache.page);
    return {
      locale,
      path,
      resolved,
      alternates: null,
      menu: null,
      redirect: { to: resolved.to, code: resolved.code },
      status,
      error,
    };
  }

  let menu: Menu | null = null;
  try {
    menu = await getMenu(config.cms.menuSlug, locale);
  } catch {
    // Non-fatal — render without a nav menu.
  }

  if (resolved?.type === 'not_found') {
    status = 404;
  }
  ctx.response.status = status;

  ctx.response.headers.set('Cache-Control', cacheHeaderFor(resolved, error, options.preview));
  if (options.preview) {
    ctx.response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return {
    locale,
    path,
    resolved,
    alternates: alternatesFrom(resolved),
    menu,
    redirect: null,
    status,
    error,
  };
}

/**
 * Hoist `alternates` off the resolved document, whatever its content type —
 * page, post, or a module content type (`case_study`, ...). Defensive: an
 * older CMS without translation groups simply yields null.
 */
function alternatesFrom(resolved: Resolved | null): Alternate[] | null {
  if (!resolved || !('data' in resolved)) return null;

  const alternates = (resolved.data as { alternates?: unknown }).alternates;

  return Array.isArray(alternates) ? (alternates as Alternate[]) : null;
}

function cacheHeaderFor(
  resolved: Resolved | null,
  error: string | null,
  preview?: boolean,
): string {
  if (preview) return config.cache.preview;
  if (error || !resolved) return config.cache.error;
  if (resolved.type === 'page' || resolved.type === 'post') return config.cache.page;
  if (resolved.type === 'not_found') return config.cache.notFound;
  return config.cache.error;
}

export { config } from './config';
export * from './client';
export * from './i18n';
export * from './media';
export * from './preview';
export type * from './types';
