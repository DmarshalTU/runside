import { useEffect, useState, type FormEvent } from "react";
import {
  DEFAULT_SETTINGS,
  type GhRepoSummary,
  type GhStatus,
  type HubSettings,
} from "@testops-hub/shared";
import { api } from "../api";

function applySlug(
  prev: HubSettings,
  slug: string,
): HubSettings {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) return prev;
  return { ...prev, owner, repo };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<HubSettings>({ ...DEFAULT_SETTINGS });
  const [gh, setGh] = useState<GhStatus | null>(null);
  const [repos, setRepos] = useState<GhRepoSummary[]>([]);
  const [reposBusy, setReposBusy] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [s, status] = await Promise.all([api.getSettings(), api.ghStatus()]);
        const next = { ...DEFAULT_SETTINGS, ...s, recentRepos: s.recentRepos ?? [] };
        if (!next.owner && status.loggedInAs) {
          next.owner = status.loggedInAs;
        }
        setSettings(next);
        setGh(status);
        if (status.authenticated) {
          void loadRepos();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  function setField<K extends keyof HubSettings>(key: K, value: HubSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function loadRepos() {
    setReposBusy(true);
    setError(null);
    try {
      const { repos: list } = await api.listRepos(50);
      setRepos(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReposBusy(false);
    }
  }

  function selectRepo(slug: string) {
    setSettings((prev) => applySlug(prev, slug));
    setMessage(`Selected ${slug} (not saved yet).`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.saveSettings(settings);
      setSettings(saved);
      setMessage("Settings saved to ~/.runside/settings.json");
      const status = await api.ghStatus();
      setGh(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshGh() {
    setError(null);
    try {
      const status = await api.ghStatus();
      setGh(status);
      if (status.loggedInAs) {
        setSettings((prev) => (prev.owner ? prev : { ...prev, owner: status.loggedInAs! }));
      }
      if (status.authenticated) {
        void loadRepos();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function useLoggedInOwner() {
    if (!gh?.loggedInAs) return;
    setField("owner", gh.loggedInAs);
    setMessage(`Owner set to ${gh.loggedInAs} (not saved yet).`);
  }

  async function detectRepo() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const detected = await api.detectRepo();
      setSettings((prev) => ({ ...prev, owner: detected.owner, repo: detected.repo }));
      setMessage(`Detected ${detected.owner}/${detected.repo} from current folder (not saved yet).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function clearCache() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.clearCache();
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const filter = repoFilter.trim().toLowerCase();
  const filteredRepos = filter
    ? repos.filter(
        (r) =>
          r.nameWithOwner.toLowerCase().includes(filter) ||
          r.description.toLowerCase().includes(filter),
      )
    : repos;

  const currentSlug =
    settings.owner && settings.repo ? `${settings.owner}/${settings.repo}` : "";

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="lead">
        Runside talks to GitHub through your local <span className="mono">gh</span> login. One
        active repo at a time — switch anytime. Reports stay in{" "}
        <span className="mono">~/.runside/cache</span>.
      </p>

      <div className="panel" style={{ background: "var(--bg)", marginBottom: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="status-pill">
            <span className={`dot ${gh?.installed && gh.authenticated ? "on" : "off"}`} />
            {gh == null
              ? "Checking gh…"
              : !gh.installed
                ? "gh not installed"
                : !gh.authenticated
                  ? "gh not authenticated"
                  : `gh OK${gh.loggedInAs ? ` · ${gh.loggedInAs}` : ""}`}
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => void refreshGh()}>
            Recheck
          </button>
        </div>
        {gh && <p className="muted" style={{ marginBottom: 0 }}>{gh.message}</p>}
        {gh && !gh.authenticated && (
          <p className="muted">
            Install from <a href="https://cli.github.com/" target="_blank" rel="noreferrer">cli.github.com</a>
            , then run <span className="mono">gh auth login</span>.
          </p>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="ok-box">{message}</div>}

      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="repo-picker">Repository</label>
          <div className="row" style={{ marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <input
              id="repo-picker"
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              placeholder="Filter your repos…"
              disabled={!gh?.authenticated}
              style={{ flex: "1 1 12rem" }}
            />
            <button
              className="btn btn-ghost"
              type="button"
              disabled={!gh?.authenticated || reposBusy}
              onClick={() => void loadRepos()}
            >
              {reposBusy ? "Loading…" : "Refresh list"}
            </button>
          </div>
          {gh?.authenticated && (
            <select
              size={Math.min(8, Math.max(4, filteredRepos.length || 4))}
              value={currentSlug}
              onChange={(e) => {
                if (e.target.value) selectRepo(e.target.value);
              }}
              disabled={reposBusy || filteredRepos.length === 0}
              aria-label="Select repository"
            >
              {filteredRepos.length === 0 ? (
                <option value="">
                  {reposBusy ? "Loading…" : "No matching repos — type owner/repo below"}
                </option>
              ) : (
                filteredRepos.map((r) => (
                  <option key={r.nameWithOwner} value={r.nameWithOwner}>
                    {r.nameWithOwner}
                    {r.isPrivate ? " (private)" : ""}
                    {r.description ? ` — ${r.description.slice(0, 60)}` : ""}
                  </option>
                ))
              )}
            </select>
          )}
          {!gh?.authenticated && (
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Authenticate with <span className="mono">gh</span> to pick from your repos.
            </p>
          )}
        </div>

        {(settings.recentRepos?.length ?? 0) > 0 && (
          <div className="field">
            <label>Recent</label>
            <div className="row recent-repos" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
              {settings.recentRepos.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  className={`btn btn-ghost recent-chip${slug === currentSlug ? " recent-chip-active" : ""}`}
                  onClick={() => selectRepo(slug)}
                >
                  {slug}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <div className="row" style={{ gap: "0.4rem" }}>
              <input
                id="owner"
                value={settings.owner}
                onChange={(e) => setField("owner", e.target.value)}
                placeholder={gh?.loggedInAs ?? "org-or-user"}
                required
                style={{ flex: 1 }}
              />
              {gh?.loggedInAs && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void useLoggedInOwner()}
                  title={`Use ${gh.loggedInAs}`}
                >
                  Me
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <label htmlFor="repo">Repo</label>
            <input
              id="repo"
              value={settings.repo}
              onChange={(e) => setField("repo", e.target.value)}
              placeholder="playwright_allure"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="githubHost">GitHub host</label>
            <input
              id="githubHost"
              value={settings.githubHost}
              onChange={(e) => setField("githubHost", e.target.value)}
              placeholder="github.com"
            />
          </div>
          <div className="field">
            <label htmlFor="workflowFile">Active workflow file</label>
            <input
              id="workflowFile"
              value={settings.workflowFile}
              onChange={(e) => {
                const v = e.target.value;
                setSettings((prev) => ({
                  ...prev,
                  workflowFile: v,
                  workflowFiles: [
                    v,
                    ...(prev.workflowFiles ?? []).filter((f) => f && f !== v),
                  ].filter(Boolean),
                }));
              }}
              placeholder="playwright.yml"
            />
          </div>
          <div className="field">
            <label htmlFor="workflowFiles">Workflow files (comma-separated)</label>
            <input
              id="workflowFiles"
              value={(settings.workflowFiles ?? []).join(", ")}
              onChange={(e) =>
                setField(
                  "workflowFiles",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="playwright.yml, nightly.yml"
            />
          </div>
          <div className="field">
            <label htmlFor="workflowName">Workflow name filter (runs list)</label>
            <input
              id="workflowName"
              value={settings.workflowName}
              onChange={(e) => setField("workflowName", e.target.value)}
              placeholder="Leave empty for all workflows"
            />
          </div>
          <div className="field">
            <label htmlFor="artifactPrefixes">Artifact prefixes (comma-separated)</label>
            <input
              id="artifactPrefixes"
              value={(settings.artifactPrefixes ?? []).join(", ")}
              onChange={(e) => {
                const list = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                setSettings((prev) => ({
                  ...prev,
                  artifactPrefixes: list,
                  artifactPrefix: list[0] ?? prev.artifactPrefix,
                }));
              }}
              placeholder="allure-report-, playwright-report, trace"
            />
          </div>
          <div className="field">
            <label htmlFor="cacheMaxReports">Cache max reports (0 = unlimited)</label>
            <input
              id="cacheMaxReports"
              type="number"
              min={0}
              value={settings.cacheMaxReports}
              onChange={(e) => setField("cacheMaxReports", Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label htmlFor="cacheMaxMb">Cache max MiB (0 = unlimited)</label>
            <input
              id="cacheMaxMb"
              type="number"
              min={0}
              value={settings.cacheMaxMb}
              onChange={(e) => setField("cacheMaxMb", Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <p className="muted" style={{ margin: 0 }}>
          Empty workflow name lists all runs for the repo. Active workflow file is used by Trigger.
          Owner autofills from <span className="mono">gh</span>. Deep links:{" "}
          <span className="mono">runside://runs/123</span>.
        </p>

        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void detectRepo()}
            title="Uses the git repo of the folder where the Runside server process was started"
          >
            Detect from server folder
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => void clearCache()}
          >
            Clear report cache
          </button>
        </div>
      </form>
    </section>
  );
}
