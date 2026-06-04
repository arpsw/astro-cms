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
 * URL prefix configured for a content type in a locale (e.g. `post` → `blog`),
 * from `config.contentTypePaths` (Site settings → `/config` `content_type_paths`).
 * Returns undefined when unset — Page has no prefix (it lives at the site root).
 */
export function contentTypePath(type: string, locale: Locale): string | undefined {
  return config.contentTypePaths[type]?.[locale] ?? undefined;
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

/** True when the locale is configured (in `localeMeta`) as right-to-left. */
export function isRTL(locale: Locale): boolean {
  return (config.localeMeta[locale]?.dir ?? 'ltr') === 'rtl';
}

/**
 * UI-strings translation mechanism. The package owns the *shape*; the site owns
 * the *content*. Pass a per-locale dictionary; get a `(locale) => strings`
 * lookup that falls back to the default locale then the first entry.
 *
 *   // site src/i18n.ts
 *   export const t = makeTranslator({ en: { cta: 'Contact' }, sl: { cta: 'Kontakt' } });
 *   // component: const s = t(locale); s.cta
 */
export function makeTranslator<T>(dictionary: Partial<Record<string, T>>): (locale: Locale) => T {
  return (locale: Locale): T =>
    dictionary[locale] ?? dictionary[config.defaultLocale] ?? Object.values(dictionary)[0]!;
}

export interface LanguageSwitchEntry {
  locale: Locale;
  /** Uppercase code from localeMeta (EN), or the upper-cased locale. */
  code: string;
  /** Endonym from localeMeta, or the locale code. */
  native: string;
  href: string;
  hreflang: string;
  isActive: boolean;
}

/**
 * One entry per configured locale, each linking to the equivalent path in that
 * locale (host/prefix-aware). Labels come from `localeMeta` (passed to
 * `arpCms({ localeMeta })`); missing metadata falls back to the locale code.
 */
export function languageSwitchEntries(currentUrl: URL): LanguageSwitchEntry[] {
  const { locale: currentLocale, path: logicalPath } = resolveLocaleAndPath(currentUrl);

  return config.locales.map((l) => {
    const site = getLocaleSite(l);
    const href = site
      ? `${site.origin}${site.pathname.replace(/\/+$/, '')}${logicalPath === '/' ? '' : logicalPath}`
      : localePath(l, logicalPath);
    const meta = config.localeMeta[l];

    return {
      locale: l,
      code: meta?.code ?? l.toUpperCase(),
      native: meta?.native ?? l,
      href,
      hreflang: l,
      isActive: l === currentLocale,
    };
  });
}
