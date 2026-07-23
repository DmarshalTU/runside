import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { HubSettings, WorkflowRun } from "@testops-hub/shared";
import { api } from "../api";
import {
  formatDuration,
  formatWhen,
  isActiveRunStatus,
  statusClass,
  statusLabel,
} from "../format";
import { ensureNotifyPermission, notifyRunFinished } from "../notify";

function hasActiveRuns(runs: WorkflowRun[]): boolean {
  return runs.some((r) => isActiveRunStatus(r.status));
}

type StatusFilter = "all" | "active" | "success" | "failure" | "cancelled";

function matchesFilter(run: WorkflowRun, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return isActiveRunStatus(run.status);
  if (run.status !== "completed") return false;
  const c = (run.conclusion || "").toLowerCase();
  if (filter === "success") return c === "success";
  if (filter === "failure") return c === "failure" || c === "timed_out";
  if (filter === "cancelled") return c === "cancelled";
  return true;
}

export function RunsPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [settings, setSettings] = useState<HubSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [branchFilter, setBranchFilter] = useState("");
  const loadGen = useRef(0);
  const prevStatus = useRef<Map<number, string>>(new Map());

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const gen = ++loadGen.current;
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const s = await api.getSettings();
      if (gen !== loadGen.current) return;
      setSettings(s);
      if (!s.owner || !s.repo) {
        setRuns([]);
        setError(null);
        return;
      }
      const data = await api.listRuns(30);
      if (gen !== loadGen.current) return;

      // Desktop notify when a previously active run completes
      for (const run of data.runs) {
        const prev = prevStatus.current.get(run.databaseId);
        if (
          prev &&
          isActiveRunStatus(prev) &&
          run.status === "completed"
        ) {
          void ensureNotifyPermission().then((ok) => {
            if (ok) {
              notifyRunFinished({
                runId: run.databaseId,
                title: run.displayTitle,
                conclusion: run.conclusion,
              });
            }
          });
        }
        prevStatus.current.set(run.databaseId, run.status);
      }

      setRuns(data.runs);
    } catch (err) {
      if (gen !== loadGen.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === loadGen.current && !opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadGen.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!hasActiveRuns(runs)) return;
    void ensureNotifyPermission();
    const timer = window.setInterval(() => {
      void load({ quiet: true });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [runs, load]);

  const configured = Boolean(settings?.owner && settings?.repo);
  const watching = hasActiveRuns(runs);
  const branchQ = branchFilter.trim().toLowerCase();
  const filtered = runs.filter((r) => {
    if (!matchesFilter(r, statusFilter)) return false;
    if (branchQ && !r.headBranch.toLowerCase().includes(branchQ)) return false;
    return true;
  });

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div>
          <h2>Workflow runs</h2>
          <p className="lead">
            {configured
              ? `${settings!.owner}/${settings!.repo} · ${settings!.workflowName || settings!.workflowFile}${watching ? " · auto-refreshing" : ""}`
              : "Configure a repository in Settings to list runs."}
          </p>
        </div>
        <div className="row">
          <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <Link className="btn btn-primary" to="/trigger">
            Trigger run
          </Link>
        </div>
      </div>

      {!configured && (
        <p className="muted">
          Go to <Link to="/settings">Settings</Link> and set owner / repo (and workflow file if
          needed).
        </p>
      )}

      {error && <div className="error-box">{error}</div>}

      {configured && !error && (
        <>
          <div className="row filters" style={{ marginBottom: "0.85rem" }}>
            <div className="field" style={{ minWidth: "140px" }}>
              <label htmlFor="status-filter">Status</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="field" style={{ minWidth: "160px" }}>
              <label htmlFor="branch-filter">Branch</label>
              <input
                id="branch-filter"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                placeholder="Filter branch…"
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="runs">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Title</th>
                  <th>Trigger</th>
                  <th>Branch</th>
                  <th>When</th>
                  <th>Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="muted">
                      {runs.length === 0
                        ? "No runs found for this workflow."
                        : "No runs match the current filters."}
                    </td>
                  </tr>
                )}
                {filtered.map((run) => (
                  <tr key={run.databaseId}>
                    <td>
                      <span className={`badge ${statusClass(run)}`}>{statusLabel(run)}</span>
                    </td>
                    <td>
                      <Link to={`/runs/${run.databaseId}`}>{run.displayTitle}</Link>
                      <div className="muted mono">#{run.databaseId}</div>
                    </td>
                    <td className="mono">{run.event}</td>
                    <td className="mono">{run.headBranch}</td>
                    <td>{formatWhen(run.createdAt)}</td>
                    <td className="mono">
                      {formatDuration(run.createdAt, run.updatedAt, {
                        live: isActiveRunStatus(run.status),
                      })}
                    </td>
                    <td>
                      <a href={run.url} target="_blank" rel="noreferrer">
                        GitHub
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
