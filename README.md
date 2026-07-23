# Runside

Local-first desktop app that drives GitHub Actions via the **`gh` CLI**, downloads Allure report artifacts, and opens them locally — private by default, no GitHub Pages or SaaS required.

GitHub Actions remains the runner. Runside is the remote control + report browser.

## Install (desktop)

Download a build for your OS from [GitHub Releases](https://github.com/DmarshalTU/runside/releases) (or Actions artifacts from **Release desktop**):

| OS | Installer |
| --- | --- |
| Windows | `Runside_*_x64-setup.exe` (NSIS) or `.msi` |
| macOS | `.dmg` |
| Linux | `.AppImage` or `.deb` |

You still need **[GitHub CLI](https://cli.github.com/)** installed and authenticated (`gh auth login`). Runside does not bundle `gh`.

Early builds are **unsigned**. Expect SmartScreen (Windows) / Gatekeeper (macOS) warnings until code signing is added — use “More info → Run anyway” / right-click Open as appropriate.

## Requirements

### End users (desktop installer)

- `gh` on your `PATH` (Windows: often `C:\Program Files\GitHub CLI\gh.exe`; or set `GH_PATH`)
- A repo that uploads finished Allure **HTML** artifacts (e.g. `allure-report-main`)

### Contributors (from source)

- **Node.js 20+**
- `gh` as above
- For desktop builds: **Rust** (stable), plus platform WebView deps (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

### Install `gh` (quick)

| OS | Hint |
| --- | --- |
| Windows | `winget install --id GitHub.cli` |
| macOS | `brew install gh` |
| Linux | See [cli.github.com](https://cli.github.com/) |

```bash
gh auth login
```

If Settings still says `gh` is missing after install, **restart** the app / `npm run dev` so it picks up PATH. You can also set `GH_PATH` to the full path of `gh.exe`.

## Quick start (from source)

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

### Desktop shell (Tauri)

```bash
npm install
# optional: prepare Node sidecar + UI resources early
npm run desktop:sidecar
npm run desktop:dev    # tauri dev (starts local API on :8787)
npm run desktop:build  # produces OS installers under src-tauri/target/release/bundle/
```

`desktop:build` bundles a portable Node binary as a sidecar, the Hono API, and the web UI. Installers for other OSes are produced by CI (`.github/workflows/release-desktop.yml`) — a Windows machine only builds Windows packages locally.

## First-time setup

1. Open **Settings**
2. Confirm `gh` shows authenticated (username comes from your login)
3. Pick a repo from the list (or type owner/repo), set **Workflow file**, Save
4. Settings live in `~/.runside/settings.json` (legacy `~/.testops-hub/settings.json` is migrated once)

You can switch repos anytime; recent picks are remembered. Runs / Trigger always use the **active** repo only.

## What you can do

- **Runs** — list workflow runs; auto-refreshes while jobs are in progress; clear Queued / Running / Success badges
- **Run detail** — job list + **CI logs** (per completed job; step progress while running); Allure artifacts with **Open report** / **New tab**
- **Trigger** — form built dynamically from `workflow_dispatch` inputs in the workflow YAML
- **Settings** — `gh` status, repo picker + recent, detect from server folder, clear local report cache

Downloaded reports are cached under `~/.runside/cache/<runId>/<artifactName>/` and served at `/reports/...` on localhost (Vite proxies this in `npm run dev`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API (`tsx watch`) + Vite UI together |
| `npm run build` | Build shared, server, and web |
| `npm start` | Run compiled server (serves UI if `apps/web/dist` exists) |
| `npm run typecheck` | Typecheck shared / server / web |
| `npm run desktop:sidecar` | Bundle API + portable Node into Tauri resources |
| `npm run desktop:dev` | Tauri desktop app (dev) |
| `npm run desktop:build` | Tauri installers for the current OS |

## Security

See [SECURITY.md](./SECURITY.md). Short version: localhost-only, trusts your `gh` login, treats Allure HTML as untrusted.

## License

[MIT](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Product notes

See [TESTOPS_HUB.md](./TESTOPS_HUB.md) for the original design draft (MVP scope, non-goals, later phases). The working product name is **Runside**.
