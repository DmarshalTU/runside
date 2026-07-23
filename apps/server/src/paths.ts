import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  DEFAULT_SETTINGS,
  type ArtifactKind,
  type CachedReport,
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

export function cacheKey(runId: string | number, artifactName: string): string {
  return `${assertSafeRunId(runId)}/${assertSafeArtifactName(artifactName)}`;
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

export function normalizeSettings(parsed: Partial<HubSettings>): HubSettings {
  const base = { ...DEFAULT_SETTINGS, ...parsed };

  let artifactPrefixes = Array.isArray(parsed.artifactPrefixes)
    ? parsed.artifactPrefixes.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [...DEFAULT_SETTINGS.artifactPrefixes];
  const legacyPrefix = (parsed.artifactPrefix ?? base.artifactPrefix)?.trim();
  if (legacyPrefix && !artifactPrefixes.includes(legacyPrefix)) {
    artifactPrefixes = [legacyPrefix, ...artifactPrefixes];
  }
  if (artifactPrefixes.length === 0) {
    artifactPrefixes = [...DEFAULT_SETTINGS.artifactPrefixes];
  }

  let workflowFiles = Array.isArray(parsed.workflowFiles)
    ? parsed.workflowFiles.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];
  const wf = (parsed.workflowFile ?? base.workflowFile)?.trim();
  if (wf && !workflowFiles.includes(wf)) {
    workflowFiles = [wf, ...workflowFiles];
  }

  const pinnedCache = Array.isArray(parsed.pinnedCache)
    ? parsed.pinnedCache.filter((s): s is string => typeof s === "string")
    : [];

  return {
    ...base,
    owner: (base.owner ?? "").trim(),
    repo: (base.repo ?? "").trim(),
    workflowFile: wf ?? "",
    workflowName: (base.workflowName ?? "").trim(),
    workflowFiles,
    artifactPrefix: legacyPrefix || artifactPrefixes[0] || DEFAULT_SETTINGS.artifactPrefix,
    artifactPrefixes,
    cacheMaxReports:
      typeof parsed.cacheMaxReports === "number"
        ? Math.max(0, parsed.cacheMaxReports)
        : DEFAULT_SETTINGS.cacheMaxReports,
    cacheMaxMb:
      typeof parsed.cacheMaxMb === "number"
        ? Math.max(0, parsed.cacheMaxMb)
        : DEFAULT_SETTINGS.cacheMaxMb,
    recentRepos: Array.isArray(parsed.recentRepos)
      ? parsed.recentRepos.filter((s): s is string => typeof s === "string")
      : [],
    githubHost: (parsed.githubHost ?? base.githubHost ?? "github.com").trim() || "github.com",
    pinnedCache,
  };
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
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: HubSettings): Promise<HubSettings> {
  await ensureHubDirs();
  const normalized = normalizeSettings(settings);
  const owner = normalized.owner;
  const repo = normalized.repo;
  const slug = owner && repo ? `${owner}/${repo}` : "";
  const recent = [
    ...(slug ? [slug] : []),
    ...(normalized.recentRepos ?? []),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .slice(0, 12);

  const next: HubSettings = {
    ...normalized,
    recentRepos: recent,
  };
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function repoSlug(settings: HubSettings): string | null {
  if (!settings.owner || !settings.repo) return null;
  return `${settings.owner}/${settings.repo}`;
}

export function artifactKind(name: string): ArtifactKind {
  const n = name.toLowerCase();
  if (n.startsWith("allure-report") || n.includes("allure")) return "allure";
  if (n.startsWith("playwright-report") || n.includes("playwright-report")) return "playwright";
  if (n.startsWith("trace") || n.includes("trace")) return "trace";
  return "other";
}

export function isArtifactCached(runId: string | number, artifactName: string): boolean {
  const dir = artifactCacheDir(runId, artifactName);
  const name = assertSafeArtifactName(artifactName);
  const kind = artifactKind(name);
  if (kind === "trace") {
    return existsSync(dir);
  }
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
  if (artifactKind(name) === "trace") {
    return `/reports/${id}/${encodeURIComponent(name)}/`;
  }
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

async function dirSizeBytes(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await dirSizeBytes(p);
    else {
      try {
        total += (await stat(p)).size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

export async function listCachedReports(settings: HubSettings): Promise<CachedReport[]> {
  await ensureHubDirs();
  const root = cacheDir();
  if (!existsSync(root)) return [];
  const pinned = new Set(settings.pinnedCache ?? []);
  const out: CachedReport[] = [];
  const runDirs = await readdir(root, { withFileTypes: true });
  for (const runEnt of runDirs) {
    if (!runEnt.isDirectory() || !/^\d+$/.test(runEnt.name)) continue;
    const runId = runEnt.name;
    const arts = await readdir(join(root, runId), { withFileTypes: true });
    for (const art of arts) {
      if (!art.isDirectory()) continue;
      try {
        assertSafeArtifactName(art.name);
      } catch {
        continue;
      }
      if (!isArtifactCached(runId, art.name)) continue;
      const dir = artifactCacheDir(runId, art.name);
      const st = await stat(dir);
      out.push({
        runId,
        artifactName: art.name,
        kind: artifactKind(art.name),
        reportUrl: reportUrlPath(runId, art.name),
        pinned: pinned.has(cacheKey(runId, art.name)),
        sizeBytes: await dirSizeBytes(dir),
        mtimeMs: st.mtimeMs,
      });
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

export async function setPinned(
  settings: HubSettings,
  runId: string,
  artifactName: string,
  pinned: boolean,
): Promise<HubSettings> {
  const key = cacheKey(runId, artifactName);
  const set = new Set(settings.pinnedCache ?? []);
  if (pinned) set.add(key);
  else set.delete(key);
  return saveSettings({ ...settings, pinnedCache: [...set] });
}

export async function pruneCache(settings: HubSettings): Promise<void> {
  const maxReports = settings.cacheMaxReports ?? 0;
  const maxMb = settings.cacheMaxMb ?? 0;
  if (maxReports <= 0 && maxMb <= 0) return;

  const pinned = new Set(settings.pinnedCache ?? []);
  let items = await listCachedReports(settings);

  const removeOne = async (item: CachedReport) => {
    if (pinned.has(cacheKey(item.runId, item.artifactName))) return false;
    await rm(artifactCacheDir(item.runId, item.artifactName), {
      recursive: true,
      force: true,
    });
    return true;
  };

  // Oldest first among unpinned
  const unpinnedOldest = () =>
    [...items]
      .filter((i) => !pinned.has(cacheKey(i.runId, i.artifactName)))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

  if (maxReports > 0) {
    while (items.length > maxReports) {
      const victims = unpinnedOldest();
      if (victims.length === 0) break;
      await removeOne(victims[0]!);
      items = await listCachedReports(settings);
    }
  }

  if (maxMb > 0) {
    const limit = maxMb * 1024 * 1024;
    let total = items.reduce((s, i) => s + i.sizeBytes, 0);
    while (total > limit) {
      const victims = unpinnedOldest();
      if (victims.length === 0) break;
      const v = victims[0]!;
      await removeOne(v);
      items = await listCachedReports(settings);
      total = items.reduce((s, i) => s + i.sizeBytes, 0);
    }
  }
}
