# TestOps Hub — Application Description

> Working name: **TestOps Hub**  
> Status: design draft (not implemented)  
> Related repo today: [DmarshalTU/playwright_allure](https://github.com/DmarshalTU/playwright_allure)  
> Document version: **0.2**

## 1. Problem

GitHub Actions is excellent at **running** tests, but weak at **browsing** results:

- There is no Azure DevOps–style Allure panel inside a workflow run.
- Artifacts require download + unzip + local open — poor daily UX.
- GitHub Pages can host reports with one click, but for **private repos** the site is usually **public** (private Pages needs GitHub Enterprise Cloud).
- Multi-branch / daily / manual runs produce many artifacts that are hard to navigate in the Actions UI.

Developers need a **private, one-click Allure experience** without leaking reports or standing up a large platform on day one.

## 2. Market reality (decision context)

GitHub itself will not solve this. Ready options fall into two buckets:

| Path | Examples | Trade-off |
| --- | --- | --- |
| **Paid SaaS** | Currents, Allure TestOps Cloud | Best UX, ongoing cost, data leaves your laptop/org |
| **Full self-hosted platforms** | ReportPortal (free OSS), Allure TestOps on-prem | Private + powerful, but a **real deployment** (many services) |

**ReportPortal** is a strong free self-hosted choice if the team accepts ops (Docker Compose / k8s).

**This document’s primary product bet** is a third path that is easier to open-source and run:

> A **local-first desktop/dev-PC app** that drives GitHub Actions via **`gh` CLI / API**, downloads Allure artifacts, and opens them in the browser — private by default, cross-platform, no cloud required.

A heavier hosted Rust/ReportPortal-style backend remains an optional later phase, not the MVP.

## 3. Product goal (MVP)

Build an **open-source, local web app** that runs on a developer PC and:

1. Lists GitHub Actions workflow runs for the test repo (status, branch, suite, time).
2. Triggers manual workflows with the same inputs as today (`branches`, `suite`, `grep`, `project`, `shards`, …).
3. Downloads Allure report artifacts for a finished run (`gh run download`).
4. Serves / opens the **full interactive Allure report** locally in one click.
5. Works the same on **Windows, macOS, and Linux** (one codebase).

**Non-goals (MVP):**

- Rebuild Allure
- Replace GitHub Actions as the runner
- Multi-tenant cloud SaaS
- Full ReportPortal-class analytics

## 4. Target users

| Persona | Needs |
| --- | --- |
| QA / SDET | Trigger runs, open Allure fast, triage failures |
| Feature developer | “Did CI fail?” → open report without hunting artifacts |
| Team adopting OSS | Clone, install `gh`, run locally — no company platform ticket |

## 5. Success criteria (MVP)

- From the local UI, open Allure for a finished run in **≤ 2 clicks** after the report is downloaded.
- No public Pages required; reports stay on the developer machine (or optional shared cache folder).
- Can **list**, **watch**, and **trigger** the Playwright + Allure workflow via `gh`.
- Supports multi-branch artifact names (`allure-report-<branch>`).
- One install path documented for Windows, macOS, Linux.
- Secrets never displayed (Hub only deals with reports/metadata GitHub already produced).

## 6. Chosen architecture (local-first)

```text
┌─────────────────────────────────────────────────────────────┐
│  Developer PC                                               │
│                                                             │
│   Vite UI  ←→  Local API (Hono/Fastify)                     │
│                      │                                      │
│                      ├─ spawn `gh` (auth already on machine)│
│                      │    · run list / view / watch         │
│                      │    · workflow run (manual dispatch)  │
│                      │    · run download (allure-report-*)  │
│                      │                                      │
│                      └─ cache dir ~/.testops-hub/ (or ./)   │
│                           └─ serve Allure HTML locally      │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
        GitHub Actions (remote executor)
        Playwright + Allure workflow
```

GitHub remains the **runner**. TestOps Hub is the **remote control + report browser**.

## 7. Easiest tech stack (recommended)

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | **Node.js / TypeScript** (or Bun) | Fastest OSS iteration; huge contributor pool |
| Local API | **Hono** or **Fastify** | Tiny server on `localhost` |
| UI | **Vite + React** (or Svelte) | Runs list, trigger form, open report |
| GitHub access | **`gh` CLI** first; Octokit later if needed | Auth via `gh auth login`; no OAuth app for MVP |
| Reports | Download artifact → static serve / `allure open` | Reuse Allure 3 npm CLI |
| Packaging | `npm start` / optional later **Tauri** wrapper | Browser-on-localhost first |

### Cross-platform notes

| Concern | Approach |
| --- | --- |
| Windows / macOS / Linux | Same TS codebase |
| `gh` binary | Detect on PATH; show install + `gh auth login` help per OS |
| Process spawn | `spawn('gh', args)` — never bash-only `exec` strings |
| Paths | `path.join` / `pathe`; OS-specific cache under home dir |
| Open browser | Cross-platform `open` helper |
| Allure | Prefer **npm `allure` (v3)** over Java Allure 2 |

**Optional later:** wrap the same UI in **Tauri 2** for a native window. Do not start with Electron.

**Rust:** reserved for a future native/Tauri shell or a separate hosted ingest service — **not** required for MVP.

## 8. Core UX

### 8.1 Home / Runs

Actions-like table:

- Status, workflow, trigger (schedule / manual), when, duration, actor  
- Filters: status, branch, suite (from run name / inputs if available)  
- Actions: **Open report**, **Download**, **View on GitHub**, **Re-run** (optional)

### 8.2 Trigger run

Form mirroring workflow_dispatch inputs:

- `branches` (comma-separated)
- `suite`, `grep`, `project`, `shards`, `include_demo_fail`

Calls: `gh workflow run playwright.yml -f ...`

### 8.3 Open Allure

1. `gh run download <id> -n allure-report-<branch>` (or list artifacts and pick)
2. Cache under local data dir
3. Open `http://localhost:<port>/reports/<run>/<branch>/` (auth = local machine)

### 8.4 Multi-branch

Parent run shows one card per branch artifact (`allure-report-main`, `allure-report-develop`, …).

## 9. Local CLI operations to wrap

```bash
gh auth status
gh run list --workflow "Playwright + Allure" --repo OWNER/REPO
gh run view <id> --repo OWNER/REPO
gh run watch <id> --repo OWNER/REPO
gh workflow run playwright.yml --repo OWNER/REPO \
  -f branches=main,develop \
  -f suite=smoke \
  -f project=chromium \
  -f shards=2
gh run download <id> -n allure-report-main --dir ./.testops-cache/<id>/main
```

Repo can be inferred from `git remote` in the current project or set in Hub settings.

## 10. Project layout (suggested OSS repo)

```text
testops-hub/
  apps/web/           # Vite UI
  apps/server/        # Local API + gh adapter + static report server
  packages/shared/    # Types (Run, Artifact, TriggerInputs)
  docs/
  README.md
```

Or a simpler single-package monorepo for the first release.

## 11. Security & privacy (local-first)

| Topic | Approach |
| --- | --- |
| Report visibility | Files stay on the developer PC by default |
| GitHub auth | User’s existing `gh` login / token — Hub does not store org-wide secrets |
| CI secrets | Unchanged (GitHub Actions secrets); Hub never needs `TEST_PASSWORD` |
| Binding | Listen on `127.0.0.1` only for MVP |
| Sharing | Optional later: export zip / upload to team store — not MVP |

**Explicit decision:** do not rely on public GitHub Pages for private report viewing.

## 12. Phased delivery

### Phase 1 — Local MVP (this product)

- Detect `gh`, select repo
- List + view runs
- Trigger workflow_dispatch with inputs
- Download + open Allure per branch artifact
- Windows / macOS / Linux docs

### Phase 2 — Comfort

- Auto-watch running jobs; notify when finished
- Parse Job Summary / artifact list smarter
- Keep last N reports in cache; one-click reopen without re-download
- Optional Playwright HTML report alongside Allure

### Phase 3 — Team options (choose one)

- **A.** Point teams at **ReportPortal** (self-hosted) for shared history  
- **B.** Thin shared cache (S3/R2 + auth) fed by Actions upload  
- **C.** Hosted ingest service (Rust/Node) if product expands beyond local-only  

### Phase 4 — Native shell (optional)

- Tauri wrapper around the same local server/UI

## 13. Alternatives (when not to build)

| Option | Use when |
| --- | --- |
| **ReportPortal** (free self-host) | Team wants shared dashboards/history and accepts full stack ops |
| **Allure TestOps** | Want official Allure TMS + cloud/on-prem budget |
| **Currents** | Playwright-first hosted CI debugging; OK with SaaS |
| **Private GitHub Pages** | Enterprise Cloud available and Pages ACL is enough |
| **Artifacts only** | Rare runs; download friction acceptable |

TestOps Hub (local) is best when: **open source**, **dev-PC**, **private**, **low ops**, **GitHub Actions + Allure already in place**.

## 14. Relationship to `playwright_allure`

| Playwright starter | TestOps Hub (local) |
| --- | --- |
| Owns tests, tags, secrets helpers | Does not own test code |
| Owns Actions workflow (daily/manual/multi-branch) | Triggers & browses those runs |
| Produces `allure-report-*` artifacts | Downloads & serves them |
| Optional Pages job | Not required for Hub UX |

Hub Job Summary enhancement (optional later): print `testops://` or `http://localhost:...` deep links only help if Hub is running; prefer Hub pulling from GitHub rather than CI calling localhost.

## 15. Open questions

1. Single-repo tool vs installable global CLI (`testops`)?  
2. Default cache location and retention?  
3. Must support GitHub Enterprise Server URLs?  
4. Bundle Allure generate on incomplete artifacts, or require CI to upload finished HTML only?  
5. After MVP, prefer ReportPortal for shared history or stay local-only longer?

## 16. One-sentence pitch

**TestOps Hub is an open-source, cross-platform local app that uses the GitHub CLI to drive Actions and open Allure reports in one click — the private viewing layer GitHub doesn’t ship, without paying for SaaS or deploying ReportPortal on day one.**

---

### Appendix A — Earlier hosted design (deferred)

A previous draft proposed a Rust API + PostgreSQL + object storage + GitHub OAuth cloud/self-host viewer. That remains a valid **Phase 3C** if the product outgrows local-only use. It is **not** the MVP stack.

### Appendix B — ReportPortal note

ReportPortal remains the leading **free self-hosted** “full system” if the team wants shared, always-on dashboards. Integrate later via Playwright agent (`@reportportal/agent-js-playwright`) **in parallel** with Allure artifacts if desired — Hub and ReportPortal are not mutually exclusive.
