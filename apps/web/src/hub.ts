/** Base URL for API + reports when UI is hosted by the Tauri shell (not the Hono server). */
export function hubOrigin(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  if (
    protocol.startsWith("tauri") ||
    hostname === "tauri.localhost" ||
    (protocol === "https:" && hostname.endsWith(".localhost"))
  ) {
    return "http://127.0.0.1:8787";
  }
  return "";
}

export function hubUrl(path: string): string {
  const origin = hubOrigin();
  if (!path.startsWith("/")) return `${origin}/${path}`;
  return `${origin}${path}`;
}
