/**
 * Dev-kit registry — the shared, framework-agnostic core of the block/content
 * "Storybook-lite". A site declares its blocks and content types with example
 * fixtures; the package's injected `/dev` routes + gallery render them with no
 * CMS. Components are opaque here (the site passes its own Astro components);
 * fixtures are plain serialisable data.
 */

/** A named example payload for a block's data or a content item. */
export interface RegistryExample {
  name: string;
  /** Optional one-line note shown under the example in the gallery. */
  note?: string;
  data: Record<string, unknown>;
}

export interface BlockDefinition {
  /** CMS block type string (must match what the CMS emits). */
  type: string;
  /** Human label for the gallery. */
  title: string;
  /** One-line "what is this block", shown in the gallery info tooltip. */
  description?: string;
  /** The site's Astro component. It receives the block's `data`. */
  component: unknown;
  /** Example fixtures. The first is the default. */
  examples?: RegistryExample[];
}

export interface ContentTypeDefinition {
  /** CMS content type (e.g. 'page', 'post', 'case-study'). */
  type: string;
  title: string;
  description?: string;
  /** The site's view component for this content type. */
  view: unknown;
  /** Prop name the view expects the item under (e.g. 'page', 'post', 'caseStudy'). */
  prop: string;
  examples?: RegistryExample[];
}

/** Identity helpers that keep each entry type-checked at the call site. */
export function defineBlock(def: BlockDefinition): BlockDefinition {
  return def;
}
export function defineContentType(
  def: ContentTypeDefinition,
): ContentTypeDefinition {
  return def;
}

/** What a site exports from its dev module (resolved by the integration alias). */
export interface DevKitModule {
  blocks: BlockDefinition[];
  content?: ContentTypeDefinition[];
  /** The site layout (chrome) the gallery and previews render inside. */
  Layout: unknown;
}

// ── Lookups used by the gallery and the injected routes ──────────────────────

export function findBlock(
  blocks: BlockDefinition[],
  type: string,
): BlockDefinition | undefined {
  return blocks.find((b) => b.type === type);
}

/** Default (or named) example data for a block type; empty object if none. */
export function blockExampleData(
  blocks: BlockDefinition[],
  type: string,
  name?: string,
): Record<string, unknown> {
  const def = findBlock(blocks, type);
  if (!def?.examples?.length) return {};
  const ex = name ? def.examples.find((e) => e.name === name) : def.examples[0];
  return ex?.data ?? def.examples[0].data;
}

export function findContentType(
  content: ContentTypeDefinition[] | undefined,
  type: string,
): ContentTypeDefinition | undefined {
  return content?.find((c) => c.type === type);
}

export function contentExampleData(
  content: ContentTypeDefinition[] | undefined,
  type: string,
  name?: string,
): Record<string, unknown> {
  const def = findContentType(content, type);
  if (!def?.examples?.length) return {};
  const ex = name ? def.examples.find((e) => e.name === name) : def.examples[0];
  return ex?.data ?? def.examples[0].data;
}

/** A one-line summary of the registry, used by the generated agent guidance. */
export function describeRegistry(mod: {
  blocks: BlockDefinition[];
  content?: ContentTypeDefinition[];
}): {
  blocks: {
    type: string;
    title: string;
    examples: number;
    description?: string;
  }[];
  content: { type: string; title: string; examples: number }[];
} {
  return {
    blocks: mod.blocks.map((b) => ({
      type: b.type,
      title: b.title,
      examples: b.examples?.length ?? 0,
      description: b.description,
    })),
    content: (mod.content ?? []).map((c) => ({
      type: c.type,
      title: c.title,
      examples: c.examples?.length ?? 0,
    })),
  };
}
