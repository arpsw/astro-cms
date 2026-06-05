/**
 * The resolved runtime config, injected by the `arpCms()` integration as a Vite
 * `define` global (`__ARP_CMS_CONFIG__`) and read here. Runtime code (client,
 * i18n) imports `config` from this module.
 *
 * Using a `define` global rather than a Vite *virtual module* is deliberate: a
 * virtual module statically imported by published runtime code cannot survive
 * Vite's dependency optimization or SSR externalization — esbuild's optimizer
 * doesn't run the integration's plugin, so it can't resolve a plugin-provided
 * `virtual:` id, and an externalized dependency never sees the plugin at all. A
 * define'd constant is replaced inline at build time, so there is nothing left
 * to resolve; it works whether the package is linked, installed, pre-bundled,
 * or bundled into the SSR worker.
 */
import type { ResolvedArpCmsConfig } from './options';

declare const __ARP_CMS_CONFIG__: ResolvedArpCmsConfig;

export const config: ResolvedArpCmsConfig = __ARP_CMS_CONFIG__;
