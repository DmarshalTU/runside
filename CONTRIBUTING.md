# Contributing to Runside

Thanks for helping improve Runside — a local-first GitHub Actions + Allure viewer.

## Development

```bash
npm install
npm run dev
```

- UI: http://127.0.0.1:5173  
- API: http://127.0.0.1:8787  

Requires [GitHub CLI](https://cli.github.com/) (`gh auth login`). On Windows you may need `GH_PATH` pointing at `gh.exe`.

```bash
npm run typecheck
npm run build
```

## Project layout

| Path | Role |
| --- | --- |
| `apps/server` | Hono API, `gh` adapter, report cache |
| `apps/web` | Vite + React UI |
| `packages/shared` | Shared TypeScript types |

## Guidelines

- Keep the MVP local-first: no cloud multi-tenant backend in core.
- Prefer spawning `gh` with argv arrays and `shell: false`.
- Treat Allure HTML as untrusted (sandboxed iframe / CSP).
- Do not commit secrets, `.env`, or `~/.runside` cache contents.

## Pull requests

1. Fork and branch from `main`
2. Keep PRs focused (one concern when possible)
3. Include a short summary and how you tested (e.g. against a Playwright + Allure workflow)
4. Do **not** add `Co-authored-by` trailers to commits

## Security

See [SECURITY.md](./SECURITY.md). Please report vulnerabilities privately when possible.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
