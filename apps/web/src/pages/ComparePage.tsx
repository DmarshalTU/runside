import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  CompareBucket,
  CompareResult,
  CompareTestRow,
  RunDetail,
} from "@testops-hub/shared";
import { api } from "../api";
import { formatDuration, formatWhen, statusClass, statusLabel } from "../format";

const BUCKET_LABELS: Record<CompareBucket, string> = {
  regressed: "Regressed",
  fixed: "Fixed",
  stillFailing: "Still failing",
  new: "New",
  removed: "Removed",
  unchanged: "Unchanged",
};

const BUCKET_ORDER: CompareBucket[] = [
  "regressed",
  "fixed",
  "stillFailing",
  "new",
  "removed",
  "unchanged",
];

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
    </div>
  );
}

function StatsLine({
  label,
  stats,
}: {
  label: string;
  stats: CompareResult["a"]["stats"];
}) {
  return (
    <p className="muted" style={{ margin: "0.25rem 0" }}>
      <strong>{label}</strong>: {stats.total} total ·{" "}
      <span className="badge success">{stats.passed} passed</span>{" "}
      <span className="badge failure">{stats.failed} failed</span>{" "}
      <span className="badge failure">{stats.broken} broken</span>{" "}
      <span className="badge skipped">{stats.skipped} skipped</span>
    </p>
  );
}

function DiffTable({
  rows,
  hideUnchanged,
}: {
  rows: CompareTestRow[];
  hideUnchanged: boolean;
}) {
  const visible = hideUnchanged
    ? rows.filter((r) => r.bucket !== "unchanged")
    : rows;

  if (visible.length === 0) {
    return <p className="muted">No test differences in this view.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="runs compare-tests">
        <thead>
          <tr>
            <th>Change</th>
            <th>Test</th>
            <th>A</th>
            <th>B</th>
            <th>Δ ms</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const da = row.a?.durationMs;
            const db = row.b?.durationMs;
            const delta =
              da != null && db != null ? db - da : null;
            return (
              <tr key={row.key} className={`compare-row-${row.bucket}`}>
                <td>
                  <span className={`badge compare-bucket-${row.bucket}`}>
                    {BUCKET_LABELS[row.bucket]}
                  </span>
                </td>
                <td>
                  <div>{row.name}</div>
                  {row.fullName && (
                    <div className="mono muted" style={{ fontSize: "0.78rem" }}>
                      {row.fullName}
                    </div>
                  )}
                </td>
                <td>
                  {row.a ? (
                    <span className={`badge ${row.a.status}`}>{row.a.status}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {row.b ? (
                    <span className={`badge ${row.b.status}`}>{row.b.status}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="mono">
                  {delta == null ? "—" : delta > 0 ? `+${delta}` : String(delta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ComparePage() {
  const [params] = useSearchParams();
  const aId = params.get("a") ?? "";
  const bId = params.get("b") ?? "";
  const [left, setLeft] = useState<RunDetail | null>(null);
  const [right, setRight] = useState<RunDetail | null>(null);
  const [diff, setDiff] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [hideUnchanged, setHideUnchanged] = useState(true);
  const [filter, setFilter] = useState<CompareBucket | "all">("all");

  const load = useCallback(async () => {
    if (!/^\d+$/.test(aId) || !/^\d+$/.test(bId)) {
      setError("Pick two runs from the Runs page (Compare).");
      return;
    }
    setError(null);
    setLoadingDiff(true);
    try {
      const [ra, rb, cmp] = await Promise.all([
        api.getRun(aId),
        api.getRun(bId),
        api.compareRuns(aId, bId),
      ]);
      setLeft(ra);
      setRight(rb);
      setDiff(cmp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDiff(false);
    }
  }, [aId, bId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!diff) return [];
    if (filter === "all") return diff.rows;
    return diff.rows.filter((r) => r.bucket === filter);
  }, [diff, filter]);

  return (
    <section className="panel">
      <p className="muted" style={{ marginTop: 0 }}>
        <Link to="/">← Runs</Link>
      </p>
      <h2 style={{ marginBottom: "0.35rem" }}>Compare runs</h2>
      <p className="lead">
        Metadata plus Allure test diff (matched by fullName / historyId). Downloads reports if needed.
      </p>
      {error && <div className="error-box">{error}</div>}
      <div className="row" style={{ alignItems: "stretch", gap: "1rem", flexWrap: "wrap" }}>
        <Side run={left} label="A" />
        <Side run={right} label="B" />
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Allure results</h3>
          <button
            className="btn"
            type="button"
            disabled={loadingDiff}
            onClick={() => void load()}
          >
            {loadingDiff ? "Comparing…" : "Re-compare"}
          </button>
        </div>

        {loadingDiff && !diff && <p className="muted">Downloading / parsing Allure reports…</p>}

        {diff && (
          <>
            <StatsLine
              label={`A #${diff.a.runId} (${diff.a.artifactName})`}
              stats={diff.a.stats}
            />
            <StatsLine
              label={`B #${diff.b.runId} (${diff.b.artifactName})`}
              stats={diff.b.stats}
            />

            <div className="row compare-chips" style={{ margin: "0.75rem 0", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn ${filter === "all" ? "btn-primary" : ""}`}
                onClick={() => setFilter("all")}
              >
                All changes
              </button>
              {BUCKET_ORDER.map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  className={`btn ${filter === bucket ? "btn-primary" : ""}`}
                  onClick={() => setFilter(bucket)}
                >
                  {BUCKET_LABELS[bucket]} ({diff.counts[bucket]})
                </button>
              ))}
            </div>

            <label className="row" style={{ gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input
                type="checkbox"
                checked={hideUnchanged}
                onChange={(e) => setHideUnchanged(e.target.checked)}
                disabled={filter !== "all" && filter !== "unchanged"}
              />
              <span className="muted">Hide unchanged when showing all</span>
            </label>

            <DiffTable
              rows={filteredRows}
              hideUnchanged={hideUnchanged && filter === "all"}
            />
          </>
        )}
      </div>
    </section>
  );
}
