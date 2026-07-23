/**
 * beforeBuildCommand for Tauri: build React UI into apps/desktop/dist,
 * then bundle the Node API sidecar. The WebView loads UI from Tauri assets
 * (not via navigate to localhost).
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps/desktop");
const webDist = join(root, "apps/web/dist");
const desktopDist = join(desktop, "dist");

function run(cmd, cwd = root) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env, shell: true });
}

run("npm run build -w @testops-hub/shared");
run("npm run build -w @testops-hub/web");

if (!existsSync(join(webDist, "index.html"))) {
  throw new Error(`Expected ${webDist}/index.html after web build`);
}

if (existsSync(desktopDist)) {
  rmSync(desktopDist, { recursive: true, force: true });
}
console.log(`> copy ${webDist} -> ${desktopDist}`);
cpSync(webDist, desktopDist, { recursive: true });

run("node scripts/bundle-server.mjs");
run("node scripts/prepare-sidecar.mjs");
