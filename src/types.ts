// TypeScript shapes mirroring the Laravel CMS API resources.
// Source of truth: Modules/Cms/app/Http/Resources/*.php
//
// Pure types — no runtime, no `virtual:arp-cms` import — so this entry is safe
// to import anywhere (including astro.config). `Locale` is a plain string here:
// the locale set is provided at runtime via the integration, so the package
// can't derive a literal union. Sites that want a narrow union can declare
// their own and pass it through.

export type Locale = string;

export interface MediaAsset {
  id: number;
  type?: string | null;
  title?: string | null;
  caption?: string | null;
  /** Per-use alt (from media_asset_options.alt_text), falls back to title. */
  alt?: string | null;
  url: string | null;
  thumbnail?: string | null;
  medium?: string | null;
  large?: string | null;
  preview?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  focal?: { x: number | null; y: number | null } | null;
  [key: string]: unknown;
}

export interface ResolvedLink {
  url: string | null;
  /** Target locale for internal links; null for external/manual links. */
  locale: Locale | null;
  /** Locale-relative logical path for internal links (the frontend builds the
   *  real href from {locale, path}); null for external/manual links. */
  path: string | null;
  open_in_new_tab: boolean;
  linkable_type: string | null;
  linkable_id: number | null;
}

export interface Block<T = Record<string, unknown>> {
  type: string;
  data: T;
}

export interface PageMeta {
  title: string | null;
  description: string | null;
  /**
   * After BlockSerializer resolves the DAM picker shape, og_image is an array
   * (the picker is array-based even for single-select). We accept the legacy
   * single-object shape too for forward/backward compatibility.
   */
  og_image: MediaAsset | MediaAsset[] | null;
}

export interface Page {
  id: number;
  slug: string;
  locale: Locale;
  title: string;
  is_homepage: boolean;
  meta: PageMeta;
  blocks: Block[];
  updated_at: string | null;
}

export interface PageListItem {
  id: number;
  slug: string;
  locale: Locale;
  title: string;
  is_homepage: boolean;
  updated_at: string | null;
}

export interface RedirectEnvelope {
  redirect: {
    to: string;
    type: number;
  };
}

export interface Post {
  id: number;
  slug: string;
  locale: Locale;
  title: string;
  excerpt: string | null;
  body: string | null;
  status: string;
  published_at: string | null;
  meta: {
    title: string | null;
    description: string | null;
    og_image: MediaAsset | null;
  };
  featured_image: MediaAsset | null;
  author?: { name: string | null; slug: string | null };
  category?: { name: string | null; slug: string | null };
}

export interface MenuItem {
  id: number;
  title: string;
  type: string | null;
  url: string | null;
  /** Target locale for internal links; null for external/manual links. */
  locale: Locale | null;
  /** Locale-relative logical path for internal links; null otherwise. */
  path: string | null;
  open_in_new_tab: boolean;
  is_megamenu: boolean;
  megamenu_section: string | null;
  cta_style: string | null;
  children: MenuItem[];
}

export interface Menu {
  slug: string;
  name: string;
  locale: Locale;
  items: MenuItem[];
}

export interface WebformElement {
  key: string | null;
  type: string | null;
  label: string | null;
  help_text: string | null;
  placeholder: string | null;
  required: boolean;
  max_length: number | null;
  options: { key: string; label: string }[] | null;
  content: string | null;
  semantic_role: string | null;
  elements?: WebformElement[];
}

export interface Webform {
  slug: string;
  title: string;
  locale: Locale;
  elements: WebformElement[];
  confirmation: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  links: Record<string, string | null>;
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    [key: string]: unknown;
  };
}

// --- Resolver envelope -----------------------------------------------------
//
// Shape returned by GET /api/cms/v1/sites/{site}/resolve?path=... (and the
// /preview/ variant). The catch-all switches on .type to decide what to do.

export type ResolvedRedirect = {
  type: 'redirect';
  to: string;
  code: number;
};

export type ResolvedPage = {
  type: 'page';
  data: Page;
};

export type ResolvedPost = {
  type: 'post';
  data: Post;
};

export type ResolvedNotFound = {
  type: 'not_found';
};

export type Resolved = ResolvedRedirect | ResolvedPage | ResolvedPost | ResolvedNotFound;
