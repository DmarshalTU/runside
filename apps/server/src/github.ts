import type {
  GhStatus,
  HubSettings,
  RunArtifact,
  RunLogs,
  TriggerInputValues,
  WorkflowDispatchSchema,
  WorkflowInputField,
  WorkflowInputType,
  WorkflowJob,
  WorkflowRun,
} from "@testops-hub/shared";
import { parse as parseYaml } from "yaml";
import { GhError, resolveGhBin, runGh, runGhJson, runGhOk } from "./gh.js";
import {
  artifactCacheDir,
  assertSafeArtifactName,
  assertSafeRunId,
  isArtifactCached,
  reportUrlPath,
  repoSlug,
} from "./paths.js";
import { mkdir, rm } from "node:fs/promises";

export async function getGhStatus(): Promise<GhStatus> {
  try {
    const bin = resolveGhBin();
    const result = await runGh(["auth", "status"]);
    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.code !== 0) {
      return {
        installed: true,
        authenticated: false,
        message: combined.trim() || "Not logged in. Run: gh auth login",
      };
    }
    const loginMatch = combined.match(/Logged in to .* account (\S+)/i);
    return {
      installed: true,
      authenticated: true,
      message: `Authenticated via ${bin}`,
      loggedInAs: loginMatch?.[1],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || err instanceof GhError) {
      const isMissing =
        (err as NodeJS.ErrnoException).code === "ENOENT" ||
        (err instanceof GhError && err.result.code === 127);
      if (isMissing || (err instanceof GhError && /not found/i.test(err.message))) {
        return {
          installed: false,
          authenticated: false,
          message:
            "gh CLI not found. Install from https://cli.github.com/, then restart npm run dev. If needed set GH_PATH to the full path of gh.exe.",
        };
      }
    }
    return {
      installed: false,
      authenticated: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

type GhRunListItem = {
  databaseId: number;
  displayTitle: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  event: string;
  headBranch: string;
  createdAt: string;
  updatedAt: string;
  url: string;
};

type GhRunView = GhRunListItem & {
  jobs?: unknown[];
};

type GhArtifactApi = {
  artifacts: Array<{
    name: string;
    size_in_bytes: number;
    expired: boolean;
  }>;
};

function mapRun(item: GhRunListItem, actor?: string): WorkflowRun {
  return {
    databaseId: item.databaseId,
    displayTitle: item.displayTitle,
    workflowName: item.workflowName,
    status: item.status,
    conclusion: item.conclusion,
    event: item.event,
    headBranch: item.headBranch,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    url: item.url,
    actor,
  };
}

function requireRepo(settings: HubSettings): string {
  const slug = repoSlug(settings);
  if (!slug) {
    throw new Error("Configure owner and repo in settings first");
  }
  return slug;
}

export async function listRuns(
  settings: HubSettings,
  limit = 20,
): Promise<WorkflowRun[]> {
  const repo = requireRepo(settings);
  const workflow = settings.workflowName || settings.workflowFile;
  if (!workflow) {
    throw new Error("Set workflow file or workflow name in Settings");
  }
  const safeLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? limit : 20));
  const items = await runGhJson<GhRunListItem[]>([
    "run",
    "list",
    "--repo",
    repo,
    "--workflow",
    workflow,
    "--limit",
    String(safeLimit),
    "--json",
    "databaseId,displayTitle,workflowName,status,conclusion,event,headBranch,createdAt,updatedAt,url",
  ]);
  return items.map((i) => mapRun(i));
}

export async function getRun(
  settings: HubSettings,
  runId: string,
): Promise<GhRunView> {
  const repo = requireRepo(settings);
  return runGhJson<GhRunView>([
    "run",
    "view",
    runId,
    "--repo",
    repo,
    "--json",
    "databaseId,displayTitle,workflowName,status,conclusion,event,headBranch,createdAt,updatedAt,url",
  ]);
}

type GhJobStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
};

type GhJob = {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  url: string;
  steps?: GhJobStep[];
};

export async function listJobs(
  settings: HubSettings,
  runId: string,
): Promise<WorkflowJob[]> {
  const repo = requireRepo(settings);
  const data = await runGhJson<{ jobs: GhJob[] }>([
    "run",
    "view",
    runId,
    "--repo",
    repo,
    "--json",
    "jobs",
  ]);

  return (data.jobs ?? []).map((j) => ({
    databaseId: j.databaseId,
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    url: j.url,
    steps: (j.steps ?? []).map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      number: s.number,
    })),
  }));
}

const LOG_MAX_CHARS = 400_000;

/** Completed job logs — cached so polling does not re-download every few seconds. */
const jobLogCache = new Map<number, string>();

async function fetchJobLogText(repo: string, jobId: number): Promise<string> {
  const cached = jobLogCache.get(jobId);
  if (cached != null) return cached;

  // Works for completed jobs even while the parent run is still in_progress.
  // `gh run view --log` refuses until the entire run completes.
  const text = await runGhOk(
    ["api", `repos/${repo}/actions/jobs/${jobId}/logs`],
    { timeoutMs: 180_000 },
  );
  jobLogCache.set(jobId, text);
  // Bound memory: drop oldest entries if the map grows large
  if (jobLogCache.size > 40) {
    const first = jobLogCache.keys().next().value;
    if (first != null) jobLogCache.delete(first);
  }
  return text;
}

function formatStepsAsLog(job: WorkflowJob): string {
  const lines = [
    `# Job: ${job.name} (${job.status}${job.conclusion ? ` / ${job.conclusion}` : ""})`,
    `# Live step progress (full logs appear when this job completes)`,
    "",
  ];
  for (const step of job.steps) {
    const mark =
      step.status === "completed"
        ? step.conclusion === "success"
          ? "✓"
          : step.conclusion === "skipped"
            ? "·"
            : "✗"
        : step.status === "in_progress"
          ? "…"
          : " ";
    lines.push(
      `[${mark}] ${step.number}. ${step.name} — ${step.status}${step.conclusion ? ` (${step.conclusion})` : ""}`,
    );
  }
  return lines.join("\n");
}

export async function getRunLogs(
  settings: HubSettings,
  runId: string,
  jobId?: number,
): Promise<RunLogs> {
  const repo = requireRepo(settings);
  const jobs = await listJobs(settings, runId);

  const targets =
    jobId != null ? jobs.filter((j) => j.databaseId === jobId) : jobs;

  if (targets.length === 0) {
    return {
      runId,
      jobId,
      text: "",
      truncated: false,
      available: false,
      message: "No jobs found for this run yet.",
    };
  }

  const parts: string[] = [];
  let anyLog = false;
  const notes: string[] = [];

  for (const job of targets) {
    if (job.status === "completed") {
      try {
        const text = await fetchJobLogText(repo, job.databaseId);
        anyLog = true;
        parts.push(`######## ${job.name} ########\n${text.trimEnd()}\n`);
      } catch (err) {
        const detail =
          err instanceof GhError
            ? (err.result.stderr || err.result.stdout || err.message).trim()
            : err instanceof Error
              ? err.message
              : String(err);
        parts.push(formatStepsAsLog(job));
        parts.push(`\n# Could not download log text: ${detail}\n`);
        notes.push(`${job.name}: log download failed`);
      }
    } else {
      parts.push(formatStepsAsLog(job));
      parts.push("");
      notes.push(
        `${job.name}: still ${job.status} — showing steps; full log when the job finishes`,
      );
    }
  }

  // Fallback: entire run finished — try classic --log if we somehow got nothing
  if (!anyLog && jobs.every((j) => j.status === "completed")) {
    try {
      const args = ["run", "view", runId, "--repo", repo, "--log"];
      if (jobId != null) args.push("--job", String(jobId));
      const text = await runGhOk(args, { timeoutMs: 180_000 });
      anyLog = true;
      parts.length = 0;
      parts.push(text);
      notes.length = 0;
    } catch {
      // keep step summaries
    }
  }

  const combined = parts.join("\n").trimEnd();
  const truncated = combined.length > LOG_MAX_CHARS;
  const text = truncated ? combined.slice(-LOG_MAX_CHARS) : combined;

  return {
    runId,
    jobId,
    jobName: targets.length === 1 ? targets[0]?.name : undefined,
    text:
      text ||
      "# Waiting for jobs to start…",
    truncated,
    available: true,
    message: [
      anyLog ? undefined : "Full CI logs unlock per job when that job completes (GitHub limitation).",
      truncated ? "Log truncated to the last ~400KB for the UI." : undefined,
      ...notes,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
  };
}

export async function detectRepoFromGh(): Promise<{ owner: string; repo: string } | null> {
  try {
    const data = await runGhJson<{ nameWithOwner: string }>([
      "repo",
      "view",
      "--json",
      "nameWithOwner",
    ]);
    const [owner, repo] = (data.nameWithOwner ?? "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

export async function listArtifacts(
  settings: HubSettings,
  runId: string,
): Promise<RunArtifact[]> {
  const repo = requireRepo(settings);
  const safeId = assertSafeRunId(runId);
  const raw = await runGhOk([
    "api",
    `repos/${repo}/actions/runs/${safeId}/artifacts`,
  ]);
  const data = JSON.parse(raw) as GhArtifactApi;
  const prefix = settings.artifactPrefix || "allure-report-";

  return (data.artifacts ?? [])
    .filter((a) => a.name.startsWith(prefix))
    .filter((a) => {
      try {
        assertSafeArtifactName(a.name);
        return true;
      } catch {
        return false;
      }
    })
    .map((a) => {
      const cached = isArtifactCached(safeId, a.name);
      return {
        name: a.name,
        sizeInBytes: a.size_in_bytes,
        expired: a.expired,
        cached,
        reportUrl: cached ? reportUrlPath(safeId, a.name) : undefined,
      };
    });
}

export async function downloadArtifact(
  settings: HubSettings,
  runId: string,
  artifactName: string,
): Promise<{ reportUrl: string }> {
  const repo = requireRepo(settings);
  const safeId = assertSafeRunId(runId);
  const safeName = assertSafeArtifactName(artifactName);
  const dest = artifactCacheDir(safeId, safeName);

  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  await runGhOk(
    [
      "run",
      "download",
      safeId,
      "--repo",
      repo,
      "-n",
      safeName,
      "--dir",
      dest,
    ],
    { timeoutMs: 300_000 },
  );

  if (!isArtifactCached(safeId, safeName)) {
    throw new Error(
      `Downloaded ${safeName} but no index.html found. Ensure CI uploads a finished Allure HTML report.`,
    );
  }

  return { reportUrl: reportUrlPath(safeId, safeName) };
}

export async function getWorkflowDispatchSchema(
  settings: HubSettings,
): Promise<WorkflowDispatchSchema> {
  const repo = requireRepo(settings);
  const yamlText = await runGhOk([
    "workflow",
    "view",
    settings.workflowFile,
    "--repo",
    repo,
    "--yaml",
  ]);

  const doc = parseYaml(yamlText) as {
    name?: string;
    on?: {
      workflow_dispatch?: {
        inputs?: Record<
          string,
          {
            description?: string;
            required?: boolean;
            default?: string | boolean | number;
            type?: string;
            options?: string[];
          }
        >;
      };
    };
  };

  const rawInputs = doc.on?.workflow_dispatch?.inputs ?? {};
  const inputs: WorkflowInputField[] = Object.entries(rawInputs).map(
    ([name, def]) => {
      const type = normalizeInputType(def?.type);
      const defaultValue = stringifyDefault(def?.default, type);
      const options =
        type === "choice"
          ? (def?.options ?? []).map(String)
          : type === "boolean"
            ? ["false", "true"]
            : [];

      return {
        name,
        description: def?.description?.trim() || name,
        type,
        required: Boolean(def?.required),
        defaultValue,
        options,
      };
    },
  );

  return {
    workflowFile: settings.workflowFile,
    workflowName: doc.name?.trim() || settings.workflowName,
    inputs,
  };
}

function normalizeInputType(raw?: string): WorkflowInputType {
  switch ((raw ?? "string").toLowerCase()) {
    case "boolean":
      return "boolean";
    case "choice":
      return "choice";
    case "environment":
      return "environment";
    case "number":
      return "number";
    default:
      return "string";
  }
}

function stringifyDefault(
  value: string | boolean | number | undefined,
  type: WorkflowInputType,
): string {
  if (value === undefined || value === null) {
    if (type === "boolean") return "false";
    return "";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export async function dispatchWorkflow(
  settings: HubSettings,
  inputs: TriggerInputValues,
): Promise<void> {
  const repo = requireRepo(settings);
  if (!settings.workflowFile) {
    throw new Error("Set workflow file in Settings (e.g. playwright.yml)");
  }
  const args = [
    "workflow",
    "run",
    settings.workflowFile,
    "--repo",
    repo,
  ];

  for (const [key, raw] of Object.entries(inputs)) {
    const value = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
    if (value === "") continue;
    // Reject shell metacharacters in values even though we spawn without shell
    if (/[\r\n\0]/.test(value) || /[\r\n\0]/.test(key)) {
      throw new Error("Invalid workflow input");
    }
    args.push("-f", `${key}=${value}`);
  }

  await runGhOk(args);
}
