import { spawn } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export type GhResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export class GhError extends Error {
  constructor(
    message: string,
    readonly result: GhResult,
  ) {
    super(message);
    this.name = "GhError";
  }
}

let resolvedGh: string | undefined;

function isUsableFile(path: string): boolean {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a real `gh` / `gh.exe` binary. Never rely on `.cmd` shims.
 */
export function resolveGhBin(): string {
  if (resolvedGh) return resolvedGh;

  const fromEnv = process.env.GH_PATH?.trim();
  if (fromEnv && isUsableFile(fromEnv)) {
    resolvedGh = fromEnv;
    return resolvedGh;
  }

  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const localAppData = process.env.LOCALAPPDATA;
    const candidates = [
      join(programFiles, "GitHub CLI", "gh.exe"),
      programFilesX86 ? join(programFilesX86, "GitHub CLI", "gh.exe") : "",
      localAppData ? join(localAppData, "Programs", "GitHub CLI", "gh.exe") : "",
    ].filter(Boolean);

    for (const c of candidates) {
      if (existsSync(c)) {
        resolvedGh = c;
        return resolvedGh;
      }
    }

    const pathDirs = (process.env.PATH ?? "").split(delimiter);
    for (const dir of pathDirs) {
      if (!dir) continue;
      const exe = join(dir, "gh.exe");
      if (existsSync(exe)) {
        resolvedGh = exe;
        return resolvedGh;
      }
    }

    throw new GhError(
      "gh.exe not found. Install GitHub CLI or set GH_PATH to the full path of gh.exe (e.g. C:\\Program Files\\GitHub CLI\\gh.exe).",
      { code: 127, stdout: "", stderr: "gh.exe not found" },
    );
  }

  resolvedGh = "gh";
  return resolvedGh;
}

/**
 * Spawn `gh` with an argv array. Always shell:false (no cmd metachar injection).
 */
export function runGh(
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<GhResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  let bin: string;
  try {
    bin = resolveGhBin();
  } catch (err) {
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      shell: false,
      cwd: options.cwd,
      windowsHide: true,
      env: options.env ? { ...process.env, ...options.env } : process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new GhError(`gh timed out after ${timeoutMs}ms: gh ${args.join(" ")}`, {
          code: -1,
          stdout,
          stderr,
        }),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function runGhOk(
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<string> {
  let result: GhResult;
  try {
    result = await runGh(args, options);
  } catch (err) {
    if (err instanceof GhError) throw err;
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new GhError(
        "gh CLI not found. Install from https://cli.github.com/, or set GH_PATH to gh.exe, then restart Runside.",
        {
          code: 127,
          stdout: "",
          stderr: "gh not found",
        },
      );
    }
    throw err;
  }

  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || "unknown error").trim();
    throw new GhError(`gh ${args.join(" ")} failed: ${detail}`, result);
  }

  return result.stdout;
}

export async function runGhJson<T>(
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<T> {
  const stdout = await runGhOk(args, options);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [] as unknown as T;
  }
  return JSON.parse(trimmed) as T;
}
