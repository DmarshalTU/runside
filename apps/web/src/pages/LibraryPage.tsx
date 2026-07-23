import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CachedReport } from "@testops-hub/shared";
import { api } from "../api";
import { formatBytes } from "../format";

export function LibraryPage() {
  const [reports, setReports] = useState<CachedReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.listCachedReports();
      setReports(data.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePin(r: CachedReport) {
    const key = `${r.runId}/${r.artifactName}`;
    setBusy(key);
    setError(null);
    try {
      if (r.pinned) await api.unpinCache(r.runId, r.artifactName);
      else await api.pinCache(r.runId, r.artifactName);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function openBrowser(r: CachedReport) {
    const key = `open-${r.runId}/${r.artifactName}`;
    setBusy(key);
    setMessage(null);
    setError(null);
    try {
      await api.openArtifact(r.runId, r.artifactName);
      setMessage("Opened in browser.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ marginBottom: "0.35rem" }}>Library</h2>
          <p className="lead">Cached reports on this machine — reopen offline without GitHub.</p>
        </div>
        <button className="btn" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="ok-box">{message}</div>}

      {reports.length === 0 ? (
        <p className="muted">No cached reports yet. Download an artifact from a run.</p>
      ) : (
        <div className="artifact-list">
          {reports.map((r) => {
            const key = `${r.runId}/${r.artifactName}`;
            return (
              <div className="artifact-row" key={key}>
                <div>
                  <strong>{r.artifactName}</strong>
                  <div className="muted">
                    {r.kind} · run{" "}
                    <Link to={`/runs/${r.runId}`}>#{r.runId}</Link>
                    {` · ${formatBytes(r.sizeBytes)}`}
                    {r.pinned ? " · pinned" : ""}
                  </div>
                </div>
                <div className="row">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy === key}
                    onClick={() => void togglePin(r)}
                  >
                    {r.pinned ? "Unpin" : "Pin"}
                  </button>
                  <Link
                    className="btn"
                    to={`/runs/${r.runId}/report/${encodeURIComponent(r.artifactName)}`}
                  >
                    Open
                  </Link>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void openBrowser(r)}
                  >
                    Browser
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
