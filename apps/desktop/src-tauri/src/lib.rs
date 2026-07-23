use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent};

struct SidecarState(Mutex<Option<Child>>);

fn exe_dir() -> Result<PathBuf, String> {
    let mut path = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    path.pop();
    Ok(path)
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
        .env("RUNSIDE_PORT", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
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

    let handle = app.clone();
    if let Some(stdout) = stdout {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let trimmed = line.trim();
                eprintln!("[runside-server] {trimmed}");
                if let Some(url) = trimmed.strip_prefix("RUNSIDE_READY ") {
                    let url = url.trim().to_string();
                    if let Some(window) = handle.get_webview_window("main") {
                        if let Ok(parsed) = url.parse() {
                            let _ = window.navigate(parsed);
                        }
                    }
                }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|_app| {
            // Release: spawn packaged Node sidecar and navigate on RUNSIDE_READY.
            // Dev: beforeDevCommand + devUrl (http://127.0.0.1:8787).
            #[cfg(not(debug_assertions))]
            {
                if let Err(err) = spawn_sidecar(&_app.handle()) {
                    eprintln!("Failed to start Runside server: {err}");
                    if let Some(window) = _app.get_webview_window("main") {
                        let safe = err.replace('`', "'").replace('\\', "\\\\").replace('"', "'");
                        let _ = window.eval(&format!(
                            "document.body.innerHTML='<p style=\"font-family:system-ui;padding:2rem\">Failed to start local server:<br>{safe}</p>'"
                        ));
                    }
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
