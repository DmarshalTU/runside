import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [settings, setSettings] = useState<HubSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [branchFilter, setBranchFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
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

      for (const run of data.runs) {
        const prev = prevStatus.current.get(run.databaseId);
        if (prev && isActiveRunStatus(prev) && run.status === "completed") {
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
      if (gen === loadGen.current) setLoading(false);
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
    const timer = window.setInterval(() => void load({ quiet: true }), 8_000);
    return () => window.clearInterval(timer);
  }, [runs, load]);

  const branchQ = branchFilter.trim().toLowerCase();
  const workflowQ = workflowFilter.trim().toLowerCase();
  const filtered = runs.filter((r) => {
    if (!matchesFilter(r, statusFilter)) return false;
    if (branchQ && !r.headBranch.toLowerCase().includes(branchQ)) return false;
    if (workflowQ && !r.workflowName.toLowerCase().includes(workflowQ)) return false;
    return true;
  });

  const watching = hasActiveRuns(runs);
  const needsSetup = Boolean(settings && (!settings.owner || !settings.repo));

  function toggleSelect(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  }

  function goCompare() {
    if (selected.length !== 2) return;
    const [a, b] = selected;
    navigate(`/compare?a=${a}&b=${b}`);
  }

  async function onRerun(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await api.rerun(id);
      await load({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(id: number) {
    if (!window.confirm(`Cancel run #${id}?`)) return;
    setBusyId(id);
    setError(null);
    try {
      await api.cancel(id);
      await load({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ marginBottom: "0.35rem" }}>Runs</h2>
          <p className="lead">
            {!settings
              ? "Loading…"
              : needsSetup
                ? "Configure owner/repo in Settings to list workflow runs."
                : `${settings.owner}/${settings.repo} · ${settings.workflowName || settings.workflowFile || "all workflows"}${watching ? " · auto-refreshing" : ""}`}
          </p>
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={selected.length !== 2}
            onClick={goCompare}
            title="Select exactly two runs"
          >
            Compare ({selected.length}/2)
          </button>
          <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {needsSetup && (
        <p className="muted">
          Go to <Link to="/settings">Settings</Link> to pick a repository.
        </p>
      )}

      {!needsSetup && (
        <>
          <div className="row" style={{ marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
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
            <div className="field" style={{ minWidth: "140px" }}>
              <label htmlFor="branch-filter">Branch</label>
              <input
                id="branch-filter"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                placeholder="Filter branch…"
              />
            </div>
            <div className="field" style={{ minWidth: "160px" }}>
              <label htmlFor="workflow-filter">Workflow</label>
              <input
                id="workflow-filter"
                value={workflowFilter}
                onChange={(e) => setWorkflowFilter(e.target.value)}
                placeholder="Filter workflow…"
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="runs">
              <thead>
                <tr>
                  <th />
                  <th>Status</th>
                  <th>Title</th>
                  <th>Workflow</th>
                  <th>Branch</th>
                  <th>When</th>
                  <th>Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="muted">
                      {runs.length === 0
                        ? "No runs found."
                        : "No runs match the current filters."}
                    </td>
                  </tr>
                )}
                {filtered.map((run) => {
                  const active = isActiveRunStatus(run.status);
                  return (
                    <tr key={run.databaseId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(run.databaseId)}
                          onChange={() => toggleSelect(run.databaseId)}
                          aria-label={`Select run ${run.databaseId}`}
                        />
                      </td>
                      <td>
                        <span className={`badge ${statusClass(run)}`}>{statusLabel(run)}</span>
                      </td>
                      <td>
                        <Link to={`/runs/${run.databaseId}`}>{run.displayTitle}</Link>
                        <div className="muted mono">#{run.databaseId}</div>
                      </td>
                      <td className="mono">{run.workflowName}</td>
                      <td className="mono">{run.headBranch}</td>
                      <td>{formatWhen(run.createdAt)}</td>
                      <td className="mono">
                        {formatDuration(run.createdAt, run.updatedAt, {
                          live: active,
                        })}
                      </td>
                      <td>
                        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={busyId === run.databaseId}
                            onClick={() => void onRerun(run.databaseId)}
                          >
                            Re-run
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={!active || busyId === run.databaseId}
                            onClick={() => void onCancel(run.databaseId)}
                          >
                            Cancel
                          </button>
                          <a href={run.url} target="_blank" rel="noreferrer">
                            GitHub
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
