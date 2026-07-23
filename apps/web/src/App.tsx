import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { RunsPage } from "./pages/RunsPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { TriggerPage } from "./pages/TriggerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReportViewerPage } from "./pages/ReportViewerPage";

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
          <NavLink to="/trigger">Trigger</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/runs/:id/report/:name" element={<ReportViewerPage />} />
      <Route element={<HubLayout />}>
        <Route path="/" element={<RunsPage />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route path="/trigger" element={<TriggerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
