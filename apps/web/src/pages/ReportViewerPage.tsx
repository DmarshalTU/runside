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

  async function openInBrowser() {
    if (!id || !artifactName) return;
    setError(null);
    try {
      await api.openArtifact(id, artifactName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

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
            <button className="btn" type="button" onClick={() => void openInBrowser()}>
              Open in browser
            </button>
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
          src={
            reportUrl.startsWith("http")
              ? reportUrl
              : `${window.location.origin}${reportUrl}`
          }
          // allow-same-origin is required: Allure fetches data/*.json from the report origin.
          // Without it (esp. in WebView2) the viewer is a blank white page.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
