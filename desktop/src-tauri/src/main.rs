// Nguon POS desktop till: a window showing the till screens. Everything
// else — data, sync, the QR signing key — lives in the local server
// (edge-service) the installer runs as a system service; this app only
// hands the screens the token that lets them talk to it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod print;

use std::path::PathBuf;
use tauri::Manager;

/// Where the installer puts the local server's data (and its UI token).
fn edge_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("NGUON_EDGE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    #[cfg(windows)]
    {
        let base = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".into());
        PathBuf::from(base).join("NguonPOS").join("edge")
    }
    #[cfg(not(windows))]
    {
        PathBuf::from("/var/lib/nguon-edge")
    }
}

/// The local server's UI token: proves to it that the caller is the
/// installed app, not a web page that happens to run on the same machine.
#[tauri::command]
fn edge_ui_token() -> Result<String, String> {
    std::fs::read_to_string(edge_data_dir().join("ui-token"))
        .map(|t| t.trim().to_string())
        .map_err(|e| format!("EDGE_TOKEN_UNREADABLE: {e}"))
}

/// Saves a file the screens produced (the support export) into the user's
/// Downloads folder — a web view cannot save files by itself. Returns the
/// full path, to show where it went.
#[tauri::command]
fn save_download(app: tauri::AppHandle, file_name: String, data_base64: String) -> Result<String, String> {
    use base64::Engine;
    // A plain file name only: no path, nothing that climbs out of Downloads.
    let safe: String = file_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    if safe.is_empty() || safe.starts_with('.') {
        return Err("BAD_NAME".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("BAD_DATA: {e}"))?;
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("NO_FOLDER: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&safe);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// After an automatic update (Ubuntu), the window still runs the old
/// screens: the till restarts itself into the new version.
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

fn main() {
    // WebKitGTK's DMA-BUF renderer paints a black window on a number of
    // Ubuntu machines (some GPUs, Wayland). The plain renderer is enough for
    // the till's screens. An explicit setting on the machine still wins.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        // The window starts hidden (tauri.conf.json) and appears once the
        // screens are drawn: no black or blank frame at startup.
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = webview.window().show();
            }
        })
        .setup(|app| {
            // Whatever happens to the page, never leave the till without a window.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(4));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![edge_ui_token, restart_app, save_download, print::list_printers, print::print_silent])
        .run(tauri::generate_context!())
        .expect("Nguon POS failed to start");
}
