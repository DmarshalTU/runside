/**
 * Prepare Tauri sidecar = portable Node binary renamed for externalBin,
 * plus server.cjs + web UI in resources.
 *
 * Runtime: runside-server-<triple> path/to/server.cjs
 */
import { execSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps/desktop");
const sidecarDir = join(desktop, "sidecar");
const binariesDir = join(desktop, "src-tauri/binaries");
const resourcesDir = join(desktop, "src-tauri/resources");
const resourcesWeb = join(resourcesDir, "web");
const serverCjs = join(sidecarDir, "server.cjs");
const webDist = join(root, "apps/web/dist");

/** Pin a Node release that has official platform binaries. */
const NODE_VERSION = "20.18.1";

function hostTriple() {
  try {
    return execSync("rustc --print host-tuple", { encoding: "utf8" }).trim();
  } catch {
    const info = execSync("rustc -vV", { encoding: "utf8" });
    const m = /host: (\S+)/.exec(info);
    if (!m) throw new Error("Could not determine Rust host triple");
    return m[1];
  }
}

/** @returns {{ url: string, archive: 'zip' | 'tar.gz', nodePath: string }} */
function nodeDownload(triple) {
  const v = NODE_VERSION;
  const base = `https://nodejs.org/dist/v${v}`;
  const table = {
    "x86_64-pc-windows-msvc": {
      url: `${base}/node-v${v}-win-x64.zip`,
      archive: "zip",
      nodePath: `node-v${v}-win-x64/node.exe`,
    },
    "aarch64-pc-windows-msvc": {
      url: `${base}/node-v${v}-win-arm64.zip`,
      archive: "zip",
      nodePath: `node-v${v}-win-arm64/node.exe`,
    },
    "x86_64-apple-darwin": {
      url: `${base}/node-v${v}-darwin-x64.tar.gz`,
      archive: "tar.gz",
      nodePath: `node-v${v}-darwin-x64/bin/node`,
    },
    "aarch64-apple-darwin": {
      url: `${base}/node-v${v}-darwin-arm64.tar.gz`,
      archive: "tar.gz",
      nodePath: `node-v${v}-darwin-arm64/bin/node`,
    },
    "x86_64-unknown-linux-gnu": {
      url: `${base}/node-v${v}-linux-x64.tar.gz`,
      archive: "tar.gz",
      nodePath: `node-v${v}-linux-x64/bin/node`,
    },
    "aarch64-unknown-linux-gnu": {
      url: `${base}/node-v${v}-linux-arm64.tar.gz`,
      archive: "tar.gz",
      nodePath: `node-v${v}-linux-arm64/bin/node`,
    },
  };
  const entry = table[triple];
  if (!entry) throw new Error(`Unsupported target triple: ${triple}`);
  return entry;
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

function extractArchive(archivePath, archive, outDir) {
  if (archive === "zip") {
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
        { stdio: "inherit" },
      );
    } else {
      execSync(`unzip -o "${archivePath}" -d "${outDir}"`, { stdio: "inherit" });
    }
    return;
  }
  execSync(`tar -xzf "${archivePath}" -C "${outDir}"`, { stdio: "inherit" });
}

if (!existsSync(serverCjs)) {
  console.error("Missing server bundle. Run: node scripts/bundle-server.mjs");
  process.exit(1);
}

if (!existsSync(join(webDist, "index.html"))) {
  console.error("Missing web build. Run: npm run build -w @testops-hub/web");
  process.exit(1);
}

const triple = process.env.RUNSIDE_TARGET_TRIPLE?.trim() || hostTriple();
const spec = nodeDownload(triple);
const ext = triple.includes("windows") ? ".exe" : "";
const finalName = `runside-server-${triple}${ext}`;
const cacheDir = join(sidecarDir, "node-cache");
const extractDir = join(cacheDir, "extract");
const archiveName = spec.url.split("/").pop();
const archivePath = join(cacheDir, archiveName);

mkdirSync(binariesDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });

if (existsSync(resourcesWeb)) rmSync(resourcesWeb, { recursive: true, force: true });
cpSync(webDist, resourcesWeb, { recursive: true });
copyFileSync(serverCjs, join(resourcesDir, "server.cjs"));
console.log(`Resources ready under ${resourcesDir}`);

if (!existsSync(archivePath)) {
  await download(spec.url, archivePath);
} else {
  console.log(`Using cached ${archivePath}`);
}

if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
mkdirSync(extractDir, { recursive: true });
extractArchive(archivePath, spec.archive, extractDir);

const nodeSrc = join(extractDir, spec.nodePath);
if (!existsSync(nodeSrc)) {
  throw new Error(`Node binary not found after extract: ${nodeSrc}`);
}

const dest = join(binariesDir, finalName);
copyFileSync(nodeSrc, dest);
if (!triple.includes("windows")) {
  chmodSync(dest, 0o755);
}

console.log(`Sidecar (Node ${NODE_VERSION}) ready -> ${dest}`);
console.log(`Invoke as: ${finalName} <resources>/server.cjs`);
