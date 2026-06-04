# @arpsw/astro-cms

Astro integration for the **ARP (Laravel) CMS**. It packages the wiring every
ARP CMS site repeats — the API client, types, i18n + locale/path resolution, and
config — so a new site is *install → configure → design* instead of fork-and-sync.

Modelled on [`@storyblok/astro`](https://github.com/storyblok/monoblok/tree/main/packages/astro):
a single integration in `astro.config`, plus runtime helpers and a block
dispatcher. The CMS is multi-site; one deployment serves one site (`site` slug).

> **Status — `0.0.x` (scaffold).** Shipped: the `arpCms()` integration (i18n
> routing + the `virtual:arp-cms` config module). Landing next (`0.1`): the
> runtime client (`resolveRequest`, the CMS client functions, i18n helpers) and
> the `<CmsBlock>` dispatcher. The runtime examples below mark what's not yet
> published. See **Roadmap**.

## Requirements

- Astro `^6`
- Node `>= 22.12.0`
- A reachable ARP CMS API (Laravel), e.g. `https://arp-agiledrop.test` in dev

## Install

The package is published to **GitHub Packages** under the `@arpsw` scope. Add a
project-level `.npmrc` so npm resolves the scope from the GitHub registry:

```ini
# .npmrc (in the consuming site)
@arpsw:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then export a token with `read:packages` (a GitHub PAT locally; in CI the
workflow's `GITHUB_TOKEN`) and install:

```bash
export NODE_AUTH_TOKEN=ghp_xxx        # local dev
npm install @arpsw/astro-cms
```

## Configure

Register the integration in `astro.config.ts`. Wire the values from the site's
own `.env` — the integration runs in Node before Vite, so it can't read
`import.meta.env` itself:

```ts
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import arpCms from '@arpsw/astro-cms';

export default defineConfig({
  adapter: cloudflare(),
  integrations: [
    arpCms({
      baseUrl: process.env.CMS_API_BASE_URL ?? 'http://arp-agiledrop.test',
      site: process.env.CMS_SITE ?? 'agiledrop',
      locales: ['en', 'sl'],          // first is the fallback default
      defaultLocale: process.env.DEFAULT_LOCALE, // optional; must be in `locales`
      menuSlug: process.env.CMS_MENU_SLUG ?? 'main',
      previewToken: process.env.CMS_PREVIEW_TOKEN,
      websiteUrls: {
        en: process.env.WEBSITE_URL_EN,
        sl: process.env.WEBSITE_URL_SL,
      },
    }),
  ],
});
```

The integration then, on `astro:config:setup`:

- sets Astro's `i18n: { locales, defaultLocale, routing: { prefixDefaultLocale: false } }`,
- applies the `publicDir` dev workaround (Astro/Vite trailing-slash bug),
- exposes the resolved config to runtime code as the **`virtual:arp-cms`** module.

You do **not** repeat the `i18n` block or the `publicDir` tweak in your own config.

## Render content *(runtime — landing in `0.1`)*

Each site keeps a thin catch-all that wraps **its own** layout and maps block
types to **its own** components:

```astro
---
// src/pages/[...slug].astro
import Base from '../layouts/Base.astro';
import { resolveRequest } from '@arpsw/astro-cms';   // ⟵ 0.1
import HomeHero from '../components/blocks/HomeHero.astro';
import Features from '../components/blocks/Features.astro';

const blocks = { home_hero: HomeHero, features: Features };

const { locale, resolved, menu, redirect, status } = await resolveRequest(Astro);
if (redirect) return Astro.redirect(redirect.to, redirect.code);
Astro.response.status = status;
---
<Base mainMenu={menu?.items ?? []}>
  {resolved?.type === 'page' &&
    resolved.data.blocks.map((block) => {
      const Cmp = blocks[block.type];
      return Cmp ? <Cmp {...block} {locale} /> : null;
    })}
</Base>
```

`resolveRequest()` encapsulates locale/path resolution → the CMS `resolve`
lookup → the nav menu fetch → the edge `Cache-Control` headers. The route stays
~15 lines; the package owns the plumbing, the site owns the design.

A `<CmsBlock>` dispatcher (so you pass a `components` map once instead of
switching by hand) and optional **route injection** follow `<CmsBlock>` in the
roadmap.

## Options

| Option | Required | Default | Notes |
| --- | --- | --- | --- |
| `baseUrl` | ✓ | — | CMS API base URL; trailing slashes trimmed |
| `site` | ✓ | — | Multi-site slug (or numeric id) |
| `locales` | ✓ | — | Locale codes; first is the fallback default |
| `defaultLocale` | | `locales[0]` | Must be one of `locales`, else ignored |
| `menuSlug` | | `"main"` | Nav menu slug |
| `previewToken` | | — | Bearer for `preview/*`; omit to disable preview |
| `cache` | | sensible defaults | `Cache-Control` overrides (`page`/`notFound`/`error`/`preview`) |
| `websiteUrls` | | `{}` | Per-locale canonical URLs; unset → path-prefix routing |

## Local development of this package

No monorepo — link a local checkout into a site while iterating:

```bash
# in this package
npm run build            # or: npm run dev  (tsup --watch)
npm link

# in the consuming site
npm link @arpsw/astro-cms
```

`npm run check` type-checks; `npm run build` emits `dist/` (ESM + `.d.ts`).

## Roadmap

- `0.1` — extract the CMS client (`getPage`, `resolvePath`, `listPosts`,
  `getMenu`, `getWebform`), API types, i18n helpers (`getLocaleUrl`,
  `localePath`, `useTranslations`), and `resolveRequest`. First consumer:
  `astro-website` (agiledrop).
- `0.2` — `<CmsBlock>` dispatcher + a `components` map option (string-path
  codegen, Storyblok-style).
- later — optional `injectRoute` for the catch-all + preview routes,
  the translation system, and `types` codegen from the Laravel API resources.

## Publishing

Tag a release; CI (`.github/workflows/release.yml`) builds and publishes to
GitHub Packages:

```bash
npm version patch        # bumps package.json + creates the tag
git push --follow-tags
```
