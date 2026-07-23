import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { RunDetail, RunLogs, WorkflowJob } from "@testops-hub/shared";
import { api } from "../api";
import { formatBytes, formatWhen, isActiveRunStatus, statusClass, statusLabel } from "../format";

function isActiveStatus(status: string): boolean {
  return isActiveRunStatus(status);
}

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [jobs, setJobs] = useState<WorkflowJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | "all">("all");
  const [logs, setLogs] = useState<RunLogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLPreElement | null>(null);
  const loadGen = useRef(0);
  const logsGen = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const gen = ++loadGen.current;
    setError(null);
    try {
      const [data, jobData] = await Promise.all([
        api.getRun(id),
        api.listJobs(id),
      ]);
      if (gen !== loadGen.current) return;
      setRun(data);
      setJobs(jobData.jobs);
    } catch (err) {
      if (gen !== loadGen.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  const loadLogs = useCallback(async () => {
    if (!id) return;
    const gen = ++logsGen.current;
    setLogsLoading(true);
    try {
      const jobId = selectedJobId === "all" ? undefined : selectedJobId;
      const next = await api.getLogs(id, jobId);
      if (gen !== logsGen.current) return;
      setLogs(next);
    } catch (err) {
      if (gen !== logsGen.current) return;
      setLogs({
        runId: id,
        text: "",
        truncated: false,
        available: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (gen === logsGen.current) setLogsLoading(false);
    }
  }, [id, selectedJobId]);

  useEffect(() => {
    void load();
    return () => {
      loadGen.current += 1;
    };
  }, [load]);

  useEffect(() => {
    void loadLogs();
    return () => {
      logsGen.current += 1;
    };
  }, [loadLogs]);

  // Poll while the run (or any job) is still active
  useEffect(() => {
    if (!run) return;
    const active =
      isActiveStatus(run.status) || jobs.some((j) => isActiveStatus(j.status));
    if (!active) return;

    const timer = window.setInterval(() => {
      void load();
      void loadLogs();
    }, 10_000);

    return () => window.clearInterval(timer);
  }, [run, jobs, load, loadLogs]);

  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs?.text, autoScroll]);

  async function onDownload(name: string) {
    if (!id) return;
    setBusy(name);
    setMessage(null);
    setError(null);
    try {
      await api.downloadArtifact(id, name);
      setMessage(`Downloaded ${name}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onOpen(name: string) {
    if (!id) return;
    setBusy(name);
    setMessage(null);
    setError(null);
    try {
      const runData = run ?? (await api.getRun(id));
      const artifact = runData.artifacts.find((a) => a.name === name);
      if (!artifact?.cached) {
        await api.downloadArtifact(id, name);
        await load();
      }
      navigate(`/runs/${id}/report/${encodeURIComponent(name)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onOpenBrowser(name: string) {
    if (!id) return;
    setBusy(name);
    setMessage(null);
    setError(null);
    try {
      await api.openArtifact(id, name);
      setMessage("Opened report in your browser.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRerun() {
    if (!id) return;
    setBusy("rerun");
    setMessage(null);
    setError(null);
    try {
      const result = await api.rerun(id);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onCancel() {
    if (!id || !run) return;
    if (!window.confirm(`Cancel run #${id}?`)) return;
    setBusy("cancel");
    setMessage(null);
    setError(null);
    try {
      const result = await api.cancel(id);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onPin(name: string, pinned: boolean) {
    if (!id) return;
    setBusy(`pin-${name}`);
    setError(null);
    try {
      if (pinned) await api.pinCache(id, name);
      else await api.unpinCache(id, name);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (!id) {
    return <div className="error-box">Missing run id</div>;
  }

  const watching =
    run != null &&
    (isActiveStatus(run.status) || jobs.some((j) => isActiveStatus(j.status)));

  const selectedJob =
    selectedJobId === "all"
      ? null
      : jobs.find((j) => j.databaseId === selectedJobId) ?? null;

  return (
    <section className="panel">
      <p className="muted" style={{ marginTop: 0 }}>
        <Link to="/">← Runs</Link>
      </p>

      {!run && !error && <p className="muted">Loading run…</p>}
      {error && <div className="error-box">{error}</div>}
      {message && <div className="ok-box">{message}</div>}

      {run && (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h2 style={{ marginBottom: "0.35rem" }}>{run.displayTitle}</h2>
              <p className="lead">
                <span className={`badge ${statusClass(run)}`}>{statusLabel(run)}</span>{" "}
                <span className="mono">#{run.databaseId}</span> · {run.event} ·{" "}
                {run.headBranch} · {formatWhen(run.createdAt)}
                {watching ? " · auto-refreshing" : ""}
              </p>
            </div>
            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void onRerun()}
              >
                {busy === "rerun" ? "Re-running…" : "Re-run"}
              </button>
              <button
                className="btn"
                type="button"
                disabled={Boolean(busy) || !watching}
                onClick={() => void onCancel()}
                title={watching ? "Cancel this run" : "Run is not active"}
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
              <button className="btn" type="button" onClick={() => void load()}>
                Refresh
              </button>
              <a className="btn" href={run.url} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
          </div>

          <h3 style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>Jobs & logs</h3>
          <div className="log-toolbar row">
            <div className="field" style={{ minWidth: "220px" }}>
              <label htmlFor="job-select">Job</label>
              <select
                id="job-select"
                value={selectedJobId === "all" ? "all" : String(selectedJobId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedJobId(v === "all" ? "all" : Number(v));
                }}
              >
                <option value="all">All jobs</option>
                {jobs.map((j) => (
                  <option key={j.databaseId} value={j.databaseId}>
                    {j.name} · {j.status}
                    {j.conclusion ? `/${j.conclusion}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => void loadLogs()}
              disabled={logsLoading}
            >
              {logsLoading ? "Loading logs…" : "Reload logs"}
            </button>
            <label className="row muted" style={{ gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
          </div>

          {jobs.length > 0 && (
            <div className="job-chips row" style={{ marginBottom: "0.75rem" }}>
              {jobs.map((j) => (
                <button
                  key={j.databaseId}
                  type="button"
                  className={`badge ${statusClass(j)} ${selectedJobId === j.databaseId ? "chip-active" : ""}`}
                  onClick={() => setSelectedJobId(j.databaseId)}
                  title={j.url}
                >
                  {j.name}
                </button>
              ))}
            </div>
          )}

          {logs?.message && (
            <p className="muted">{logs.message}</p>
          )}

          {selectedJob && selectedJob.steps.length > 0 && (
            <ol className="step-list">
              {selectedJob.steps.map((s) => (
                <li key={`${s.number}-${s.name}`} className={statusClass({ status: s.status, conclusion: s.conclusion })}>
                  <span className="mono">{s.number}.</span> {s.name}{" "}
                  <span className={`badge ${statusClass({ status: s.status, conclusion: s.conclusion })}`}>
                    {statusLabel({ status: s.status, conclusion: s.conclusion })}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <pre className="log-view" ref={logRef}>
            {logsLoading && !logs?.text
              ? "Fetching CI logs…"
              : logs?.text || "# No log output"}
          </pre>

          <h3 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Allure artifacts</h3>
          {run.artifacts.length === 0 ? (
            <p className="muted">
              No matching artifacts yet
              {watching ? " (run still in progress)" : ""}. Finished runs should upload{" "}
              <span className="mono">allure-report-*</span>.
            </p>
          ) : (
            <div className="artifact-list">
              {run.artifacts.map((a) => (
                <div className="artifact-row" key={a.name}>
                  <div>
                    <strong>{a.name}</strong>
                    <div className="muted">
                      {a.kind} · {a.expired ? "Expired on GitHub" : "Available"}
                      {a.sizeInBytes != null ? ` · ${formatBytes(a.sizeInBytes)}` : ""}
                      {a.cached ? " · cached locally" : ""}
                      {a.pinned ? " · pinned" : ""}
                    </div>
                  </div>
                  <div className="row">
                    {a.cached && (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void onPin(a.name, !a.pinned)}
                      >
                        {a.pinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={Boolean(busy) || a.expired}
                      onClick={() => void onOpenBrowser(a.name)}
                    >
                      {busy === a.name ? "Opening…" : "Open in browser"}
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={Boolean(busy) || a.expired}
                      onClick={() => void onDownload(a.name)}
                    >
                      {busy === a.name ? "Working…" : a.cached ? "Re-download" : "Download"}
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={Boolean(busy) || a.expired}
                      onClick={() => void onOpen(a.name)}
                    >
                      {busy === a.name ? "Opening…" : "Open report"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
