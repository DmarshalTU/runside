// Phase 2 — desktop notifications when a watched run finishes (local browser only).
// No-op when Notification API is missing or permission is denied.

const askedKey = "runside.notify.asked";

export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (sessionStorage.getItem(askedKey) === "1") return false;
  sessionStorage.setItem(askedKey, "1");
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function notifyRunFinished(opts: {
  runId: number | string;
  title: string;
  conclusion: string | null;
}): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const conclusion = (opts.conclusion || "completed").replaceAll("_", " ");
  const n = new Notification(`Runside · ${conclusion}`, {
    body: `${opts.title}\n#${opts.runId}`,
    tag: `runside-run-${opts.runId}`,
  });
  n.onclick = () => {
    window.focus();
    window.location.href = `/runs/${opts.runId}`;
    n.close();
  };
}
