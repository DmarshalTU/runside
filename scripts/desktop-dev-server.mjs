/**
 * Dev helper for `tauri dev`: start the Hono API (with built UI if present).
 * Tauri loads http://127.0.0.1:8787 via devUrl.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = join(root, "apps/web/dist");
const serverEntry = join(root, "apps/server/src/index.ts");

if (!existsSync(join(webDist, "index.html"))) {
  console.warn(
    "[desktop-dev] apps/web/dist missing — API will run without UI. Run: npm run build -w @testops-hub/web",
  );
}

const tsxCli = join(root, "node_modules/tsx/dist/cli.mjs");
const child = spawn(
  process.execPath,
  [tsxCli, "watch", serverEntry],
  {
    cwd: root,
    env: {
      ...process.env,
      RUNSIDE_DESKTOP: "1",
      PORT: "8787",
      RUNSIDE_WEB_DIST: existsSync(join(webDist, "index.html")) ? webDist : "",
    },
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill();
  });
}
