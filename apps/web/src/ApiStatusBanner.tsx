import { useEffect, useState } from "react";
import { hubUrl, hubOrigin } from "./hub";

/** Banner when the local API (needed for Allure /reports) is unreachable. */
export function ApiStatusBanner() {
  const [down, setDown] = useState(false);

  useEffect(() => {
    // Only relevant when the UI is separated from the API (Tauri shell).
    if (!hubOrigin()) return;

    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch(hubUrl("/api/health"), { cache: "no-store" });
        if (!cancelled) setDown(!res.ok);
      } catch {
        if (!cancelled) setDown(true);
      }
    }

    void ping();
    const t = window.setInterval(() => void ping(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  if (!down) return null;

  return (
    <div className="error-box" style={{ margin: 0, borderRadius: 0 }}>
      Local API at http://127.0.0.1:8787 is not reachable — Allure reports will not open.
      Quit other Runside windows, stop `npm run start`/`dev` if they crashed, and relaunch the app.
    </div>
  );
}
