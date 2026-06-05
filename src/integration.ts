import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { resolveOptions, type ArpCmsOptions } from './options';

/** Compile-time global carrying the resolved config to runtime code (`./config`). */
const CONFIG_DEFINE_KEY = '__ARP_CMS_CONFIG__';

/**
 * The ARP CMS Astro integration.
 *
 * Wires the boilerplate every ARP CMS site repeats: it configures Astro's i18n
 * routing from `locales`/`defaultLocale`, applies the `publicDir` dev workaround,
 * and injects the resolved connection/locale/cache config into runtime code as a
 * Vite `define` global (consumed by `@arpsw/astro-cms`'s client and i18n helpers).
 */
export function arpCms(options: ArpCmsOptions): AstroIntegration {
  const resolved = resolveOptions(options);

  return {
    name: '@arpsw/astro-cms',
    hooks: {
      'astro:config:setup': ({ config, updateConfig, logger }) => {
        updateConfig({
          i18n: {
            locales: [...resolved.locales],
            defaultLocale: resolved.defaultLocale,
            // Full object: `astro:config:setup`'s updateConfig uses the resolved
            // (strict) config type, unlike the shorthand defineConfig accepts.
            // Default-locale pages live at the root; `redirectToDefaultLocale`
            // must be false when `prefixDefaultLocale` is false (Astro rejects
            // true here — it would risk redirect loops).
            routing: {
              prefixDefaultLocale: false,
              redirectToDefaultLocale: false,
              fallbackType: 'redirect',
            },
          },
          vite: {
            // Astro passes `publicDir` with a trailing slash, which makes Vite's
            // initPublicFiles strip the leading slash from cached filenames and
            // 404 every `public/` asset in dev. Pass it explicitly (no trailing
            // slash) to bypass the cached path.
            publicDir: fileURLToPath(config.publicDir),
            // Inject the resolved config as a compile-time constant; `./config`
            // reads `__ARP_CMS_CONFIG__` and Vite replaces it inline at build
            // time. We deliberately avoid a Vite *virtual module* here: one that
            // is statically imported by published runtime code can't survive
            // dependency optimization (esbuild can't resolve a plugin-provided
            // virtual id) or SSR externalization. A `define` global has nothing
            // to resolve, so it works whether the package is linked, installed,
            // pre-bundled, or bundled into the SSR worker.
            define: {
              [CONFIG_DEFINE_KEY]: JSON.stringify(resolved),
            },
            // Bundle (don't externalize) the package in the SSR build so the
            // `define` above is applied to its runtime; an externalized dep would
            // ship the bare `__ARP_CMS_CONFIG__` reference unreplaced.
            ssr: { noExternal: ['@arpsw/astro-cms'] },
          },
        });

        logger.info(
          `serving CMS site "${resolved.cms.site}" · locales [${resolved.locales.join(
            ', ',
          )}] · default "${resolved.defaultLocale}"`,
        );
      },
    },
  };
}
