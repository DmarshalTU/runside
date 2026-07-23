import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { dirname, join } from "node:path";
import { existsSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import open from "open";
import {
  type HubSettings,
  type TriggerInputValues,
} from "@testops-hub/shared";
import { GhError } from "./gh.js";
import { compareAllureReports, resolveReportRoot } from "./allureCompare.js";
import {
  cancelWorkflow,
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
  rerunWorkflow,
} from "./github.js";
import {
  cacheDir,
  clearReportCache,
  ensureHubDirs,
  isArtifactCached,
  listCachedReports,
  loadSettings,
  reportUrlPath,
  saveSettings,
  setPinned,
  assertSafeRunId,
  assertSafeArtifactName,
  artifactKind,
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
        origin === "https://tauri.localhost" ||
        /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin) ||
        /^https:\/\/([a-z0-9-]+\.)*localhost$/i.test(origin)
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
  const settings = await loadSettings();
  const status = await getGhStatus(settings);
  return c.json(status);
});

app.get("/api/gh/repos", async (c) => {
  try {
    const settings = await loadSettings();
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const repos = await listAccessibleRepos(settings, limit);
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

app.post("/api/runs/:id/rerun", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("id"));
    await rerunWorkflow(settings, id);
    return c.json({ ok: true as const, message: `Re-run requested for #${id}.` });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.post("/api/runs/:id/cancel", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("id"));
    await cancelWorkflow(settings, id);
    return c.json({ ok: true as const, message: `Cancel requested for #${id}.` });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.get("/api/cache/reports", async (c) => {
  try {
    const settings = await loadSettings();
    const reports = await listCachedReports(settings);
    return c.json({ reports });
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.post("/api/cache/:runId/:name/pin", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("runId"));
    const name = assertSafeArtifactName(c.req.param("name"));
    const next = await setPinned(settings, id, name, true);
    return c.json(next);
  } catch (err) {
    const { status, body } = errorMessage(err);
    return c.json(body, status);
  }
});

app.delete("/api/cache/:runId/:name/pin", async (c) => {
  try {
    const settings = await loadSettings();
    const id = assertSafeRunId(c.req.param("runId"));
    const name = assertSafeArtifactName(c.req.param("name"));
    const next = await setPinned(settings, id, name, false);
    return c.json(next);
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
      kind: result.kind,
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

async function ensureAllureCached(
  settings: Awaited<ReturnType<typeof loadSettings>>,
  runId: string,
  preferredName?: string | null,
): Promise<string> {
  const artifacts = await listArtifacts(settings, runId);
  const allureArts = artifacts.filter((a) => a.kind === "allure" && !a.expired);
  if (allureArts.length === 0) {
    throw new Error(`Run #${runId} has no Allure artifacts`);
  }

  let name = preferredName?.trim()
    ? assertSafeArtifactName(preferredName)
    : undefined;
  if (name) {
    const match = allureArts.find((a) => a.name === name);
    if (!match) {
      throw new Error(`Allure artifact "${name}" not found on run #${runId}`);
    }
  } else {
    name =
      allureArts.find((a) => a.cached)?.name ??
      allureArts[0]!.name;
  }

  if (!isArtifactCached(runId, name) || !resolveReportRoot(runId, name)) {
    if (artifactKind(name) !== "allure") {
      throw new Error(`Artifact "${name}" is not an Allure report`);
    }
    await downloadArtifact(settings, runId, name);
  }
  return name;
}

app.get("/api/compare", async (c) => {
  try {
    const a = assertSafeRunId(c.req.query("a") ?? "");
    const b = assertSafeRunId(c.req.query("b") ?? "");
    const settings = await loadSettings();
    const artifactA = await ensureAllureCached(
      settings,
      a,
      c.req.query("artifactA"),
    );
    const artifactB = await ensureAllureCached(
      settings,
      b,
      c.req.query("artifactB"),
    );
    const result = await compareAllureReports({
      runA: a,
      runB: b,
      artifactA,
      artifactB,
    });
    return c.json(result);
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
      // Allow embed from Tauri shell and local browser tabs.
      "frame-ancestors 'self' http://tauri.localhost https://tauri.localhost tauri://localhost http://127.0.0.1:8787 http://localhost:8787 http://127.0.0.1:5173 http://localhost:5173",
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
      // Machine-readable ready line for the Tauri shell (writeSync so piped stdout is not block-buffered)
      writeSync(1, `RUNSIDE_READY ${url}\n`);
    },
  );
})();

