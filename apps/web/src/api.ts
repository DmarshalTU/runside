import type {
  ActionResult,
  CachedReport,
  CompareResult,
  DispatchResult,
  DownloadResult,
  GhRepoSummary,
  GhStatus,
  HubSettings,
  RunDetail,
  RunLogs,
  TriggerInputValues,
  WorkflowDispatchSchema,
  WorkflowJob,
  WorkflowRun,
} from "@testops-hub/shared";
import { hubUrl } from "./hub";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(hubUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string; detail?: string };
  if (!res.ok) {
    const msg =
      (data as { error?: string }).error ??
      `Request failed (${res.status})`;
    const detail = (data as { detail?: string }).detail;
    throw new Error(detail ? `${msg}\n${detail}` : msg);
  }
  return data;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),
  ghStatus: () => request<GhStatus>("/api/gh/status"),
  listRepos: (limit = 50) =>
    request<{ repos: GhRepoSummary[] }>(`/api/gh/repos?limit=${limit}`),
  getSettings: () => request<HubSettings>("/api/settings"),
  saveSettings: (settings: HubSettings) =>
    request<HubSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  detectRepo: () =>
    request<{ owner: string; repo: string }>("/api/settings/detect-repo", {
      method: "POST",
    }),
  clearCache: () =>
    request<{ ok: true; message: string }>("/api/cache", { method: "DELETE" }),
  listCachedReports: () =>
    request<{ reports: CachedReport[] }>("/api/cache/reports"),
  pinCache: (runId: string | number, name: string) =>
    request<HubSettings>(
      `/api/cache/${runId}/${encodeURIComponent(name)}/pin`,
      { method: "POST" },
    ),
  unpinCache: (runId: string | number, name: string) =>
    request<HubSettings>(
      `/api/cache/${runId}/${encodeURIComponent(name)}/pin`,
      { method: "DELETE" },
    ),
  listRuns: (limit = 20) =>
    request<{ runs: WorkflowRun[] }>(`/api/runs?limit=${limit}`),
  getRun: (id: string | number) => request<RunDetail>(`/api/runs/${id}`),
  listJobs: (id: string | number) =>
    request<{ jobs: WorkflowJob[] }>(`/api/runs/${id}/jobs`),
  getLogs: (id: string | number, jobId?: number) => {
    const q = jobId != null ? `?job=${jobId}` : "";
    return request<RunLogs>(`/api/runs/${id}/logs${q}`);
  },
  rerun: (id: string | number) =>
    request<ActionResult>(`/api/runs/${id}/rerun`, { method: "POST" }),
  cancel: (id: string | number) =>
    request<ActionResult>(`/api/runs/${id}/cancel`, { method: "POST" }),
  downloadArtifact: (runId: string | number, name: string) =>
    request<DownloadResult>(
      `/api/runs/${runId}/artifacts/${encodeURIComponent(name)}/download`,
      { method: "POST" },
    ),
  openArtifact: (runId: string | number, name: string) =>
    request<{ reportUrl: string; opened: string }>(
      `/api/runs/${runId}/artifacts/${encodeURIComponent(name)}/open`,
      { method: "POST" },
    ),
  compareRuns: (
    a: string | number,
    b: string | number,
    opts?: { artifactA?: string; artifactB?: string },
  ) => {
    const q = new URLSearchParams({ a: String(a), b: String(b) });
    if (opts?.artifactA) q.set("artifactA", opts.artifactA);
    if (opts?.artifactB) q.set("artifactB", opts.artifactB);
    return request<CompareResult>(`/api/compare?${q}`);
  },
  workflowInputs: () =>
    request<WorkflowDispatchSchema>("/api/workflows/inputs"),
  dispatch: (inputs: TriggerInputValues) =>
    request<DispatchResult>("/api/workflows/dispatch", {
      method: "POST",
      body: JSON.stringify(inputs),
    }),
};
