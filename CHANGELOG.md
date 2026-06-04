# Changelog

All notable changes to `@arpsw/astro-cms` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
