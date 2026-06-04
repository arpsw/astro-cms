import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import type { Plugin } from 'vite';
import { resolveOptions, type ArpCmsOptions, type ResolvedArpCmsConfig } from './options';

const VIRTUAL_ID = 'virtual:arp-cms';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

/**
 * The ARP CMS Astro integration.
 *
 * Wires the boilerplate every ARP CMS site repeats: it configures Astro's i18n
 * routing from `locales`/`defaultLocale`, applies the `publicDir` dev workaround,
 * and publishes the resolved connection/locale/cache config to runtime code
 * through the `virtual:arp-cms` module (consumed by `@arpsw/astro-cms`'s client
 * and i18n helpers).
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
            // These are Astro's defaults — default-locale pages live at the root.
            routing: {
              prefixDefaultLocale: false,
              redirectToDefaultLocale: true,
              fallbackType: 'redirect',
            },
          },
          vite: {
            plugins: [virtualConfigPlugin(resolved)],
            // Astro passes `publicDir` with a trailing slash, which makes Vite's
            // initPublicFiles strip the leading slash from cached filenames and
            // 404 every `public/` asset in dev. Pass it explicitly (no trailing
            // slash) to bypass the cached path.
            publicDir: fileURLToPath(config.publicDir),
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

/** Serves the resolved config as the `virtual:arp-cms` module to runtime code. */
function virtualConfigPlugin(resolved: ResolvedArpCmsConfig): Plugin {
  return {
    name: 'arp-cms:virtual-config',
    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
      return undefined;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        return `export const config = ${JSON.stringify(resolved)};\nexport default config;`;
      }
      return undefined;
    },
  };
}
