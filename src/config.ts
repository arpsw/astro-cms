/**
 * The resolved runtime config, provided by the `arpCms()` integration through
 * the `virtual:arp-cms` module. Runtime code (client, i18n) reads it from here.
 *
 * This module imports a virtual module, so it (and anything that re-exports it)
 * must NOT be pulled into `astro.config` — keep the package's `.` entry free of
 * it. Runtime consumers reach it via the `@arpsw/astro-cms/runtime` subpath.
 */
export { config } from 'virtual:arp-cms';
