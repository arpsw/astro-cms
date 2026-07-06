# Changelog

All notable changes to `@arpsw/astro-cms` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-07-06

### Added

- **`listPosts()` pagination.** Optional `page` argument for numbered
  pagination, used by the posts-list block.

## [0.7.0] - 2026-07-06

### Added

- **Edge caching for SSR HTML.** A Workers Cache API middleware
  (`caches.default`, injected via `addMiddleware`) caches cacheable GET HTML in
  the Worker, since Cloudflare does not store a Worker's own response. No-ops off
  Cloudflare and in `astro dev`.
- **`/api/purge` webhook.** An injected route the CMS calls on publish to
  invalidate the edge cache: Bearer `PURGE_SECRET`, then the Cloudflare purge API
  via `CF_ZONE_ID` / `CF_PURGE_TOKEN`. Body `{everything|urls|tags}`. New
  `./middleware` and `./routes/purge` package exports.

## [0.6.0] - 2026-06-17

### Added

- **Dev kit: build and preview blocks, pages, and content types against
  fixtures, with no CMS running.** One registry is the single source of truth.
  - `@arpsw/astro-cms/dev` — framework-agnostic registry: `defineBlock`,
    `defineContentType`, the `DevKitModule` shape, lookups (`findBlock`,
    `blockExampleData`, `findContentType`, `contentExampleData`), and
    `describeRegistry()`.
  - `Block`, `Content`, and the full-width `BlockGallery` components (shipped as
    source under `src/components/dev`). The gallery delineates each block with an
    overlay outline + a floating tag whose info tooltip shows the block's
    description, so the block itself renders untouched at full width.
  - A `devKit` integration option: the path to the site's dev module (which
    exports `blocks`, optional `content`, and a `Layout`). In `dev` only, the
    integration injects `/dev` (the component gallery) and `/dev/content/[type]`
    (a content type rendered through its real view), both rendered inside the
    site's own layout via an aliased dev module. Never injected into a
    production build, so the dev kit cannot ship.
- **`AGENTS.md` shipped in the package** — conventions for AI coding agents
  working in an ARP CMS site (how to add a block or content type, the `data`
  convention, wiring). A site surfaces it with one `@import` in its `CLAUDE.md`.

## [0.5.0] - 2026-06-10

### Added

- **Named content: regions & global blocks.** New client helpers, re-exported
  from `@arpsw/astro-cms/runtime`:
  - `getRegion(slug, locale)` — fetch a declared region (e.g. `footer`): its
    global blocks, locale-resolved and ordered, in the same shape as a page's
    `blocks` array so the regular block dispatcher renders them.
  - `getGlobalBlock(slug, locale)` — fetch one shared global block instance.
- Types: `Region`, `GlobalBlockResult`; `Block` gains an optional `global`
  field (the slug of the global block an inlined reference came from).
- **SSR `/sitemap.xml`**, injected into every consumer site: built per request
  from the CMS's new `/sitemap` inventory endpoint (all published routable
  content with URL + lastmod), with hreflang alternates across locales and an
  `x-default` pointing at the default-locale variant. Always current — no
  rebuild involved. The raw inventory is also exposed as
  `getSitemapInventory()` (`SitemapEntry` type) for custom sitemaps.
- `getConfig()` — fetch the site's live `/config` payload (`SiteConfig` type).
  Unlike the integration options (baked at build time), this reflects the CMS
  now; it carries `custom_scripts.head` / `custom_scripts.body` — per-locale
  raw HTML the layout injects into `<head>` / before `</body>` — so script
  changes go live without a rebuild.

## [0.4.0] - 2026-06-08

### Added

- Browser-facing **preview sessions** (`src/preview.ts`, re-exported from
  `@arpsw/astro-cms/runtime`). The server↔CMS `previewToken` is no longer
  sufficient to view drafts by visiting `/preview/*` directly: a browser must
  hold a signed, httpOnly, time-boxed cookie. New helpers:
  - `previewTokenMatches(provided)` — constant-time check of an editor-presented
    enter token against the configured secret.
  - `createPreviewSession()` — mint a signed `<expiryMs>.<hmac>` cookie value
    (HMAC-SHA256 via Web Crypto, keyed by `previewToken`; works on Cloudflare
    Workers and Node).
  - `verifyPreviewSession(value)` — validate signature + expiry.
  - `previewCookieOptions(secure, maxAge)` and `PREVIEW_COOKIE_NAME`.
  - `isPreviewConfigured()`.
- `previewCookieTtl` integration option → resolved `preview.cookieTtl` (seconds,
  default 3600).

### Notes

- Additive and backwards compatible — no changes required for sites that don't
  use the new helpers. Sites adopting the cookie gate add a `/preview/enter`
  endpoint (validate token → set cookie → redirect) and check
  `verifyPreviewSession()` in their `/preview/*` routes. See the README.

## [0.3.3] - 2026-06-05

### Fixed

- Build failure `Could not resolve "virtual:arp-cms"` in clean/registry installs
  (Linux/CI, e.g. Cloudflare). Root cause: shipped runtime code statically
  imported the `virtual:arp-cms` module, which can't survive Vite's dependency
  optimization (esbuild can't resolve a plugin-provided virtual id) or SSR
  externalization. The resolved config is now injected as a Vite `define`
  constant (`__ARP_CMS_CONFIG__`) and read inline — no virtual module is
  imported by published code — with `ssr.noExternal` ensuring the runtime is
  bundled (and thus the define applied) in the SSR build. The 0.3.2
  `optimizeDeps` mitigations are removed.

## [0.3.2] - 2026-06-05

### Fixed

- Attempted fix for the registry-install build failure via
  `vite.optimizeDeps.exclude` + `vite.ssr.noExternal`. This worked on macOS but
  **not** on Linux/CI; superseded by 0.3.3, which removes the static virtual
  import entirely.

## [0.3.1] - 2026-06-05

### Changed

- Now published to the **public npm registry** (`registry.npmjs.org`) instead of
  GitHub Packages. Install with `npm install @arpsw/astro-cms` — no registry
  config or auth token required. No functional/code changes from 0.3.0.

## [0.3.0] - 2026-06-04

### Added

- `contentTypePaths` integration option and resolved-config field — per-content-type,
  per-locale URL prefixes (e.g. `{ post: { en: 'blog' } }`), mirroring the CMS
  `/config` `content_type_paths`. Page has no prefix (it lives at the site root).
- `contentTypePath(type, locale)` runtime helper that reads the configured prefix
  for a content type in a locale (returns `undefined` when unset).

### Notes

- Additive and backwards compatible — `contentTypePaths` defaults to `{}` when
  omitted, so existing sites need no changes.
- The CMS now also exposes `content_type_paths` from `GET /sites/{site}/config`
  (the `article_root_paths` alias is retained for the Post prefix).

## [0.2.1] - prior

- Fix: `makeTranslator` accepts a partial dictionary.

## [0.2.0] - prior

- Media helpers, UI-translation mechanism, and locale metadata.

## [0.1.0] - prior

- Initial release: CMS client, types, i18n resolution, `resolveRequest`, the
  `<CmsBlock>` dispatcher, and concrete config wiring for consumers.
