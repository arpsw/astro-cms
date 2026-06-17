import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/runtime.ts",
    "src/types.ts",
    "src/routes/preview-enter.ts",
    "src/routes/sitemap.ts",
    "src/dev/registry.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // `astro` is a peer dependency — not bundled. The injected route imports the
  // package's own public runtime by name; keep it external so the consumer's
  // build resolves it (and applies the config `define`) rather than inlining it.
  external: ["astro", "@arpsw/astro-cms"],
});
