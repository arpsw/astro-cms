# Changelog

All notable changes to `@arpsw/astro-cms` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
