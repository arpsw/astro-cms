/**
 * Helpers for the CMS media-asset shape. The DAM MediaAssetPicker returns
 * `MediaAsset | MediaAsset[] | null` even for single-select, so these normalise
 * it for block components. Pure functions — no config, importable anywhere.
 */
import type { MediaAsset } from './types';

type MaybeAsset = MediaAsset | MediaAsset[] | null | undefined;

/** First asset from the picker shape (array or single), or null. */
export function firstAsset(m: MaybeAsset): MediaAsset | null {
  if (!m) return null;
  return Array.isArray(m) ? (m[0] ?? null) : m;
}

/** Best URL for a size, falling back to the original `url`. */
export function assetSrc(
  m: MaybeAsset,
  size: 'large' | 'medium' | 'thumbnail' | 'preview' = 'large',
): string | undefined {
  const a = firstAsset(m);
  if (!a) return undefined;
  return (a[size] as string | null | undefined) ?? a.url ?? undefined;
}

/** Alt text, falling back to the asset title then empty string. */
export function assetAlt(m: MaybeAsset): string {
  const a = firstAsset(m);
  return a?.alt ?? a?.title ?? '';
}

/**
 * CSS `object-position` from the asset's focal point (DAM stores 0–1 floats),
 * e.g. `"50% 30%"`. Returns undefined when no focal point is set.
 */
export function assetFocalPosition(m: MaybeAsset): string | undefined {
  const focal = firstAsset(m)?.focal;
  if (!focal || focal.x == null || focal.y == null) return undefined;
  return `${(focal.x * 100).toFixed(2)}% ${(focal.y * 100).toFixed(2)}%`;
}

// ── Cloudflare Image Transformations ─────────────────────────────────────────
//
// Derivatives (resized, recompressed, AVIF/WebP via `format=auto`, alpha
// preserved) are generated on the fly by Cloudflare and edge-cached per variant
// via the `/cdn-cgi/image/<options>/<path>` URL scheme. The transform URL is
// built on the asset's OWN origin (the DAM), not the site host — transformations
// run on the zone that serves the URL, so this stays portable: any site can embed
// these URLs as long as the DAM sits behind Cloudflare with Transformations on.
//
// These are pure URL rewrites (no config, env-independent). A URL is left
// untouched when it can't be transformed: a local dev DAM (no Cloudflare in
// front), a non-https origin, an SVG (served as-is), an already-transformed URL,
// or a relative/local asset.

export interface CfImageOptions {
  width?: number;
  height?: number;
  /** 1–100; Cloudflare's sweet spot for photos/graphics. Default 80. */
  quality?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  /** `auto` negotiates AVIF/WebP from the Accept header. Default `auto`. */
  format?: 'auto' | 'avif' | 'webp' | 'jpeg' | 'png';
}

/**
 * Hosts with no Cloudflare in front — local dev DAMs (Herd `.test`, localhost,
 * loopback). Transform URLs would 404 there, so the helpers pass through. This
 * is what keeps the functions env-independent: dev vs prod is inferred from the
 * asset host, not a build-time flag (the package ships no `import.meta.env`).
 */
function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.test') ||
    host.endsWith('.local') ||
    host.endsWith('.localhost')
  );
}

/** Rewrite a CMS media URL to a Cloudflare-transformed derivative. */
export function cfImage(src: string, opts: CfImageOptions = {}): string {
  if (!src) return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src; // relative/local asset — nothing to transform
  }

  if (url.protocol !== 'https:') return src; // CF Transformations serve over https
  if (isLocalHost(url.hostname)) return src; // local dev DAM, no Cloudflare
  if (url.pathname.startsWith('/cdn-cgi/')) return src; // already transformed
  if (url.pathname.toLowerCase().endsWith('.svg')) return src; // served as-is

  const params = [
    opts.width && `width=${opts.width}`,
    opts.height && `height=${opts.height}`,
    `quality=${opts.quality ?? 80}`,
    opts.fit && `fit=${opts.fit}`,
    `format=${opts.format ?? 'auto'}`,
  ]
    .filter(Boolean)
    .join(',');

  return `${url.origin}/cdn-cgi/image/${params}${url.pathname}${url.search}`;
}

/**
 * `srcset` of transformed derivatives at the given widths. Returns undefined
 * when the URL can't be transformed (local DAM, non-https, SVG, relative), so
 * the caller simply omits the attribute.
 */
export function cfSrcset(
  src: string,
  widths: number[],
  opts: Omit<CfImageOptions, 'width'> = {},
): string | undefined {
  const first = cfImage(src, { ...opts, width: widths[0] });
  if (first === src) return undefined;
  return widths.map((w) => `${cfImage(src, { ...opts, width: w })} ${w}w`).join(', ');
}
