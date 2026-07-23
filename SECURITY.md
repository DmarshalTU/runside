# Security

Runside is a **local-first** tool. It is designed to run on a developer machine and talk to GitHub through the user’s existing `gh` CLI login.

## Trust model

- The API binds to **`127.0.0.1` only** (not LAN/public interfaces).
- There is **no auth on `/api`**. Any process on the same machine can call it and act as your `gh` user (list runs, dispatch workflows, download artifacts, clear cache).
- Treat the laptop user as trusted. Do not expose the port via reverse proxy, SSH tunnel to untrusted clients, or `0.0.0.0` without adding authentication.

## Untrusted CI artifacts

Allure HTML/JS from GitHub Actions is **untrusted content**.

- Reports are shown in a **sandboxed iframe** (no `allow-same-origin`) so report scripts cannot call parent page APIs as a first-party app.
- `/reports` responses send a restrictive **Content-Security-Policy**.
- Prefer **Open report** in Hub or **New tab**; do not paste report HTML into privileged contexts.

## Cache paths

Artifact download paths are validated (numeric run id, safe artifact name, must stay under `~/.runside/cache`).

## `gh` process spawn

Runside resolves `gh.exe` / `gh` and spawns with **`shell: false`** and an argv array. On Windows, set `GH_PATH` if the CLI is not found automatically.

## Reporting issues

If you find a vulnerability in Runside, open a private security advisory on the GitHub repository (or email the maintainer listed in the repo). Please avoid filing public issues that include exploit details until a fix is available.
