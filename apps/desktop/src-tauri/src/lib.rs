#[cfg(not(debug_assertions))]
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(not(debug_assertions))]
use std::net::SocketAddr;
#[cfg(not(debug_assertions))]
use std::path::PathBuf;
use std::process::Child;
#[cfg(not(debug_assertions))]
use std::process::{Command, Stdio};
use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent,
};
use tauri_plugin_deep_link::DeepLinkExt;

struct SidecarState(Mutex<Option<Child>>);

/// Fixed local port for the packaged desktop API (UI loads from Tauri assets).
const DESKTOP_PORT: u16 = 8787;

#[cfg(not(debug_assertions))]
fn exe_dir() -> Result<PathBuf, String> {
    let mut path = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    path.pop();
    Ok(path)
}

fn deep_link_to_path(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("runside://")
        .or_else(|| url.strip_prefix("runside:"))?;
    let path = rest.trim().trim_start_matches('/');
    if path.is_empty() {
        return Some("/".into());
    }
    Some(format!("/{path}"))
}

/// HashRouter deep link: set location.hash without leaving Tauri asset origin.
fn navigate_app(app: &AppHandle, path: &str) {
    let hash = if path == "/" {
        "#/".to_string()
    } else {
        format!("#{path}")
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.eval(&format!(
            "window.location.hash = {}",
            serde_json::to_string(&hash).unwrap_or_else(|_| "\"#/\"".into())
        ));
    }
}

#[cfg(not(debug_assertions))]
fn health_ok() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], DESKTOP_PORT));
    let Ok(mut stream) =
        std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(300))
    else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut buf = Vec::new();
    let _ = stream.read_to_end(&mut buf);
    let body = String::from_utf8_lossy(&buf);
    body.contains("200") && body.contains("runside")
}

#[cfg(not(debug_assertions))]
fn wait_for_health(attempts: u32) -> bool {
    for _ in 0..attempts {
        if health_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

#[cfg(not(debug_assertions))]
fn show_server_error(app: &AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let safe = message
            .replace('\\', "\\\\")
            .replace('`', "'")
            .replace('"', "'")
            .replace('\n', "<br>");
        let _ = window.eval(&format!(
            r#"
            (function() {{
              var el = document.getElementById('runside-server-error');
              if (!el) {{
                el = document.createElement('div');
                el.id = 'runside-server-error';
                el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f1412;color:#e8f0ea;font-family:system-ui;padding:2rem;';
                document.documentElement.appendChild(el);
              }}
              el.innerHTML = '<h1 style="margin-top:0">Local server not reachable</h1><p>{safe}</p><p style="opacity:.7">Reports and API calls need http://127.0.0.1:{port}. Close other Runside/npm processes using that port, then relaunch.</p>';
            }})();
            "#,
            port = DESKTOP_PORT
        ));
    }
}

#[cfg(not(debug_assertions))]
fn resource_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(name));
        candidates.push(resource_dir.join("resources").join(name));
    }
    if let Ok(dir) = exe_dir() {
        candidates.push(dir.join(name));
        candidates.push(dir.join("resources").join(name));
    }

    candidates.into_iter().find(|p| p.exists())
}

#[cfg(not(debug_assertions))]
fn web_dist_path(app: &AppHandle) -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("web"));
        candidates.push(resource_dir.join("resources").join("web"));
    }
    if let Ok(dir) = exe_dir() {
        candidates.push(dir.join("web"));
        candidates.push(dir.join("resources").join("web"));
    }

    candidates
        .into_iter()
        .find(|p| p.join("index.html").exists())
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(not(debug_assertions))]
fn sidecar_binary() -> Result<PathBuf, String> {
    let dir = exe_dir()?;
    #[cfg(windows)]
    let names = ["runside-server.exe", "binaries\\runside-server.exe"];
    #[cfg(not(windows))]
    let names = ["runside-server", "binaries/runside-server"];

    for name in names {
        let path = dir.join(name);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(format!(
        "runside-server not found next to app at {}",
        dir.display()
    ))
}

#[cfg(not(debug_assertions))]
fn spawn_sidecar(app: &AppHandle) -> Result<(), String> {
    // Reuse an already-healthy local API (e.g. npm run start) instead of failing on bind.
    if health_ok() {
        eprintln!("Runside API already healthy on port {DESKTOP_PORT}; skipping sidecar spawn");
        return Ok(());
    }

    let server_js = resource_file(app, "server.cjs").ok_or_else(|| {
        format!(
            "server.cjs not found (exe dir: {})",
            exe_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "?".into())
        )
    })?;
    let sidecar = sidecar_binary()?;

    let mut command = Command::new(&sidecar);
    command
        .arg(&server_js)
        .env("RUNSIDE_DESKTOP", "1")
        .env("RUNSIDE_PORT", DESKTOP_PORT.to_string())
        .env("PORT", DESKTOP_PORT.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    if let Some(web) = web_dist_path(app) {
        command.env("RUNSIDE_WEB_DIST", web);
    }

    if let Ok(dir) = exe_dir() {
        command.current_dir(&dir);
    }

    let mut child = command.spawn().map_err(|e| {
        format!(
            "spawn {} -- {}: {e}",
            sidecar.display(),
            server_js.display()
        )
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let state = app.state::<SidecarState>();
        let mut guard = state.0.lock().map_err(|_| "sidecar lock poisoned")?;
        *guard = Some(child);
    }

    if let Some(stdout) = stdout {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                eprintln!("[runside-server] {}", line.trim());
            }
        });
    }

    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                eprintln!("[runside-server:err] {}", line.trim());
            }
        });
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        if !wait_for_health(40) {
            show_server_error(
                &handle,
                &format!(
                    "Timed out waiting for the local API on port {DESKTOP_PORT}. Sidecar may have failed to bind (port in use) or crashed."
                ),
            );
        }
    });

    Ok(())
}

fn kill_sidecar(app: &AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Runside", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let Some(icon) = app.default_window_icon().cloned() else {
        eprintln!("No window icon for tray; skipping tray");
        return Ok(());
    };

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Runside")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                kill_sidecar(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            if let Err(err) = setup_tray(&app.handle()) {
                eprintln!("Tray setup failed (continuing): {err}");
            }

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let s = url.as_str();
                    if let Some(path) = deep_link_to_path(s) {
                        navigate_app(&handle, &path);
                    }
                }
            });

            #[cfg(desktop)]
            {
                let _ = app.deep_link().register("runside");
            }

            #[cfg(not(debug_assertions))]
            {
                if let Err(err) = spawn_sidecar(&app.handle()) {
                    eprintln!("Failed to start Runside server: {err}");
                    show_server_error(&app.handle(), &err);
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Runside")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                kill_sidecar(app_handle);
            }
        });
}
