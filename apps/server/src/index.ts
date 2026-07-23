import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import open from "open";
import {
  type HubSettings,
  type TriggerInputValues,
} from "@testops-hub/shared";
import { GhError } from "./gh.js";
import {
  detectRepoFromGh,
  dispatchWorkflow,
  downloadArtifact,
  getGhStatus,
  getRun,
  getRunLogs,
  getWorkflowDispatchSchema,
  listAccessibleRepos,
  listArtifacts,
  listJobs,
  listRuns,
} from "./github.js";
import {
  cacheDir,
  clearReportCache,
  ensureHubDirs,
  isArtifactCached,
  loadSettings,
  reportUrlPath,
  saveSettings,
  assertSafeRunId,
  assertSafeArtifactName,
} from "./paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOST = "127.0.0.1";
/** Prefer RUNSIDE_PORT (desktop), then PORT, default 8787. Use 0 for an ephemeral port. */
const PORT = Number(process.env.RUNSIDE_PORT ?? process.env.PORT ?? 8787);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (
        origin === "http://127.0.0.1:5173" ||
        origin === "http://localhost:5173" ||
        origin === "tauri://localhost" ||
        origin === "http://tauri.localhost" ||
        /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
      ) {
        return origin;
      }
      return null;
    },
  }),
);

function errorMessage(err: unknown): {
  status: ContentfulStatusCode;
  body: { error: string; detail?: string };
} {
  if (err instanceof GhError) {
    return {
      status: 502,
      body: {
        error: err.message,
        detail: err.result.stderr || err.result.stdout || undefined,
      },
    };
  }
  if (err instanceof Error) {
    const status: ContentfulStatusCode = /configure owner/i.test(err.message)
      ? 400
      : 500;
    return { status, body: { error: err.message } };
  }
  return { status: 500, body: { error: String(err) } };
}

app.get("/api/health", (c) => c.json({ ok: true, name: "runside" }));

app.get("/api/gh/status", async (c) => {
  const status = await getGhStatus();
  return c.json(status);
});

app.get("/api/gh/repos", async (c) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const repos = await listAccessibleRepos(limit);
    return c.json({ repos });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.get("/api/settings", async (c) => {
  const settings = await loadSettings();
  return c.json(settings);
});

app.put("/api/settings", async (c) => {
  try {
    const body = (await c.req.json()) as Partial<HubSettings>;
    const current = await loadSettings();
    const next = await saveSettings({ ...current, ...body });
    return c.json(next);
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.get("/api/runs", async (c) => {
  try {
    const settings = await loadSettings();
    const raw = Number(c.req.query("limit") ?? 20);
    const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? raw : 20));
    const runs = await listRuns(settings, limit);
    return c.json({ runs });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.get("/api/runs/:id", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("id"));
    const run = await getRun(settings, id);
    const artifacts = await listArtifacts(settings, id);
    return c.json({
      ...run,
      artifacts,
    });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.get("/api/runs/:id/jobs", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("id"));
    const jobs = await listJobs(settings, id);
    return c.json({ jobs });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.get("/api/runs/:id/logs", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("id"));
    const jobParam = c.req.query("job");
    const jobId = jobParam ? Number(jobParam) : undefined;
    const logs = await getRunLogs(
      settings,
      id,
      jobId != null && !Number.isNaN(jobId) ? jobId : undefined,
    );
    return c.json(logs);
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.post("/api/settings/detect-repo", async (c) => {
  try {
    const detected = await detectRepoFromGh();
    if (!detected) {
      return c.json(
        {
          error:
            "Could not detect a GitHub repo from the folder where the Runside server was started. Set owner/repo manually, or start Runside from inside your test repo clone.",
        },
        404,
      );
    }
    return c.json(detected);
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.delete("/api/cache", async (c) => {
  try {
    await clearReportCache();
    return c.json({ ok: true, message: "Report cache cleared." });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.post("/api/runs/:id/artifacts/:name/download", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("id"));
    const name = assertSafeArtifactName(c.req.param("name"));
    const result = await downloadArtifact(settings, id, name);
    return c.json({
      name,
      reportUrl: result.reportUrl,
      cached: true,
    });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.post("/api/runs/:id/artifacts/:name/open", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("id"));
    const name = assertSafeArtifactName(c.req.param("name"));

    let urlPath = reportUrlPath(id, name);
    if (!isArtifactCached(id, name)) {
      const result = await downloadArtifact(settings, id, name);
      urlPath = result.reportUrl;
    }

    const listenPort = Number(process.env.RUNSIDE_LISTEN_PORT ?? PORT);
    const absolute = `http://${HOST}:${listenPort}${urlPath}`;
    // Always open in the OS browser — Tauri WebView has no real "new tab".
    await open(absolute);
    return c.json({ reportUrl: urlPath, opened: absolute });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.get("/api/workflows/inputs", async (c) => {
  try {
    const settings = await loadSettings();
    const schema = await getWorkflowDispatchSchema(settings);
    return c.json(schema);
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.post("/api/workflows/dispatch", async (c) => {
  try {
    const settings = await loadSettings();
    const body = (await c.req.json()) as TriggerInputValues;
    await dispatchWorkflow(settings, body ?? {});
    return c.json({
      ok: true as const,
      message: "Workflow dispatched. Refresh runs in a few seconds.",
    });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

// Serve cached Allure reports — CSP limits exfiltration; path stays under cache/
app.use("/reports/*", async (c, next) => {
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
    ].join("; "),
  );
  c.header("X-Content-Type-Options", "nosniff");
  const cache = cacheDir();
  const rewrite = serveStatic({
    root: cache,
    rewriteRequestPath: (path) => path.replace(/^\/reports/, ""),
  });
  return rewrite(c, next);
});

function resolveWebDist(): string | null {
  const fromEnv = process.env.RUNSIDE_WEB_DIST?.trim();
  const candidates = [
    fromEnv,
    // Sidecar layout: web/ next to the executable / cwd
    join(process.cwd(), "web"),
    join(dirname(process.execPath), "web"),
    join(__dirname, "web"),
    join(__dirname, "../../web/dist"),
    join(process.cwd(), "../web/dist"),
    join(process.cwd(), "apps/web/dist"),
  ].filter((p): p is string => Boolean(p));

  for (const p of candidates) {
    if (existsSync(join(p, "index.html"))) return p;
  }
  return null;
}

const staticRoot = resolveWebDist();

if (staticRoot) {
  app.use("/*", serveStatic({ root: staticRoot }));
  app.get("*", async (c) => {
    const index = join(staticRoot, "index.html");
    if (existsSync(index)) {
      const { readFile } = await import("node:fs/promises");
      const html = await readFile(index, "utf8");
      return c.html(html);
    }
    return c.text("UI not built. Run npm run build or npm run dev.", 404);
  });
}

void (async () => {
  await ensureHubDirs();
  serve(
    {
      fetch: app.fetch,
      hostname: HOST,
      port: PORT,
    },
    (info) => {
      process.env.RUNSIDE_LISTEN_PORT = String(info.port);
      const url = `http://${HOST}:${info.port}`;
      console.log(`Runside API listening on ${url}`);
      console.log(`Cache: ${cacheDir()}`);
      if (staticRoot) console.log(`UI: ${staticRoot}`);
      // Machine-readable ready line for the Tauri shell
      console.log(`RUNSIDE_READY ${url}`);
    },
  );
})();

