# Working in an ARP CMS site (`@arpsw/astro-cms`)

Guidance for AI coding agents. This file ships inside the package; a site
surfaces it to its agent (see "Surfacing this to the agent" below). It describes
the conventions the package expects so generated code fits the system.

## Mental model

A site is **Astro + the Laravel ARP CMS**, wired by the `arpCms()` integration.
The package owns the plumbing (CMS client, i18n/path resolution, config, preview

- sitemap routes, the dev kit). The site owns its **block components**, its
  **layout/chrome**, its **theme**, and a **registry** that maps CMS block and
  content types to those components with example fixtures.

* CMS content resolves through `resolveRequest` / `resolvePath` to a `page` or
  `post`; a page is an ordered list of **blocks**. Each block has a `type` and a
  `data` object.
* A site renders blocks by mapping `block.type` to an Astro component. The
  component receives the block's **`data`** (this is the convention: `<Comp data={data} />`).

## The dev kit (build and preview without the CMS)

Develop and preview blocks, pages, and content types against fixtures, with no
CMS running. One registry is the single source of truth and powers both the
offline `/dev` surfaces and (optionally) production rendering.

### Adding a block

1. Build the component in `src/components/blocks/` (or wherever the site keeps
   them). It takes a single `data` prop.
2. Register it with a fixture, using helpers from `@arpsw/astro-cms/dev`:

   ```ts
   import { defineBlock } from "@arpsw/astro-cms/dev";
   import Hero from "../components/blocks/Hero.astro";

   export const blocks = [
     defineBlock({
       type: "hero", // must match the CMS block type
       title: "Hero",
       description: "Top-of-page headline, lede, and call to action.",
       component: Hero,
       examples: [{ name: "default", data: { headline_html: "…", lede: "…" } }],
     }),
   ];
   ```

   Every block should have at least one example so it appears in the gallery.

### Adding a content type

```ts
import { defineContentType } from "@arpsw/astro-cms/dev";
import PostView from "../components/PostView.astro";

export const content = [
  defineContentType({
    type: "post",
    title: "Post",
    view: PostView,
    prop: "post", // the view receives the item under this prop
    examples: [
      { name: "article", data: { title: "…", excerpt: "…", body: "…" } },
    ],
  }),
];
```

A `page` content type's fixture is just `{ title, blocks: [{ type, data }, …] }`,
so it reuses block fixtures.

### Wiring (the site's dev module + integration)

The site exposes a dev module (default `src/dev/site.ts`) that exports
`blocks`, optional `content`, and a `Layout` (the site's chrome). Enable it:

```ts
// astro.config.ts
arpCms({ /* … */, devKit: './src/dev/site.ts' });
```

In `dev` only, the integration injects:

- `/dev` — the component gallery (every block, full width, with an info tooltip).
- `/dev/content/[type]` — a content type rendered through its real view.

These routes are never injected into a production build, so the dev kit cannot
ship. Fixtures and components are the site's; the gallery and routes are the
package's.

## Conventions and gotchas

- Block components take `data`, not the whole block.
- Keep fixtures plain and serialisable. Reference local placeholder assets
  (e.g. `/dev/placeholder.svg`) for images.
- i18n: build hrefs with `localePath` / `linkHref` from `@arpsw/astro-cms`; do
  not hardcode locale prefixes.
- The footer and nav are CMS-driven on real pages; only the `/static` prototype
  (if a site has one) may hardcode them.
- Do not commit secrets; CMS connection comes from `.env` via the integration.

## Surfacing this to the agent

Add this to the site's `CLAUDE.md` (or `AGENTS.md`) so the agent picks it up:

```
@./node_modules/@arpsw/astro-cms/AGENTS.md
```
