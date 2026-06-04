/**
 * Locale + path resolution and per-locale URL building, all driven by the
 * resolved config (locales, defaultLocale, websiteUrls).
 *
 * Locale display metadata (native names, RTL `dir`) is intentionally NOT here —
 * that's site UI data, owned by the consuming site's language switcher.
 */
import { config } from './config';
import type { Locale } from './types';

export function isLocale(value: string | undefined): value is Locale {
  return !!value && config.locales.includes(value);
}

/**
 * Local dev / single-domain mode: locale-prefixed path on the current origin.
 * The effective default locale never gets a prefix.
 */
export function localePath(locale: Locale, path: string = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === config.defaultLocale) {
    return clean;
  }
  return clean === '/' ? `/${locale}/` : `/${locale}${clean}`;
}

/**
 * Resolve a locale to a full origin URL when one is configured (WEBSITE_URL_*,
 * surfaced as `config.websiteUrls`). Returns undefined when the locale has no
 * URL set — caller should fall back to {@link localePath}.
 */
export function getLocaleSite(locale: Locale): URL | undefined {
  const raw = config.websiteUrls[locale];
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

/** Build the canonical URL for a locale + path (origin URL if set, else prefix). */
export function getLocaleUrl(locale: Locale, path: string = '/'): string {
  const site = getLocaleSite(locale);
  if (!site) {
    return localePath(locale, path);
  }
  const clean = path.startsWith('/') ? path : `/${path}`;
  const sitePrefix = site.pathname.replace(/\/+$/, '');
  return `${site.origin}${sitePrefix}${clean === '/' ? '' : clean}`;
}

/**
 * Resolve the href for a CMS link. Internal links carry `{locale, path}`, so we
 * build the per-locale URL from the local website config; external/manual links
 * (no locale/path) use their literal `url`.
 */
export function linkHref(link: {
  url?: string | null;
  locale?: Locale | null;
  path?: string | null;
}): string {
  if (link.locale && link.path != null && isLocale(link.locale)) {
    return getLocaleUrl(link.locale, link.path);
  }
  return link.url ?? '#';
}

/**
 * Strip the locale prefix from a request pathname, returning the CMS-facing
 * path. The CMS itself doesn't know about path prefixes — that's a routing
 * concern. Default-locale paths are returned unprefixed.
 */
export function stripLocalePrefix(pathname: string): { locale: Locale; path: string } {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];

  if (first && first !== config.defaultLocale && config.locales.includes(first)) {
    const rest = segments.slice(1).join('/');
    return { locale: first, path: rest === '' ? '/' : `/${rest}` };
  }

  return { locale: config.defaultLocale, path: pathname === '' ? '/' : pathname };
}

/**
 * Resolve both the active locale AND the CMS-facing path from the request.
 *
 *   1. Host match against `config.websiteUrls` (production: one origin/prefix
 *      per locale) — the host alone determines the locale; the prefix is then
 *      stripped to yield the logical path.
 *   2. Path-prefix fallback (`/sl/about` → sl, `/about`) — only when no host
 *      matches, i.e. dev/test where there's no per-locale domain.
 */
export function resolveLocaleAndPath(url: URL): { locale: Locale; path: string } {
  const requestHost = url.hostname.toLowerCase();
  const requestPath = url.pathname || '/';

  for (const code of config.locales) {
    const site = getLocaleSite(code);
    if (!site || site.hostname.toLowerCase() !== requestHost) {
      continue;
    }

    const sitePrefix = site.pathname.replace(/\/+$/, '');
    if (sitePrefix === '') {
      return { locale: code, path: requestPath };
    }
    if (requestPath === sitePrefix || requestPath.startsWith(sitePrefix + '/')) {
      return { locale: code, path: requestPath.slice(sitePrefix.length) || '/' };
    }
  }

  return stripLocalePrefix(requestPath);
}

/** Resolve just the active locale (same rules as {@link resolveLocaleAndPath}). */
export function resolveLocale(url: URL): Locale {
  return resolveLocaleAndPath(url).locale;
}
