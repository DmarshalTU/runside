/**
 * Bundle the Hono server (+ deps) into a single CJS file for pkg/sidecar packaging.
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "apps/desktop/sidecar/server.cjs");

mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "apps/server/src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile,
  sourcemap: false,
  packages: "bundle",
  logLevel: "info",
  banner: {
    js: [
      "/* Runside server sidecar bundle */",
      "var __import_meta_url = require('url').pathToFileURL(__filename).href;",
    ].join("\n"),
  },
  define: {
    "import.meta.url": "__import_meta_url",
  },
});

console.log(`Bundled server -> ${outfile}`);
