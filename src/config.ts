/**
 * The resolved runtime config, provided by the `arpCms()` integration through
 * the `virtual:arp-cms` module. Runtime code (client, i18n) reads it from here.
 *
 * The value is imported from the virtual module but re-exported with an explicit
 * type so the emitted `.d.ts` carries a concrete `ResolvedArpCmsConfig` — never a
 * `from 'virtual:arp-cms'` re-export, which consumers couldn't resolve.
 *
 * This module imports a virtual module, so it (and anything that re-exports it)
 * must NOT be pulled into `astro.config` — keep the package's `.` entry free of
 * it. Runtime consumers reach it via the `@arpsw/astro-cms/runtime` subpath.
 */
import { config as virtualConfig } from 'virtual:arp-cms';
import type { ResolvedArpCmsConfig } from './options';

export const config: ResolvedArpCmsConfig = virtualConfig;
