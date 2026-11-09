//! Silent printing: the till prints the receipt and tickets straight to the
//! printer chosen for it (Imprimante de cette caisse), with no print dialog.
//! The page is the one on screen: the till's print styles (80/58 mm roll,
//! offset, extra copies) already shape it.

use tauri::{AppHandle, Manager, Runtime};

/// The printers this machine knows (installed in the system).
#[tauri::command]
pub fn list_printers() -> Result<Vec<String>, String> {
    platform::list_printers()
}

/// Prints the till window's page to `printer`, without a dialog.
#[tauri::command]
pub fn print_silent<R: Runtime>(app: AppHandle<R>, printer: String, paper_width_mm: Option<f64>) -> Result<(), String> {
    let width = paper_width_mm.filter(|w| (40.0..=120.0).contains(w)).unwrap_or(80.0);
    if printer.trim().is_empty() {
        return Err("NO_PRINTER".into());
    }
    let webview = app.get_webview_window("main").ok_or("NO_WINDOW")?;
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    webview
        .with_webview(move |wv| {
            let _ = tx.send(platform::print(wv, &printer, width));
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(15)).map_err(|_| "PRINT_TIMEOUT".to_string())?
}

#[cfg(target_os = "linux")]
mod platform {
    use webkit2gtk::{PrintOperation, PrintOperationExt};

    pub fn list_printers() -> Result<Vec<String>, String> {
        // CUPS destinations: what the system's printer settings show.
        let out = std::process::Command::new("lpstat").arg("-e").output().map_err(|e| format!("lpstat: {e}"))?;
        let mut names: Vec<String> = String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        names.sort();
        names.dedup();
        Ok(names)
    }

    /// Runs on the GTK main thread (inside with_webview).
    pub fn print(wv: tauri::webview::PlatformWebview, printer: &str, paper_width_mm: f64) -> Result<(), String> {
        let settings = gtk::PrintSettings::new();
        settings.set_printer(printer);
        settings.set_n_copies(1);
        // Testing without paper: printer "Print to File" + NGUON_PRINT_TO_FILE=/path/out.pdf.
        if let Ok(path) = std::env::var("NGUON_PRINT_TO_FILE") {
            settings.set(gtk::PRINT_SETTINGS_OUTPUT_URI, Some(format!("file://{path}").as_str()));
        }
        // The paper the printer is set up with in the system (its roll), not
        // GTK's locale default (A4); no margins: the till's print styles
        // place the content themselves.
        let paper = default_paper(printer, paper_width_mm);
        settings.set_paper_size(&paper);
        let setup = gtk::PageSetup::new();
        setup.set_paper_size(&paper);
        setup.set_top_margin(0.0, gtk::Unit::Mm);
        setup.set_bottom_margin(0.0, gtk::Unit::Mm);
        setup.set_left_margin(0.0, gtk::Unit::Mm);
        setup.set_right_margin(0.0, gtk::Unit::Mm);
        let op = PrintOperation::new(&wv.inner());
        op.set_print_settings(&settings);
        op.set_page_setup(&setup);
        op.connect_failed(|_, err| eprintln!("Nguon POS: printing failed: {err}"));
        op.print();
        Ok(())
    }

    /// The printer's default PageSize from CUPS ("*X80MMY210MM", "*80x297mm",
    /// "*A4"…), handed back under its own name so the driver recognises it.
    fn default_paper(printer: &str, roll_width_mm: f64) -> gtk::PaperSize {
        let mm_to_pt = |mm: f64| mm * 72.0 / 25.4;
        let fallback = || gtk::PaperSize::new_custom("nguon-roll", "Rouleau", roll_width_mm, 297.0, gtk::Unit::Mm);
        let Ok(out) = std::process::Command::new("lpoptions").args(["-p", printer, "-l"]).output() else {
            return fallback();
        };
        let text = String::from_utf8_lossy(&out.stdout);
        let Some(name) = text
            .lines()
            .find(|l| l.starts_with("PageSize/"))
            .and_then(|l| l.split_whitespace().find(|t| t.starts_with('*')))
            .map(|t| t.trim_start_matches('*').to_string())
        else {
            return fallback();
        };
        let (w, h) = dimensions_mm(&name).unwrap_or((roll_width_mm, 297.0));
        gtk::PaperSize::from_ppd(&name, &name, mm_to_pt(w), mm_to_pt(h))
    }

    /// "80x297mm", "X80MMY210MM", "w227h842" (points) → millimetres.
    fn dimensions_mm(name: &str) -> Option<(f64, f64)> {
        let lower = name.to_ascii_lowercase();
        let num = |s: &str| s.parse::<f64>().ok();
        if let Some(rest) = lower.strip_suffix("mm") {
            if let Some((w, h)) = rest.split_once('x') {
                let w = w.trim_start_matches(|c: char| !c.is_ascii_digit());
                if let (Some(w), Some(h)) = (num(w), num(h)) {
                    return Some((w, h));
                }
            }
            if let Some(rest) = rest.strip_prefix('x') {
                if let Some((w, h)) = rest.split_once("mmy") {
                    if let (Some(w), Some(h)) = (num(w), num(h)) {
                        return Some((w, h));
                    }
                }
            }
        }
        if let Some(rest) = lower.strip_prefix('w') {
            if let Some((w, h)) = rest.split_once('h') {
                if let (Some(w), Some(h)) = (num(w), num(h)) {
                    return Some((w * 25.4 / 72.0, h * 25.4 / 72.0));
                }
            }
        }
        None
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn paper_names() {
            assert_eq!(super::dimensions_mm("80x297mm"), Some((80.0, 297.0)));
            assert_eq!(super::dimensions_mm("X80MMY210MM"), Some((80.0, 210.0)));
            assert_eq!(super::dimensions_mm("Custom.72x200mm"), Some((72.0, 200.0)));
            assert!(super::dimensions_mm("A4").is_none());
            let (w, _) = super::dimensions_mm("w227h842").unwrap();
            assert!((w - 80.08).abs() < 0.1);
        }
    }
}

#[cfg(windows)]
mod platform {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2PrintSettings2, ICoreWebView2_16, COREWEBVIEW2_PRINT_STATUS_SUCCEEDED,
    };
    use webview2_com::PrintCompletedHandler;
    use windows::core::{Interface, HSTRING};

    pub fn list_printers() -> Result<Vec<String>, String> {
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
            .output()
            .map_err(|e| format!("Get-Printer: {e}"))?;
        let mut names: Vec<String> = String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        names.sort();
        Ok(names)
    }

    pub fn print(wv: tauri::webview::PlatformWebview, printer: &str, _paper_width_mm: f64) -> Result<(), String> {
        let e = |err: windows::core::Error| err.message().to_string();
        unsafe {
            let core = wv.controller().CoreWebView2().map_err(e)?;
            let core16: ICoreWebView2_16 = core.cast().map_err(|_| "WEBVIEW2_TOO_OLD".to_string())?;
            let env6: ICoreWebView2Environment6 = wv.environment().cast().map_err(|_| "WEBVIEW2_TOO_OLD".to_string())?;
            let settings = env6.CreatePrintSettings().map_err(e)?;
            settings.SetShouldPrintHeaderAndFooter(false).map_err(e)?;
            settings.SetShouldPrintBackgrounds(true).map_err(e)?;
            settings.SetMarginTop(0.0).map_err(e)?;
            settings.SetMarginBottom(0.0).map_err(e)?;
            settings.SetMarginLeft(0.0).map_err(e)?;
            settings.SetMarginRight(0.0).map_err(e)?;
            let settings2: ICoreWebView2PrintSettings2 = settings.cast().map_err(e)?;
            settings2.SetPrinterName(&HSTRING::from(printer)).map_err(e)?;
            settings2.SetCopies(1).map_err(e)?;
            let handler = PrintCompletedHandler::create(Box::new(|result, status| {
                if result.is_err() || status != COREWEBVIEW2_PRINT_STATUS_SUCCEEDED {
                    eprintln!("Nguon POS: printing failed: {status:?}");
                }
                Ok(())
            }));
            core16.Print(&settings, &handler).map_err(e)?;
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
mod platform {
    pub fn list_printers() -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    pub fn print(_wv: tauri::webview::PlatformWebview, _printer: &str, _paper_width_mm: f64) -> Result<(), String> {
        Err("UNSUPPORTED".into())
    }
}
