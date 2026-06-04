import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime.ts', 'src/types.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // `astro` is a peer dependency; `virtual:arp-cms` is provided by the
  // integration at the consumer's build time. Neither is bundled.
  external: ['astro', 'virtual:arp-cms'],
});
