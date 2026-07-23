# Runside

Local-first desktop app that drives GitHub Actions via the **`gh` CLI**, downloads Allure (and other) report artifacts, and opens them locally — private by default, no GitHub Pages or SaaS required.

GitHub Actions remains the runner. Runside is the remote control + report browser.

## Install (desktop)

Download a build for your OS from [GitHub Releases](https://github.com/DmarshalTU/runside/releases) (or Actions artifacts from **Release desktop**):

| OS | Installer |
| --- | --- |
| Windows | `Runside_*_x64-setup.exe` (NSIS) or `.msi` |
| macOS | `.dmg` |
| Linux | `.AppImage` or `.deb` |

You still need **[GitHub CLI](https://cli.github.com/)** installed and authenticated (`gh auth login`). Runside does not bundle `gh`.

Early builds are **unsigned**. Expect SmartScreen (Windows) / Gatekeeper (macOS) warnings until code signing is added.

### Deep links (desktop)

After installing, links like these open Runside:

- `runside://runs/123`
- `runside://runs/123/report/allure-report-main`

Example Job Summary markdown: `[Open in Runside](runside://runs/${{ github.run_id }})`

## Requirements

### End users (desktop installer)

- `gh` on your `PATH` (Windows: often `C:\Program Files\GitHub CLI\gh.exe`; or set `GH_PATH`)
- A repo that uploads finished HTML artifacts (e.g. `allure-report-main`)

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

## Quick start (from source)

```bash
npm install
npm run build -w @testops-hub/shared
npm run dev
```

- UI: http://127.0.0.1:5173  
- API: http://127.0.0.1:8787 (bound to localhost only)

```bash
npm run build && npm start
```

### Desktop shell (Tauri)

```bash
npm install
npm run desktop:dev
npm run desktop:build
```

## First-time setup

1. Open **Settings**
2. Confirm `gh` authenticated
3. Pick repo, set active **workflow file** (and optional name filter / extra workflow files)
4. Configure **artifact prefixes** (default includes Allure, Playwright HTML, traces)
5. Optional: GitHub host (GHES), cache limits
6. Save — `~/.runside/settings.json`

## What you can do

- **Runs** — list/filter runs; Re-run / Cancel; select two runs → **Compare**
- **Run detail** — jobs, CI logs, artifacts by kind; Pin cache; open in app or browser
- **Library** — offline cached reports
- **Trigger** — dynamic `workflow_dispatch` form
- **Settings** — repo picker, multi-workflow, prefixes, cache, GH host
- **Desktop** — system tray (Show / Quit); `runside://` deep links

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API + Vite UI |
| `npm run build` | Build shared, server, web |
| `npm start` | Compiled server (+ UI if built) |
| `npm run typecheck` | Typecheck packages |
| `npm run desktop:sidecar` | Bundle API + portable Node for Tauri |
| `npm run desktop:dev` | Tauri dev |
| `npm run desktop:build` | OS installers |

## Security

See [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Product notes

See [TESTOPS_HUB.md](./TESTOPS_HUB.md). Product name: **Runside**.
