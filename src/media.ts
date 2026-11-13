/**
 * Helpers for the CMS media-asset shape. The DAM MediaAssetPicker returns
 * `MediaAsset | MediaAsset[] | null` even for single-select, so these normalise
 * it for block components.
 *
 * The shape helpers (`firstAsset`, `assetSrc`, `assetAlt`, `assetFocalPosition`)
 * are pure. The transform helpers (`imageUrl`, `imageSrcset`, `transformHtmlImages`)
 * read `images.transform`
 * from the resolved config, so this module is reachable only through `/runtime`
 * (never from `astro.config`, which has no `define`) — as it already was.
 */
import { config } from './config';
import type { ImageTransformMode } from './options';
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

/** The per-use alt text, or empty string. Never the asset title: a title does not describe the image. */
export function assetAlt(m: MaybeAsset): string {
  const a = firstAsset(m);
  return a?.alt ?? '';
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
// These are URL rewrites, not image processing. A URL is left untouched when it
// can't be transformed: transforms disabled via `images.transform: 'off'`, an
// SVG (nothing to resize), a relative/local asset, or anything the active
// builder declines (see `handles` below).
//
// `imageUrl` / `imageSrcset` name the *intent*; which URL scheme they emit is an
// implementation detail chosen by `images.transform`. They are deliberately NOT
// named after a provider, so adding a second builder never touches a call site.
// `cfImage` / `cfSrcset` remain as deprecated aliases.
//
// ── Adding a builder ────────────────────────────────────────────────────────
// Add the mode to `ImageTransformMode` (in options.ts) and an entry to
// `BUILDERS`. The `Record<Exclude<ImageTransformMode, 'off'>, …>` type makes a
// missing entry a compile error, so the two can't drift.
//
// Put provider-specific preconditions in that builder's `handles`, NOT in the
// shared prelude. Most of the guards here are Cloudflare-specific even though
// they look generic: an Astro `/_image` builder would want local hosts to be the
// *good* case (sharp runs locally), would accept non-https origins, and would
// recognise its own `/_image` prefix rather than `/cdn-cgi/`. Only "empty",
// "unparseable" and "SVG" are genuinely shared.

export interface ImageOptions {
  width?: number;
  height?: number;
  /** 1–100. Default 80. */
  quality?: number;
  /** Cloudflare's vocabulary; another builder may map or ignore these. */
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  /**
   * `auto` negotiates AVIF/WebP from the Accept header, which is a Cloudflare
   * capability: builders without it must pick a concrete format. Default `auto`.
   */
  format?: 'auto' | 'avif' | 'webp' | 'jpeg' | 'png';
}

/** @deprecated Renamed to {@link ImageOptions}. */
export type CfImageOptions = ImageOptions;

interface ImageBuilder {
  /** Whether this builder can produce a derivative for `url`. */
  handles(url: URL): boolean;
  /** Build the derivative URL. Only called when `handles(url)` is true. */
  build(url: URL, opts: ImageOptions): string;
}

/**
 * Hosts with no Cloudflare in front — local dev DAMs (Herd `.test`, localhost,
 * loopback). Cloudflare transform URLs would 404 there, so that builder declines
 * them. This is the zero-config fallback that keeps ordinary local development
 * working without setting `images.transform` at all; the config is the explicit
 * switch for hosts this can't classify (a share tunnel looks like production).
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

const BUILDERS: Record<Exclude<ImageTransformMode, 'off'>, ImageBuilder> = {
  cloudflare: {
    handles: (url) =>
      url.protocol === 'https:' && // CF Transformations serve over https
      !isLocalHost(url.hostname) && // local dev DAM, no Cloudflare in front
      !url.pathname.startsWith('/cdn-cgi/'), // already transformed
    build: (url, opts) => {
      const params = [
        // Serve the original instead of an error when Cloudflare can't produce
        // the derivative (unsupported input, size limits). Only applies where
        // Cloudflare handles the URL; it can't rescue a transform URL that never
        // reaches Cloudflare at all — that's what `transform: 'off'` is for.
        'onerror=redirect',
        opts.width && `width=${opts.width}`,
        opts.height && `height=${opts.height}`,
        `quality=${opts.quality ?? 80}`,
        opts.fit && `fit=${opts.fit}`,
        `format=${opts.format ?? 'auto'}`,
      ]
        .filter(Boolean)
        .join(',');

      return `${url.origin}/cdn-cgi/image/${params}${url.pathname}${url.search}`;
    },
  },
};

/** The parsed URL plus the builder that will handle it, or null if none will. */
function resolveTarget(src: string): { url: URL; builder: ImageBuilder } | null {
  if (!src) return null;

  const mode = config.images?.transform ?? 'cloudflare';
  if (mode === 'off') return null;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null; // relative/local asset — nothing to transform
  }

  if (url.pathname.toLowerCase().endsWith('.svg')) return null; // vector, served as-is

  const builder = BUILDERS[mode];
  return builder?.handles(url) ? { url, builder } : null;
}

/**
 * Whether a derivative would be produced for `src`. Use it to decide whether to
 * render responsive attributes at all, rather than comparing `imageUrl()` output
 * against its input.
 */
export function canTransform(src: string): boolean {
  return resolveTarget(src) !== null;
}

/**
 * Rewrite a CMS media URL to a resized derivative, per `images.transform`.
 * Returns `src` unchanged when no builder applies.
 */
export function imageUrl(src: string, opts: ImageOptions = {}): string {
  const target = resolveTarget(src);
  return target ? target.builder.build(target.url, opts) : src;
}

/**
 * `srcset` of derivatives at the given widths, or undefined when the URL can't
 * be transformed (or no widths were given) so the caller omits the attribute.
 */
export function imageSrcset(
  src: string,
  widths: number[],
  opts: Omit<ImageOptions, 'width'> = {},
): string | undefined {
  if (!widths.length || !canTransform(src)) return undefined;
  return widths.map((w) => `${imageUrl(src, { ...opts, width: w })} ${w}w`).join(', ');
}

export interface HtmlImageOptions extends Omit<ImageOptions, 'width'> {
  /** Widths for the generated `srcset`. Default `[480, 800, 1200, 1600]`. */
  widths?: number[];
  /**
   * Width of the fallback `src` (browsers without srcset support, crawlers).
   * Default: the largest of `widths`.
   */
  width?: number;
  /**
   * `sizes` for the generated `srcset`: how wide the image renders, which is
   * the site's layout knowledge. Default `100vw` (correct but wasteful in a
   * narrow column, so pass the real value, e.g. `(min-width: 800px) 720px, 100vw`).
   */
  sizes?: string;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const ATTR = /\s([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encodeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Rewrite every `<img>` in CMS rich-text HTML (post bodies, content blocks) to
 * a resized derivative, the way block components use {@link imageUrl} and
 * {@link imageSrcset} for picker images. The editor stores the asset's
 * original URL, so without this an inline image ships at upload size (often
 * megabytes) while every block image is resized and recompressed.
 *
 * Per image: `src` becomes a derivative at `width`, and `srcset`, `sizes`,
 * `loading="lazy"` and `decoding="async"` are added unless the editor already
 * set them. Images that can't be transformed (see {@link canTransform}) and
 * images that already carry a `srcset` are left exactly as they are; every
 * other attribute is preserved.
 */
export function transformHtmlImages(html: string, opts: HtmlImageOptions = {}): string {
  if (!html || !html.includes('<img')) return html;

  const { widths = [480, 800, 1200, 1600], width, sizes = '100vw', ...imageOpts } = opts;
  const fallbackWidth = width ?? Math.max(...widths);

  return html.replace(IMG_TAG, (tag) => {
    const attrs = new Map<string, string>();
    for (const [, name, raw] of tag.matchAll(ATTR)) {
      const value = raw === undefined ? '' : raw.replace(/^(["'])([\s\S]*)\1$/, '$2');
      attrs.set(name.toLowerCase(), decodeAttr(value));
    }

    const src = attrs.get('src');
    if (!src || attrs.has('srcset') || !canTransform(src)) return tag;

    const additions: Record<string, string | undefined> = {
      srcset: imageSrcset(src, widths, imageOpts),
      sizes: attrs.has('sizes') ? undefined : sizes,
      loading: attrs.has('loading') ? undefined : 'lazy',
      decoding: attrs.has('decoding') ? undefined : 'async',
    };

    const newSrc = imageUrl(src, { ...imageOpts, width: fallbackWidth });
    const extra = Object.entries(additions)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => ` ${name}="${encodeAttr(value!)}"`)
      .join('');

    // Swap only the src value; everything else in the tag stays byte-for-byte.
    const rewritten = tag.replace(
      /(\ssrc\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)/i,
      (_, prefix: string) => `${prefix}"${encodeAttr(newSrc)}"`,
    );

    return rewritten.replace(/\s*(\/?)>$/, (_, slash: string) => `${extra}${slash ? ' /' : ''}>`);
  });
}

/** @deprecated Renamed to {@link imageUrl}. Removed in 1.0. */
export const cfImage = imageUrl;

/** @deprecated Renamed to {@link imageSrcset}. Removed in 1.0. */
export const cfSrcset = imageSrcset;
