/**
 * `/sitemap.xml` — injected into consumer sites by the `arpCms()` integration.
 *
 * Served SSR from the frontend's own domain (a sitemap must live on the host
 * whose URLs it lists), built from the CMS's `/sitemap` inventory of published
 * routable content. Always current: publishing busts the CMS response cache,
 * and no site rebuild is involved. Entries sharing `type` + `slug` are the
 * same document in different locales and are linked as hreflang alternates
 * (plus `x-default` pointing at the default-locale variant).
 */
import type { APIRoute } from 'astro';
// Import the package's PUBLIC runtime (not relative modules) so the resolved
// config `define` is applied — same reasoning as routes/preview-enter.
import { config, getSitemapInventory } from '@arpsw/astro-cms/runtime';
// Relative TYPE-only import: erased at compile time, so the "import the
// public runtime" rule (which exists for the config `define`) doesn't apply.
import type { SitemapEntry } from '../types';

export const prerender = false;

const XML_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => XML_ESCAPES[char]);
}

function alternateLinks(group: SitemapEntry[]): string[] {
  if (group.length < 2) {
    return [];
  }

  const links = group.map(
    (alt) =>
      `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.locale)}" href="${escapeXml(alt.url)}" />`,
  );

  const fallback = group.find((alt) => alt.locale === config.defaultLocale) ?? group[0];
  links.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(fallback.url)}" />`,
  );

  return links;
}

export const GET: APIRoute = async () => {
  let entries: SitemapEntry[] = [];
  try {
    entries = await getSitemapInventory();
  } catch {
    // CMS unreachable: serve an empty (but valid) sitemap rather than a 500 —
    // crawlers treat errors far worse than a temporarily sparse sitemap.
    entries = [];
  }

  // Group translations of the same document for hreflang alternates.
  const groups = new Map<string, SitemapEntry[]>();
  for (const entry of entries) {
    const key = `${entry.type}:${entry.slug}`;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const urls: string[] = [];
  for (const group of groups.values()) {
    const alternates = alternateLinks(group);

    for (const entry of group) {
      const lines = [`  <url>`, `    <loc>${escapeXml(entry.url)}</loc>`];
      if (entry.updated_at) {
        lines.push(`    <lastmod>${escapeXml(entry.updated_at)}</lastmod>`);
      }
      lines.push(...alternates, `  </url>`);
      urls.push(lines.join('\n'));
    }
  }

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
