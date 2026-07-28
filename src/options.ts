/**
 * Public options for the `arpCms()` integration, and the resolved, serializable
 * config shape that gets injected into runtime code as a Vite `define`.
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
  dir?: "ltr" | "rtl";
}

/**
 * How CMS media URLs are rewritten for delivery by `cfImage` / `cfSrcset`.
 *
 * - `cloudflare` — rewrite to Cloudflare's `/cdn-cgi/image/<options>/<path>`
 *   transform scheme. Requires the asset's own origin (the DAM) to sit behind
 *   Cloudflare with Image Transformations enabled.
 * - `off` — leave URLs untouched, so the DAM serves the conversions it already
 *   stores (thumbnail/medium/large/preview).
 */
export type ImageTransformMode = 'cloudflare' | 'off';

const IMAGE_TRANSFORM_MODES: readonly ImageTransformMode[] = ['cloudflare', 'off'];

/** Resolved image-delivery config. */
export interface ImagesConfig {
  transform: ImageTransformMode;
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
  /**
   * Lifetime, in seconds, of the signed preview-session cookie minted by the
   * enter-preview handshake. Defaults to 3600 (1 hour).
   */
  previewCookieTtl?: number;
  /** Per-locale `Cache-Control` overrides; sensible defaults are applied. */
  cache?: Partial<CacheConfig>;
  /**
   * Image delivery. Defaults to `{ transform: 'cloudflare' }`, preserving the
   * `/cdn-cgi/image/` rewrites.
   *
   * Set `transform: 'off'` for any environment whose DAM is reachable but *not*
   * behind Cloudflare (a share tunnel, staging behind a plain proxy). `cfImage`
   * already passes through obvious local hosts (`localhost`, `.test`, `.local`),
   * but that heuristic can't recognise a public-looking hostname with no
   * Cloudflare in front — and a transform URL 404s there.
   */
  images?: { transform?: ImageTransformMode };
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
  /**
   * Path (relative to the project root) to the site's dev-kit module, which
   * exports `blocks`, optional `content`, and a `Layout`. When set, the
   * integration injects the offline `/dev` routes (gallery + content previews)
   * in `dev` only. Omit to disable the dev kit.
   */
  devKit?: string;
}

/** Resolved config — serialized into the `__ARP_CMS_CONFIG__` define at build time. */
export interface ResolvedArpCmsConfig {
  cms: {
    baseUrl: string;
    site: string;
    previewToken?: string;
    menuSlug: string;
  };
  /** Browser-facing preview session settings. */
  preview: {
    /** Signed preview-cookie lifetime in seconds. */
    cookieTtl: number;
  };
  cache: CacheConfig;
  images: ImagesConfig;
  websiteUrls: Record<string, string | undefined>;
  contentTypePaths: Record<string, Record<string, string | undefined>>;
  localeMeta: Record<string, LocaleMeta>;
  locales: readonly string[];
  defaultLocale: string;
}

const DEFAULT_CACHE: CacheConfig = {
  page: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  notFound: "public, max-age=0, s-maxage=60",
  error: "no-store",
  preview: "no-store, no-cache, must-revalidate",
};

const trimTrailingSlashes = (value: string): string =>
  value.replace(/\/+$/, "");

export function resolveOptions(options: ArpCmsOptions): ResolvedArpCmsConfig {
  if (!options.locales?.length) {
    throw new Error(
      "[@arpsw/astro-cms] `locales` must list at least one locale.",
    );
  }

  const fallback = options.locales[0]!;
  const defaultLocale =
    options.defaultLocale && options.locales.includes(options.defaultLocale)
      ? options.defaultLocale
      : fallback;

  // Sites wire this from `.env`, so the value arrives as an unvalidated string.
  // Fail loudly instead of falling back to `cloudflare`: silently ignoring a
  // typo would reproduce the exact bug this option exists to prevent (transform
  // URLs emitted for an origin with no Cloudflare in front).
  const imageTransform = options.images?.transform ?? 'cloudflare';
  if (!IMAGE_TRANSFORM_MODES.includes(imageTransform)) {
    throw new Error(
      `[@arpsw/astro-cms] \`images.transform\` must be one of ${IMAGE_TRANSFORM_MODES.map(
        (mode) => `'${mode}'`,
      ).join(' | ')}; received '${imageTransform}'.`,
    );
  }

  return {
    cms: {
      baseUrl: trimTrailingSlashes(options.baseUrl),
      site: options.site.trim(),
      previewToken: options.previewToken || undefined,
      menuSlug: (options.menuSlug ?? "main").trim(),
    },
    preview: {
      cookieTtl:
        options.previewCookieTtl && options.previewCookieTtl > 0
          ? Math.floor(options.previewCookieTtl)
          : 3600,
    },
    cache: { ...DEFAULT_CACHE, ...options.cache },
    images: { transform: imageTransform },
    websiteUrls: options.websiteUrls ?? {},
    contentTypePaths: options.contentTypePaths ?? {},
    localeMeta: options.localeMeta ?? {},
    locales: [...options.locales],
    defaultLocale,
  };
}
