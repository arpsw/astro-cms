/**
 * Public options for the `arpCms()` integration, and the resolved, serializable
 * config shape that gets exposed to runtime code via `virtual:arp-cms`.
 *
 * The integration runs in the consumer's `astro.config` (Node, before Vite), so
 * the site passes config explicitly here — typically wired from its own `.env`.
 */

/** Per-locale display metadata for the language switcher + `<html dir>`. */
export interface LocaleMeta {
  /** Short uppercase code shown in the picker (EN, SL). */
  code: string;
  /** Endonym — the language's name in its own language. */
  native: string;
  /** Exonym in English (optional). */
  english?: string;
  /** Text direction; defaults to 'ltr'. */
  dir?: 'ltr' | 'rtl';
}

/** Edge (Cloudflare) `Cache-Control` headers set by the SSR routes. */
export interface CacheConfig {
  /** Successful page/post responses. */
  page: string;
  /** 404 responses (shorter TTL so new CMS content becomes reachable quickly). */
  notFound: string;
  /** Upstream/CMS errors — never cache. */
  error: string;
  /** Preview routes — never cache, never index. */
  preview: string;
}

export interface ArpCmsOptions {
  /** Base URL of the Laravel CMS API (trailing slashes are trimmed). */
  baseUrl: string;
  /** Multi-site CMS site this deployment serves (slug preferred, id accepted). */
  site: string;
  /** Locale codes this site publishes. The first is the fallback default. */
  locales: readonly string[];
  /** Effective default locale; must be one of `locales`. Defaults to `locales[0]`. */
  defaultLocale?: string;
  /** Navigation menu slug fetched for the site nav. Defaults to `"main"`. */
  menuSlug?: string;
  /** Bearer token for the `preview/*` endpoints; omit to disable preview. */
  previewToken?: string;
  /** Per-locale `Cache-Control` overrides; sensible defaults are applied. */
  cache?: Partial<CacheConfig>;
  /** Per-locale canonical site URLs (no trailing slash); unset → path-prefix routing. */
  websiteUrls?: Record<string, string | undefined>;
  /**
   * Per-content-type, per-locale URL prefixes (e.g. `{ post: { en: 'blog' } }`),
   * mirroring the CMS `/config` `content_type_paths`. Page has no prefix (it
   * lives at the site root). Consumed by {@link contentTypePath}.
   */
  contentTypePaths?: Record<string, Record<string, string | undefined>>;
  /** Per-locale display metadata for the language switcher + RTL handling. */
  localeMeta?: Record<string, LocaleMeta>;
}

/** Resolved config — serialized into the `virtual:arp-cms` module at build time. */
export interface ResolvedArpCmsConfig {
  cms: {
    baseUrl: string;
    site: string;
    previewToken?: string;
    menuSlug: string;
  };
  cache: CacheConfig;
  websiteUrls: Record<string, string | undefined>;
  contentTypePaths: Record<string, Record<string, string | undefined>>;
  localeMeta: Record<string, LocaleMeta>;
  locales: readonly string[];
  defaultLocale: string;
}

const DEFAULT_CACHE: CacheConfig = {
  page: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  notFound: 'public, max-age=0, s-maxage=60',
  error: 'no-store',
  preview: 'no-store, no-cache, must-revalidate',
};

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

export function resolveOptions(options: ArpCmsOptions): ResolvedArpCmsConfig {
  if (!options.locales?.length) {
    throw new Error('[@arpsw/astro-cms] `locales` must list at least one locale.');
  }

  const fallback = options.locales[0]!;
  const defaultLocale =
    options.defaultLocale && options.locales.includes(options.defaultLocale)
      ? options.defaultLocale
      : fallback;

  return {
    cms: {
      baseUrl: trimTrailingSlashes(options.baseUrl),
      site: options.site.trim(),
      previewToken: options.previewToken || undefined,
      menuSlug: (options.menuSlug ?? 'main').trim(),
    },
    cache: { ...DEFAULT_CACHE, ...options.cache },
    websiteUrls: options.websiteUrls ?? {},
    contentTypePaths: options.contentTypePaths ?? {},
    localeMeta: options.localeMeta ?? {},
    locales: [...options.locales],
    defaultLocale,
  };
}
