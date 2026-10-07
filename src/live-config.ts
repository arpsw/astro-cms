/**
 * The last `/config` payload seen in this isolate. Internal: `getConfig()`
 * records it, `contentTypePath()` reads it, so link prefixes follow the CMS
 * Site settings without a rebuild. Holds plain data only — sharing a fetch
 * promise across requests is not allowed on Workers.
 */
import type { SiteConfig } from './types';

let contentTypePaths: SiteConfig['content_type_paths'] | null = null;

export function recordSiteConfig(siteConfig: SiteConfig): void {
  contentTypePaths = siteConfig.content_type_paths ?? null;
}

export function liveContentTypePaths(): SiteConfig['content_type_paths'] | null {
  return contentTypePaths;
}
