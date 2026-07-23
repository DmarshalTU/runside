import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import type {
  AllureTestStatus,
  CompareBucket,
  CompareResult,
  CompareStats,
  CompareTestRow,
  CompareTestSide,
} from "@testops-hub/shared";
import {
  artifactCacheDir,
  assertSafeArtifactName,
  assertSafeRunId,
  resolveReportIndex,
} from "./paths.js";

type TreeLeaf = {
  id?: string;
  nodeId?: string;
  name?: string;
  status?: string;
  duration?: number;
  flaky?: boolean;
};

type SearchEntry = {
  id?: string;
  nodeId?: string;
  name?: string;
  fullName?: string;
  historyId?: string;
};

type ParsedTest = CompareTestSide & {
  key: string;
  nodeId?: string;
};

function emptyStats(): CompareStats {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    broken: 0,
    skipped: 0,
    unknown: 0,
  };
}

function normalizeStatus(raw: string | undefined): AllureTestStatus {
  const s = (raw ?? "unknown").toLowerCase();
  if (s === "passed" || s === "failed" || s === "broken" || s === "skipped") {
    return s;
  }
  return "unknown";
}

function isBad(status: AllureTestStatus): boolean {
  return status === "failed" || status === "broken";
}

function isGood(status: AllureTestStatus): boolean {
  return status === "passed";
}

export function resolveReportRoot(
  runId: string | number,
  artifactName: string,
): string | null {
  const index = resolveReportIndex(runId, artifactName);
  if (!index) return null;
  return dirname(index);
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadTestsFromReport(reportRoot: string): Promise<{
  tests: Map<string, ParsedTest>;
  stats: CompareStats;
}> {
  const tree = await readJson<{ leavesById?: Record<string, TreeLeaf> }>(
    join(reportRoot, "widgets", "tree.json"),
  );
  if (!tree?.leavesById) {
    throw new Error(
      "Allure 3 widgets/tree.json not found — only Awesome reports are supported for compare.",
    );
  }

  const search = await readJson<SearchEntry[]>(
    join(reportRoot, "widgets", "search-index.json"),
  );
  const fullNameByNode = new Map<string, string>();
  const fullNameByHistory = new Map<string, string>();
  if (Array.isArray(search)) {
    for (const entry of search) {
      if (entry.fullName) {
        if (entry.nodeId) fullNameByNode.set(entry.nodeId, entry.fullName);
        if (entry.id) fullNameByNode.set(String(entry.id), entry.fullName);
        if (entry.historyId) fullNameByHistory.set(entry.historyId, entry.fullName);
      }
    }
  }

  const tests = new Map<string, ParsedTest>();

  for (const [nodeId, leaf] of Object.entries(tree.leavesById)) {
    const historyId = leaf.id?.trim();
    const status = normalizeStatus(leaf.status);
    const fullName =
      (historyId ? fullNameByHistory.get(historyId) : undefined) ??
      fullNameByNode.get(nodeId) ??
      fullNameByNode.get(leaf.nodeId ?? "") ??
      undefined;

    // Prefer fullName for cross-run identity; historyId often changes with params/env.
    const key =
      (fullName && fullName.trim()) ||
      historyId ||
      `name:${leaf.name ?? nodeId}`;

    const candidate: ParsedTest = {
      key,
      nodeId: leaf.nodeId ?? nodeId,
      name: leaf.name ?? fullName ?? key,
      fullName,
      status,
      durationMs: typeof leaf.duration === "number" ? leaf.duration : undefined,
      flaky: Boolean(leaf.flaky),
    };

    const existing = tests.get(key);
    if (!existing || rankStatus(candidate.status) > rankStatus(existing.status)) {
      tests.set(key, candidate);
    }
  }

  const stats = emptyStats();
  for (const t of tests.values()) {
    stats.total += 1;
    stats[t.status] += 1;
  }

  return { tests, stats };
}

/** Higher = worse outcome (used when collapsing duplicates). */
function rankStatus(status: AllureTestStatus): number {
  switch (status) {
    case "failed":
      return 4;
    case "broken":
      return 3;
    case "unknown":
      return 2;
    case "skipped":
      return 1;
    case "passed":
      return 0;
  }
}

function classify(
  a: ParsedTest | undefined,
  b: ParsedTest | undefined,
): CompareBucket {
  if (a && !b) return "removed";
  if (!a && b) return "new";
  if (!a || !b) return "unchanged";
  if (isGood(a.status) && isBad(b.status)) return "regressed";
  if (isBad(a.status) && isGood(b.status)) return "fixed";
  if (isBad(a.status) && isBad(b.status)) return "stillFailing";
  if (a.status === b.status) return "unchanged";
  // skipped <-> passed etc.
  if (isBad(b.status)) return "regressed";
  if (isBad(a.status) && !isBad(b.status)) return "fixed";
  return "unchanged";
}

const BUCKET_ORDER: CompareBucket[] = [
  "regressed",
  "fixed",
  "stillFailing",
  "new",
  "removed",
  "unchanged",
];

export async function compareAllureReports(opts: {
  runA: string | number;
  runB: string | number;
  artifactA: string;
  artifactB: string;
}): Promise<CompareResult> {
  const runA = assertSafeRunId(opts.runA);
  const runB = assertSafeRunId(opts.runB);
  const artifactA = assertSafeArtifactName(opts.artifactA);
  const artifactB = assertSafeArtifactName(opts.artifactB);

  const rootA = resolveReportRoot(runA, artifactA);
  const rootB = resolveReportRoot(runB, artifactB);
  if (!rootA) {
    throw new Error(`No cached Allure report for run ${runA} / ${artifactA}`);
  }
  if (!rootB) {
    throw new Error(`No cached Allure report for run ${runB} / ${artifactB}`);
  }

  // Ensure paths stay under cache
  const cacheA = artifactCacheDir(runA, artifactA);
  const cacheB = artifactCacheDir(runB, artifactB);
  const inside = (root: string, child: string) => {
    const rel = relative(root, child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };
  if (!inside(cacheA, rootA) || !inside(cacheB, rootB)) {
    throw new Error("Report path escaped cache");
  }

  const [left, right] = await Promise.all([
    loadTestsFromReport(rootA),
    loadTestsFromReport(rootB),
  ]);

  const keys = new Set([...left.tests.keys(), ...right.tests.keys()]);
  const rows: CompareTestRow[] = [];
  const counts: Record<CompareBucket, number> = {
    regressed: 0,
    fixed: 0,
    stillFailing: 0,
    new: 0,
    removed: 0,
    unchanged: 0,
  };

  for (const key of keys) {
    const a = left.tests.get(key);
    const b = right.tests.get(key);
    const bucket = classify(a, b);
    counts[bucket] += 1;
    rows.push({
      key,
      bucket,
      name: b?.name ?? a?.name ?? key,
      fullName: b?.fullName ?? a?.fullName,
      a: a
        ? {
            status: a.status,
            name: a.name,
            fullName: a.fullName,
            durationMs: a.durationMs,
            flaky: a.flaky,
          }
        : undefined,
      b: b
        ? {
            status: b.status,
            name: b.name,
            fullName: b.fullName,
            durationMs: b.durationMs,
            flaky: b.flaky,
          }
        : undefined,
    });
  }

  rows.sort((x, y) => {
    const bi = BUCKET_ORDER.indexOf(x.bucket) - BUCKET_ORDER.indexOf(y.bucket);
    if (bi !== 0) return bi;
    return (x.fullName ?? x.name).localeCompare(y.fullName ?? y.name);
  });

  return {
    a: { runId: runA, artifactName: artifactA, stats: left.stats },
    b: { runId: runB, artifactName: artifactB, stats: right.stats },
    counts,
    rows,
  };
}
