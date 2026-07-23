import { NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { RunsPage } from "./pages/RunsPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { TriggerPage } from "./pages/TriggerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReportViewerPage } from "./pages/ReportViewerPage";
import { LibraryPage } from "./pages/LibraryPage";
import { ComparePage } from "./pages/ComparePage";

function HubLayout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Runside</h1>
          <span>Local Allure viewer for GitHub Actions</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Runs
          </NavLink>
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/trigger">Trigger</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

/** Handle runside:// deep links forwarded by the Tauri shell via query or hash. */
function DeepLinkListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deep = params.get("deep");
    if (deep) {
      navigate(deep, { replace: true });
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data === "object" && event.data?.type === "runside-deep-link") {
        const path = String(event.data.path ?? "");
        if (path.startsWith("/")) navigate(path);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);
  return null;
}

export function App() {
  return (
    <>
      <DeepLinkListener />
      <Routes>
        <Route path="/runs/:id/report/:name" element={<ReportViewerPage />} />
        <Route element={<HubLayout />}>
          <Route path="/" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/trigger" element={<TriggerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </>
  );
}
