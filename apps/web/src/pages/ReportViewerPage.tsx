import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

export function ReportViewerPage() {
  const { id, name } = useParams<{ id: string; name: string }>();
  const navigate = useNavigate();
  const artifactName = name ? decodeURIComponent(name) : "";
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const prepare = useCallback(async () => {
    if (!id || !artifactName) return;
    setLoading(true);
    setError(null);
    try {
      const run = await api.getRun(id);
      const artifact = run.artifacts.find((a) => a.name === artifactName);
      if (artifact?.cached && artifact.reportUrl) {
        setReportUrl(artifact.reportUrl);
        return;
      }
      const result = await api.downloadArtifact(id, artifactName);
      setReportUrl(result.reportUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id, artifactName]);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  if (!id || !artifactName) {
    return <div className="error-box">Missing run or artifact</div>;
  }

  return (
    <div className="report-shell">
      <header className="report-bar">
        <div className="row">
          <Link className="btn" to={`/runs/${id}`}>
            ← Back to run
          </Link>
          <Link className="btn btn-ghost" to="/">
            Runs
          </Link>
          <strong className="mono">{artifactName}</strong>
          <span className="muted mono">#{id}</span>
        </div>
        <div className="row">
          {reportUrl && (
            <a className="btn" href={reportUrl} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
          )}
          <button className="btn" type="button" onClick={() => void prepare()} disabled={loading}>
            {loading ? "Loading…" : "Reload"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate(-1)}>
            History back
          </button>
        </div>
      </header>

      {error && (
        <div className="panel" style={{ margin: "1rem" }}>
          <div className="error-box">{error}</div>
        </div>
      )}

      {loading && !reportUrl && (
        <div className="report-loading muted">Preparing Allure report…</div>
      )}

      {reportUrl && (
        <iframe
          className="report-frame"
          title={`Allure · ${artifactName}`}
          src={reportUrl}
          sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-modals"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
