# @arpsw/astro-cms

Astro integration for the **ARP (Laravel) CMS**. It packages the wiring every
ARP CMS site repeats — the API client, types, i18n + locale/path resolution, and
config — so a new site is *install → configure → design* instead of fork-and-sync.

Modelled on [`@storyblok/astro`](https://github.com/storyblok/monoblok/tree/main/packages/astro):
a single integration in `astro.config`, plus runtime helpers and a block
dispatcher. The CMS is multi-site; one deployment serves one site (`site` slug).

> **Status — `0.x` (pre-release).** Shipped: the `arpCms()` integration (i18n
> routing + the `virtual:arp-cms` config module), the CMS client, API types,
> i18n/path resolution, and `resolveRequest()`. Landing next: the `<CmsBlock>`
> dispatcher (you currently map block types in the site). See **Roadmap**.

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

## Render content

Each site keeps a thin catch-all that wraps **its own** layout and maps block
types to **its own** components. Import runtime helpers from the `/runtime`
subpath (the `.` entry is the integration, kept free of runtime imports so it's
safe in `astro.config`):

```astro
---
// src/pages/[...slug].astro
import Base from '../layouts/Base.astro';
import { resolveRequest } from '@arpsw/astro-cms/runtime';
import HomeHero from '../components/blocks/HomeHero.astro';
import Features from '../components/blocks/Features.astro';

const blocks = { home_hero: HomeHero, features: Features };

const { locale, resolved, menu, redirect } = await resolveRequest(Astro);
if (redirect) return Astro.redirect(redirect.to, redirect.code);
// resolveRequest already set Astro.response.status + Cache-Control.
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

### Optional: `<CmsBlock>`

For sites whose blocks share a uniform prop signature, a generic dispatcher
saves the `block.type` switch:

```astro
import CmsBlock from '@arpsw/astro-cms/CmsBlock.astro';
import Hero from '../components/blocks/Hero.astro';
const components = { hero: Hero, features: Features };
...
{page.blocks.map((block) => <CmsBlock {block} {components} {locale} />)}
```

It renders `components[block.type]` with the whole `block` (read `block.data`)
plus any extra props; unknown types render nothing. If your blocks need
**per-type props or per-block typed `data`** (e.g. only the first block gets
`isFirst`), hand-write a renderer with a `block.type` switch instead — that
stays fully type-safe.

## Media & i18n helpers (`/runtime`)

**Media** — normalise the DAM picker shape (`MediaAsset | MediaAsset[] | null`):

```ts
import { assetSrc, assetAlt, firstAsset, assetFocalPosition } from '@arpsw/astro-cms/runtime';
const src = assetSrc(block.image, 'large');   // best size, falls back to .url
const alt = assetAlt(block.image);            // alt → title → ''
const pos = assetFocalPosition(block.image);  // "50% 30%" for object-position, or undefined
```

**Language switcher** — one entry per configured locale (labels from `localeMeta`):

```ts
import { languageSwitchEntries, isRTL } from '@arpsw/astro-cms/runtime';
const entries = languageSwitchEntries(Astro.url); // [{ locale, code, native, href, isActive, hreflang }]
```

**UI translations** — the package owns the *mechanism*, the site owns the
*content*. Define a per-locale dictionary and get a typed lookup:

```ts
// site src/i18n.ts
import { makeTranslator } from '@arpsw/astro-cms/runtime';
export const t = makeTranslator({
  en: { footer: { contact: 'Contact us' } },
  sl: { footer: { contact: 'Kontaktirajte nas' } },
});
// component: const s = t(locale); s.footer.contact   (falls back to default locale)
```

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
| `localeMeta` | | `{}` | Per-locale display data (`code`, `native`, `english?`, `dir?`) for the language switcher + RTL |

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

- ✅ CMS client (`getPage`, `resolvePath`, `listPosts`, `getMenu`,
  `getWebform`, …), API types, i18n/path resolution (`resolveRequest`,
  `resolveLocaleAndPath`, `getLocaleUrl`, `localePath`, `linkHref`). First
  consumer: `astro-website` (agiledrop).
- ✅ `<CmsBlock>` — optional generic dispatcher (`@arpsw/astro-cms/CmsBlock.astro`).
  Per-block typed renderers remain the recommended pattern for varied props.
- later — optional `injectRoute` for the catch-all + preview routes, a
  translation (UI-strings) system + `media` helper + per-locale display
  metadata (needed before `arp-software-website` can adopt the package), and
  `types` codegen from the Laravel API resources.

## Publishing

Tag a release; CI (`.github/workflows/release.yml`) builds and publishes to
GitHub Packages:

```bash
npm version patch        # bumps package.json + creates the tag
git push --follow-tags
```
