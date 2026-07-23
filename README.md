# Runside

Local-first desktop web app that drives GitHub Actions via the **`gh` CLI**, downloads Allure report artifacts, and opens them in your browser — private by default, no GitHub Pages or SaaS required.

GitHub Actions remains the runner. Runside is the remote control + report browser.

## Requirements

- **Node.js 20+**
- **[GitHub CLI](https://cli.github.com/)** (`gh`) on your `PATH` (Windows: often `C:\Program Files\GitHub CLI\gh.exe`; or set `GH_PATH`)
- A repo that uploads finished Allure **HTML** artifacts (e.g. `allure-report-main`)

### Install `gh` (quick)

| OS | Hint |
| --- | --- |
| Windows | `winget install --id GitHub.cli` |
| macOS | `brew install gh` |
| Linux | See [cli.github.com](https://cli.github.com/) |

Then authenticate:

```bash
gh auth login
```

If Settings still says `gh` is missing after install, **restart** `npm run dev` so it picks up PATH. You can also set `GH_PATH` to the full path of `gh.exe`.

## Quick start

```bash
npm install
npm run build -w @testops-hub/shared
npm run dev
```

- UI: http://127.0.0.1:5173  
- API: http://127.0.0.1:8787 (bound to localhost only)

Or build and run the API with the built UI:

```bash
npm install
npm run build
npm start
```

Then open http://127.0.0.1:8787

## First-time setup

1. Open **Settings**
2. Confirm `gh` shows authenticated
3. Set **Owner** / **Repo** / **Workflow file** (and optional workflow name + artifact prefix)
4. Save — settings live in `~/.runside/settings.json` (legacy `~/.testops-hub/settings.json` is migrated once)

## What you can do

- **Runs** — list workflow runs; auto-refreshes while jobs are in progress; clear Queued / Running / Success badges
- **Run detail** — job list + **CI logs** (per completed job; step progress while running); Allure artifacts with **Open report** / **New tab**
- **Trigger** — form built dynamically from `workflow_dispatch` inputs in the workflow YAML
- **Settings** — `gh` status, owner/repo, detect from server folder, clear local report cache

Downloaded reports are cached under `~/.runside/cache/<runId>/<artifactName>/` and served at `/reports/...` on localhost (Vite proxies this in `npm run dev`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API (`tsx watch`) + Vite UI together |
| `npm run build` | Build shared, server, and web |
| `npm start` | Run compiled server (serves UI if `apps/web/dist` exists) |
| `npm run typecheck` | Typecheck all packages |

## Security

See [SECURITY.md](./SECURITY.md). Short version: localhost-only, trusts your `gh` login, treats Allure HTML as untrusted.

## License

[MIT](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Product notes

See [TESTOPS_HUB.md](./TESTOPS_HUB.md) for the original design draft (MVP scope, non-goals, later phases). The working product name is **Runside**.
