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
