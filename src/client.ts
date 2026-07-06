/**
 * Typed client for the ARP CMS API. Connection + site come from the resolved
 * config (injected by the integration as a Vite `define`); every content endpoint is scoped to the site via
 * `/api/cms/v1/sites/{site}`.
 */
import { config } from './config';
import type {
  GlobalBlockResult,
  Locale,
  Menu,
  Page,
  PageListItem,
  PaginatedResponse,
  Post,
  RedirectEnvelope,
  Region,
  Resolved,
  SiteConfig,
  SitemapEntry,
  Webform,
} from './types';

const API_PREFIX = `/api/cms/v1/sites/${encodeURIComponent(config.cms.site)}`;

export class CmsNotFoundError extends Error {
  constructor(public readonly endpoint: string) {
    super(`CMS resource not found: ${endpoint}`);
    this.name = 'CmsNotFoundError';
  }
}

export class CmsApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    message: string,
  ) {
    super(`CMS API error (${status}) on ${endpoint}: ${message}`);
    this.name = 'CmsApiError';
  }
}

interface FetchOptions {
  locale?: Locale;
  query?: Record<string, string | number | undefined>;
  preview?: boolean;
}

async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = new URL(`${API_PREFIX}${path}`, config.cms.baseUrl);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.locale) {
    headers['Accept-Language'] = options.locale;
    // Also send locale as a query param. The CMS's cached read routes are
    // wrapped in Spatie ResponseCache, which hashes by URL+method but not by
    // headers — relying on Accept-Language alone causes cross-locale cache
    // poisoning. ?locale=… makes the cache key vary by locale, and the API's
    // ResolvesApiLocale concern already honours the query param explicitly.
    if (!url.searchParams.has('locale')) {
      url.searchParams.set('locale', options.locale);
    }
  }

  if (options.preview) {
    const token = config.cms.previewToken;
    if (!token) {
      throw new Error('CMS preview token is not set (arpCms({ previewToken }))');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url.toString(), { headers });

  if (response.status === 404) {
    throw new CmsNotFoundError(url.pathname);
  }

  if (!response.ok) {
    throw new CmsApiError(url.pathname, response.status, await response.text());
  }

  return response.json() as Promise<T>;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

// --- Pages -----------------------------------------------------------------

export async function getHomepage(locale: Locale): Promise<Page> {
  return unwrap(await fetchJson<{ data: Page }>('/pages/_homepage', { locale }));
}

// --- Resolver --------------------------------------------------------------
//
// One call per incoming URL. Laravel decides whether the path is a redirect, a
// page, a post, or 404. The catch-all switches on the envelope's .type.

export async function resolvePath(path: string, locale: Locale): Promise<Resolved> {
  try {
    return await fetchJson<Resolved>('/resolve', { locale, query: { path } });
  } catch (e) {
    if (e instanceof CmsNotFoundError) {
      return { type: 'not_found' };
    }
    throw e;
  }
}

export async function resolvePathPreview(path: string, locale: Locale): Promise<Resolved> {
  try {
    return await fetchJson<Resolved>('/preview/resolve', {
      locale,
      query: { path },
      preview: true,
    });
  } catch (e) {
    if (e instanceof CmsNotFoundError) {
      return { type: 'not_found' };
    }
    throw e;
  }
}

// --- Preview (draft) -------------------------------------------------------

export async function getHomepagePreview(locale: Locale): Promise<Page> {
  return unwrap(
    await fetchJson<{ data: Page }>('/preview/pages/_homepage', { locale, preview: true }),
  );
}

export async function getPagePreview(path: string, locale: Locale): Promise<Page> {
  const normalized = path.replace(/^\/+/, '');
  return unwrap(
    await fetchJson<{ data: Page }>(`/preview/pages/${normalized}`, { locale, preview: true }),
  );
}

export async function getPostPreview(slug: string, locale: Locale): Promise<Post> {
  return unwrap(
    await fetchJson<{ data: Post }>(`/preview/posts/${slug}`, { locale, preview: true }),
  );
}

export type PageOrRedirect =
  | { kind: 'page'; page: Page }
  | { kind: 'redirect'; to: string; type: number };

export async function getPage(path: string, locale: Locale): Promise<PageOrRedirect> {
  const normalized = path.replace(/^\/+/, '');
  const payload = await fetchJson<{ data: Page } | RedirectEnvelope>(`/pages/${normalized}`, {
    locale,
  });

  if ('redirect' in payload) {
    return { kind: 'redirect', to: payload.redirect.to, type: payload.redirect.type };
  }

  return { kind: 'page', page: unwrap(payload) };
}

export async function listPages(
  locale: Locale,
  perPage = 100,
): Promise<PaginatedResponse<PageListItem>> {
  return fetchJson<PaginatedResponse<PageListItem>>('/pages', {
    locale,
    query: { per_page: perPage },
  });
}

// --- Posts -----------------------------------------------------------------

export async function listPosts(
  locale: Locale,
  perPage = 25,
  page = 1,
): Promise<PaginatedResponse<Post>> {
  return fetchJson<PaginatedResponse<Post>>('/posts', {
    locale,
    query: { per_page: perPage, page },
  });
}

export async function getPost(slug: string, locale: Locale): Promise<Post> {
  return unwrap(await fetchJson<{ data: Post }>(`/posts/${slug}`, { locale }));
}

// --- Menus -----------------------------------------------------------------

export async function getMenu(slug: string, locale: Locale): Promise<Menu> {
  return unwrap(await fetchJson<{ data: Menu }>(`/menus/${slug}`, { locale }));
}

// --- Site config -------------------------------------------------------------

/**
 * The site's live runtime config. Unlike the integration options (baked at
 * build time), this reflects the CMS NOW — use it for values that must change
 * without a rebuild, e.g. the per-locale custom scripts the layout injects.
 */
export async function getConfig(): Promise<SiteConfig> {
  return fetchJson<SiteConfig>('/config');
}

// --- Sitemap inventory --------------------------------------------------------

/**
 * Every published, routable record of the site (pages, posts, module content
 * types) with absolute URL + lastmod. The injected `/sitemap.xml` route turns
 * this into the actual sitemap; exposed for sites that want a custom one.
 */
export async function getSitemapInventory(): Promise<SitemapEntry[]> {
  return unwrap(await fetchJson<{ data: SitemapEntry[] }>('/sitemap'));
}

// --- Named content: regions & global blocks ---------------------------------
//
// Regions are declared frontend slots (footer, announcement bar) filled with
// shared "global blocks" in the CMS. The payload's `blocks` array has the same
// shape as a page's, so render it with the same block components.

export async function getRegion(slug: string, locale: Locale): Promise<Region> {
  return unwrap(await fetchJson<{ data: Region }>(`/regions/${slug}`, { locale }));
}

export async function getGlobalBlock(slug: string, locale: Locale): Promise<GlobalBlockResult> {
  return unwrap(await fetchJson<{ data: GlobalBlockResult }>(`/global-blocks/${slug}`, { locale }));
}

// --- Webforms --------------------------------------------------------------

export async function getWebform(slug: string, locale: Locale): Promise<Webform> {
  return unwrap(await fetchJson<{ data: Webform }>(`/webforms/${slug}`, { locale }));
}

export interface WebformSubmitInput {
  slug: string;
  locale: Locale;
  payload: Record<string, unknown>;
}

export async function submitWebform({
  slug,
  locale,
  payload,
}: WebformSubmitInput): Promise<unknown> {
  const url = new URL(`${API_PREFIX}/webforms/${slug}/submit`, config.cms.baseUrl);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': locale,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new CmsApiError(url.pathname, response.status, await response.text());
  }

  return response.json();
}
