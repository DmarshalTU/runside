import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { RunDetail } from "@testops-hub/shared";
import { api } from "../api";
import { formatDuration, formatWhen, statusClass, statusLabel } from "../format";

function Side({ run, label }: { run: RunDetail | null; label: string }) {
  if (!run) {
    return (
      <div className="panel" style={{ background: "var(--bg)", flex: 1 }}>
        <h3>{label}</h3>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const allure = run.artifacts.find((a) => a.kind === "allure" && a.cached);

  return (
    <div className="panel" style={{ background: "var(--bg)", flex: 1, minWidth: "280px" }}>
      <h3 style={{ marginTop: 0 }}>{label}</h3>
      <p>
        <span className={`badge ${statusClass(run)}`}>{statusLabel(run)}</span>{" "}
        <Link to={`/runs/${run.databaseId}`}>#{run.databaseId}</Link>
      </p>
      <p>
        <strong>{run.displayTitle}</strong>
      </p>
      <dl className="compare-meta">
        <div>
          <dt>Workflow</dt>
          <dd className="mono">{run.workflowName}</dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd className="mono">{run.headBranch}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{formatWhen(run.createdAt)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd className="mono">{formatDuration(run.createdAt, run.updatedAt)}</dd>
        </div>
        <div>
          <dt>Event</dt>
          <dd className="mono">{run.event}</dd>
        </div>
      </dl>
      <div className="row" style={{ marginTop: "1rem" }}>
        <Link className="btn" to={`/runs/${run.databaseId}`}>
          Open run
        </Link>
        {allure && (
          <Link
            className="btn btn-primary"
            to={`/runs/${run.databaseId}/report/${encodeURIComponent(allure.name)}`}
          >
            Open report
          </Link>
        )}
      </div>
      {run.artifacts.length > 0 && (
        <ul className="muted" style={{ marginTop: "1rem", paddingLeft: "1.1rem" }}>
          {run.artifacts.map((a) => (
            <li key={a.name}>
              {a.kind}: {a.name}
              {a.cached ? " (cached)" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ComparePage() {
  const [params] = useSearchParams();
  const aId = params.get("a") ?? "";
  const bId = params.get("b") ?? "";
  const [left, setLeft] = useState<RunDetail | null>(null);
  const [right, setRight] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!/^\d+$/.test(aId) || !/^\d+$/.test(bId)) {
      setError("Pick two runs from the Runs page (Compare).");
      return;
    }
    setError(null);
    try {
      const [ra, rb] = await Promise.all([api.getRun(aId), api.getRun(bId)]);
      setLeft(ra);
      setRight(rb);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [aId, bId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">
      <p className="muted" style={{ marginTop: 0 }}>
        <Link to="/">← Runs</Link>
      </p>
      <h2 style={{ marginBottom: "0.35rem" }}>Compare runs</h2>
      <p className="lead">Side-by-side metadata — open each report separately (no Allure merge).</p>
      {error && <div className="error-box">{error}</div>}
      <div className="row" style={{ alignItems: "stretch", gap: "1rem", flexWrap: "wrap" }}>
        <Side run={left} label="A" />
        <Side run={right} label="B" />
      </div>
    </section>
  );
}
