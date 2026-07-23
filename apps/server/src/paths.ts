import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  DEFAULT_SETTINGS,
  type HubSettings,
} from "@testops-hub/shared";

export function hubDataDir(): string {
  return join(homedir(), ".runside");
}

export function settingsPath(): string {
  return join(hubDataDir(), "settings.json");
}

export function cacheDir(): string {
  return join(hubDataDir(), "cache");
}

/** Run ids must be numeric (GitHub Actions databaseId). */
export function assertSafeRunId(runId: string | number): string {
  const id = String(runId);
  if (!/^\d+$/.test(id)) {
    throw new Error("Invalid run id");
  }
  return id;
}

/**
 * Artifact names are a single path segment (no separators / traversal).
 * Allows typical GitHub artifact names like allure-report-main.
 */
export function assertSafeArtifactName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Invalid artifact name");
  if (
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    throw new Error("Invalid artifact name");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error("Invalid artifact name");
  }
  return trimmed;
}

function assertInsideCache(resolved: string): string {
  const root = resolve(cacheDir()) + sep;
  const full = resolve(resolved);
  if (full !== resolve(cacheDir()) && !full.startsWith(root)) {
    throw new Error("Path escapes cache directory");
  }
  return full;
}

export function artifactCacheDir(runId: string | number, artifactName: string): string {
  const id = assertSafeRunId(runId);
  const name = assertSafeArtifactName(artifactName);
  return assertInsideCache(join(cacheDir(), id, name));
}

export async function ensureHubDirs(): Promise<void> {
  await mkdir(hubDataDir(), { recursive: true });
  await mkdir(cacheDir(), { recursive: true });
}

/** Migrate settings from older ~/.testops-hub if present and new dir empty. */
async function maybeMigrateLegacySettings(): Promise<void> {
  const legacy = join(homedir(), ".testops-hub", "settings.json");
  const next = settingsPath();
  if (!existsSync(next) && existsSync(legacy)) {
    await ensureHubDirs();
    const raw = await readFile(legacy, "utf8");
    await writeFile(next, raw, "utf8");
  }
}

export async function loadSettings(): Promise<HubSettings> {
  await ensureHubDirs();
  await maybeMigrateLegacySettings();
  const path = settingsPath();
  if (!existsSync(path)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<HubSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: HubSettings): Promise<HubSettings> {
  await ensureHubDirs();
  const next: HubSettings = {
    owner: settings.owner.trim(),
    repo: settings.repo.trim(),
    workflowFile: settings.workflowFile.trim(),
    workflowName: settings.workflowName.trim(),
    artifactPrefix:
      settings.artifactPrefix.trim() || DEFAULT_SETTINGS.artifactPrefix,
  };
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function repoSlug(settings: HubSettings): string | null {
  if (!settings.owner || !settings.repo) return null;
  return `${settings.owner}/${settings.repo}`;
}

export function isArtifactCached(runId: string | number, artifactName: string): boolean {
  const dir = artifactCacheDir(runId, artifactName);
  const name = assertSafeArtifactName(artifactName);
  return (
    existsSync(join(dir, "index.html")) ||
    existsSync(join(dir, name, "index.html"))
  );
}

export function resolveReportIndex(
  runId: string | number,
  artifactName: string,
): string | null {
  const dir = artifactCacheDir(runId, artifactName);
  const name = assertSafeArtifactName(artifactName);
  const candidates = [
    join(dir, "index.html"),
    join(dir, name, "index.html"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function reportUrlPath(runId: string | number, artifactName: string): string {
  const id = assertSafeRunId(runId);
  const name = assertSafeArtifactName(artifactName);
  const index = resolveReportIndex(id, name);
  if (!index) {
    return `/reports/${id}/${encodeURIComponent(name)}/`;
  }
  const dir = artifactCacheDir(id, name);
  const rel = index.slice(dir.length).replace(/\\/g, "/");
  if (rel === "/index.html" || rel === "index.html") {
    return `/reports/${id}/${encodeURIComponent(name)}/`;
  }
  const folder = rel.replace(/^\//, "").replace(/\/index\.html$/, "");
  return `/reports/${id}/${encodeURIComponent(name)}/${folder}/`;
}

export async function clearReportCache(): Promise<void> {
  await rm(cacheDir(), { recursive: true, force: true });
  await mkdir(cacheDir(), { recursive: true });
}
