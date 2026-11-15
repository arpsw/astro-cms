#!/usr/bin/env node
/**
 * `astro-cms-warm <siteUrl> [--concurrency N] [--wait S] [--strict]`
 *
 * Warms every URL in the site's sitemap. Meant to run right after a deploy,
 * e.g. as the Workers Builds deploy command:
 *   npx wrangler deploy && npx astro-cms-warm https://example.com --wait 30
 * `--wait` gives the new Worker version time to take traffic first (each
 * version has its own cache). Exits 0 even when some URLs fail, so a warm-up
 * hiccup does not mark a successful deploy as failed; `--strict` exits 1.
 */
import { warmSitemap } from './warm';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const siteUrl = args.find((a) => /^https?:\/\//.test(a));

if (!siteUrl) {
  console.error('Usage: astro-cms-warm <siteUrl> [--concurrency N] [--wait S] [--strict]');
  process.exit(2);
}

const wait = Number(flag('wait') ?? 0);
if (wait > 0) {
  console.log(`Waiting ${wait}s for the new version to take traffic...`);
  await new Promise((r) => setTimeout(r, wait * 1000));
}

try {
  const result = await warmSitemap({ siteUrl, concurrency: Number(flag('concurrency') ?? 6) });
  console.log(
    `Warmed ${siteUrl}: ${result.requested} URLs, ${result.warmed} rendered, ${result.cached} already cached, ${result.failed.length} failed (${(result.durationMs / 1000).toFixed(1)}s)`,
  );
  for (const f of result.failed) console.log(`  failed ${f.status} ${f.url}`);
  process.exit(args.includes('--strict') && result.failed.length ? 1 : 0);
} catch (err) {
  console.error(`Warm-up failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(args.includes('--strict') ? 1 : 0);
}
