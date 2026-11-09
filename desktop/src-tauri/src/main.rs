// Nguon POS desktop till: a window showing the till screens. Everything
// else — data, sync, the QR signing key — lives in the local server
// (edge-service) the installer runs as a system service; this app only
// hands the screens the token that lets them talk to it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

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

/// After an automatic update (Ubuntu), the window still runs the old
/// screens: the till restarts itself into the new version.
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![edge_ui_token, restart_app])
        .run(tauri::generate_context!())
        .expect("Nguon POS failed to start");
}
