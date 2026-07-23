/**
 * beforeBuildCommand for Tauri: build web UI, splash shell, Node sidecar.
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps/desktop");

function run(cmd, cwd = root) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env, shell: true });
}

run("npm run build -w @testops-hub/shared");
run("npm run build -w @testops-hub/web");
run("npm run build", desktop);
run("node scripts/bundle-server.mjs");
run("node scripts/prepare-sidecar.mjs");
