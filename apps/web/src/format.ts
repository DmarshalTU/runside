import type { WorkflowRun } from "@testops-hub/shared";

const ACTIVE = new Set([
  "queued",
  "waiting",
  "pending",
  "requested",
  "in_progress",
]);

/** Normalize GitHub status/conclusion for badges (empty string → null). */
export function normalizeRunState(
  run: Pick<WorkflowRun, "status" | "conclusion">,
): { status: string; conclusion: string | null } {
  const status = (run.status || "unknown").toLowerCase();
  const raw = run.conclusion;
  const conclusion =
    raw == null || raw === "" ? null : String(raw).toLowerCase();
  return { status, conclusion };
}

/**
 * CSS modifier class for badges.
 * Active runs use queued vs running; completed runs use conclusion.
 */
export function statusClass(
  run: Pick<WorkflowRun, "status" | "conclusion">,
): string {
  const { status, conclusion } = normalizeRunState(run);
  if (status === "in_progress") return "running";
  if (status === "queued" || status === "waiting" || status === "pending" || status === "requested") {
    return "queued";
  }
  if (status !== "completed") return status;
  return conclusion ?? "completed";
}

/** Human label aligned with GitHub Actions wording. */
export function statusLabel(
  run: Pick<WorkflowRun, "status" | "conclusion">,
): string {
  const { status, conclusion } = normalizeRunState(run);
  if (status === "in_progress") return "Running";
  if (status === "queued" || status === "waiting" || status === "pending" || status === "requested") {
    return "Queued";
  }
  if (status !== "completed") {
    return status.replaceAll("_", " ");
  }
  switch (conclusion) {
    case "success":
      return "Success";
    case "failure":
      return "Failure";
    case "cancelled":
      return "Cancelled";
    case "skipped":
      return "Skipped";
    case "timed_out":
      return "Timed out";
    case "action_required":
      return "Action required";
    case "neutral":
      return "Neutral";
    case "stale":
      return "Stale";
    default:
      return conclusion ? conclusion.replaceAll("_", " ") : "Completed";
  }
}

export function isActiveRunStatus(status: string): boolean {
  return ACTIVE.has((status || "").toLowerCase());
}

export function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function formatDuration(
  createdAt: string,
  updatedAt: string,
  opts?: { live?: boolean },
): string {
  const start = Date.parse(createdAt);
  const end = opts?.live ? Date.now() : Date.parse(updatedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m ${rem}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export function formatBytes(n?: number): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
