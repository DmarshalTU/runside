import { useEffect, useState, type FormEvent } from "react";
import {
  DEFAULT_SETTINGS,
  type GhStatus,
  type HubSettings,
} from "@testops-hub/shared";
import { api } from "../api";

export function SettingsPage() {
  const [settings, setSettings] = useState<HubSettings>({ ...DEFAULT_SETTINGS });
  const [gh, setGh] = useState<GhStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [s, status] = await Promise.all([api.getSettings(), api.ghStatus()]);
        setSettings(s);
        setGh(status);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  function setField<K extends keyof HubSettings>(key: K, value: HubSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
      setGh(await api.ghStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="lead">
        Runside talks to GitHub through your local <span className="mono">gh</span> login. Reports
        stay in <span className="mono">~/.runside/cache</span>.
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
        <div className="grid-2">
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input
              id="owner"
              value={settings.owner}
              onChange={(e) => setField("owner", e.target.value)}
              placeholder="DmarshalTU"
              required
            />
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
            <label htmlFor="workflowFile">Workflow file</label>
            <input
              id="workflowFile"
              value={settings.workflowFile}
              onChange={(e) => setField("workflowFile", e.target.value)}
              placeholder="playwright.yml"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="workflowName">Workflow name (for run list)</label>
            <input
              id="workflowName"
              value={settings.workflowName}
              onChange={(e) => setField("workflowName", e.target.value)}
              placeholder="Playwright + Allure"
            />
          </div>
          <div className="field">
            <label htmlFor="artifactPrefix">Artifact name prefix</label>
            <input
              id="artifactPrefix"
              value={settings.artifactPrefix}
              onChange={(e) => setField("artifactPrefix", e.target.value)}
              placeholder="allure-report-"
            />
          </div>
        </div>

        <p className="muted" style={{ margin: 0 }}>
          Workflow file is required to trigger. Workflow name filters the Runs list (defaults to the
          file name if left empty). Detect uses the server process working directory, not your
          browser.
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
