import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { resolveOptions, type ArpCmsOptions } from "./options";

/** Compile-time global carrying the resolved config to runtime code (`./config`). */
const CONFIG_DEFINE_KEY = "__ARP_CMS_CONFIG__";

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
    name: "@arpsw/astro-cms",
    hooks: {
      "astro:config:setup": ({
        config,
        command,
        updateConfig,
        injectRoute,
        addMiddleware,
        logger,
      }) => {
        // Edge-cache SSR HTML in the Worker. Cloudflare doesn't cache a Worker's
        // own response (Cache Rules only govern the origin cache), so we do it
        // with the Workers Cache API. Runs before site middleware so a cache hit
        // short-circuits rendering; no-ops off Cloudflare (no `caches.default`).
        addMiddleware({
          order: "pre",
          entrypoint: fileURLToPath(new URL("./middleware.js", import.meta.url)),
        });

        // Cache-purge webhook the CMS calls on publish/menu/global-block/redirect/
        // settings changes. Reads its secrets (PURGE_SECRET, CF_ZONE_ID,
        // CF_PURGE_TOKEN) from the Worker env at runtime; 503s until configured.
        injectRoute({
          pattern: "/api/purge",
          entrypoint: fileURLToPath(
            new URL("./routes/purge.js", import.meta.url),
          ),
          prerender: false,
        });
        // Ship the preview enter-handshake endpoint so every CMS site gets an
        // identical, maintained `/preview/enter` (validate token → set signed
        // cookie → redirect). It's pure logic — no site UI — so it lives here;
        // the content preview route stays in the site (it renders site layout).
        injectRoute({
          pattern: "/preview/enter",
          entrypoint: fileURLToPath(
            new URL("./routes/preview-enter.js", import.meta.url),
          ),
          prerender: false,
        });

        // SSR sitemap built from the CMS's published-content inventory — the
        // sitemap must be served from the frontend's domain, but the CMS is
        // the source of truth for what exists. Always current (publishing
        // busts the CMS cache), no rebuild involved.
        injectRoute({
          pattern: "/sitemap.xml",
          entrypoint: fileURLToPath(
            new URL("./routes/sitemap.js", import.meta.url),
          ),
          prerender: false,
        });

        // Dev kit: offline `/dev` gallery + content-type previews, rendered
        // through the site's own layout and its block/content registry. Dev
        // only — never injected into a production build, so it cannot ship.
        // The `arpsw:dev-site` import specifier in the injected routes is
        // aliased to the site's dev module (which exports blocks/content/Layout).
        if (command === "dev" && options.devKit) {
          const devSite = fileURLToPath(new URL(options.devKit, config.root));
          injectRoute({
            pattern: "/dev",
            entrypoint: fileURLToPath(
              new URL(
                "../src/components/dev/routes/gallery.astro",
                import.meta.url,
              ),
            ),
            prerender: false,
          });
          injectRoute({
            pattern: "/dev/content/[type]",
            entrypoint: fileURLToPath(
              new URL(
                "../src/components/dev/routes/content.astro",
                import.meta.url,
              ),
            ),
            prerender: false,
          });
          updateConfig({
            vite: { resolve: { alias: { "arpsw:dev-site": devSite } } },
          });
          logger.info(
            `dev kit: /dev + /dev/content/[type] (registry from ${options.devKit})`,
          );
        }

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
              fallbackType: "redirect",
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
            ssr: { noExternal: ["@arpsw/astro-cms"] },
          },
        });

        logger.info(
          `serving CMS site "${resolved.cms.site}" · locales [${resolved.locales.join(
            ", ",
          )}] · default "${resolved.defaultLocale}"`,
        );
      },
    },
  };
}
