use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, PhysicalPosition, State,
};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_sql::{Migration, MigrationKind};

mod auth;
mod doubletap;
mod inference;
mod sound;

struct OnboardingState(std::sync::atomic::AtomicBool);

#[derive(serde::Serialize)]
pub struct Capture {
    app_name: String,
    text: String,
}

#[cfg(target_os = "macos")]
fn frontmost_app() -> String {
    use std::process::Command;
    let out = Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to get name of first application process whose frontmost is true")
        .output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => "unknown".to_string(),
    }
}

#[cfg(not(target_os = "macos"))]
fn frontmost_app() -> String {
    "unknown".to_string()
}

#[cfg(target_os = "macos")]
const MOD_KEY: Key = Key::Meta;
#[cfg(not(target_os = "macos"))]
const MOD_KEY: Key = Key::Control;

fn send_mod_key(app: &tauri::AppHandle, letter: char) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let res = (|| -> Result<(), String> {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            enigo
                .key(MOD_KEY, Direction::Press)
                .map_err(|e| e.to_string())?;
            enigo
                .key(Key::Unicode(letter), Direction::Click)
                .map_err(|e| e.to_string())?;
            enigo
                .key(MOD_KEY, Direction::Release)
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_selection(app: tauri::AppHandle) -> Result<Capture, String> {
    let app_name = frontmost_app();
    let clip = app.clipboard();
    let _ = clip.write_text("");
    send_mod_key(&app, 'c')?;
    std::thread::sleep(std::time::Duration::from_millis(150));
    let text = clip.read_text().unwrap_or_default();
    Ok(Capture { app_name, text })
}

#[tauri::command]
async fn select_all_and_capture(app: tauri::AppHandle) -> Result<Capture, String> {
    let app_name = frontmost_app();
    let clip = app.clipboard();
    let _ = clip.write_text("");
    send_mod_key(&app, 'a')?;
    std::thread::sleep(std::time::Duration::from_millis(80));
    send_mod_key(&app, 'c')?;
    std::thread::sleep(std::time::Duration::from_millis(150));
    let text = clip.read_text().unwrap_or_default();
    Ok(Capture { app_name, text })
}

/// macOS TCC helpers for the two permissions Grammar.lol actually needs:
///
/// 1. **Accessibility** (`AXIsProcessTrusted`) — paste/replace via synthetic
///    keys + UI control. Also required for some event-tap install paths.
/// 2. **Input Monitoring** (`CGPreflightListenEventAccess`) — listen-only
///    `CGEventTap` for global Right Shift. Without this, the tap can install
///    and then receive no events (or fail) after a release rebuild.
///
/// Ad-hoc signed builds change CDHash every rebuild. System Settings can still
/// show "Grammar.lol" as enabled for an *old* binary while the current process
/// is untrusted — the preflight APIs are the source of truth.
#[cfg(target_os = "macos")]
pub mod macos_permissions {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(
            options: core_foundation::dictionary::CFDictionaryRef,
        ) -> bool;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
    }

    pub fn accessibility_trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    /// Prompt so the *current* binary is registered under Accessibility.
    pub fn request_accessibility() -> bool {
        if accessibility_trusted() {
            return true;
        }
        unsafe {
            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let value = CFBoolean::true_value();
            let pairs: Vec<(CFType, CFType)> =
                vec![(key.as_CFType(), value.as_CFType())];
            let options = CFDictionary::from_CFType_pairs(&pairs);
            AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef())
        }
    }

    pub fn input_monitoring_granted() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    /// Registers this process under Input Monitoring and may show a system
    /// prompt. Returns whether listen access is granted *after* the call
    /// (user may still need to flip the toggle and restart).
    pub fn request_input_monitoring() -> bool {
        if input_monitoring_granted() {
            return true;
        }
        unsafe {
            let _ = CGRequestListenEventAccess();
        }
        input_monitoring_granted()
    }

    /// Both grants needed for double-tap + in-place replace.
    pub fn shortcut_ready() -> bool {
        accessibility_trusted() && input_monitoring_granted()
    }
}

#[tauri::command]
fn check_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_permissions::accessibility_trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Re-register the running process for Accessibility and show Apple's prompt
/// when trust is missing (common after ad-hoc rebuilds).
#[tauri::command]
fn request_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_permissions::request_accessibility()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn check_input_monitoring_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_permissions::input_monitoring_granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn request_input_monitoring_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_permissions::request_input_monitoring()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn check_launch_at_login(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn enable_launch_at_login(app: tauri::AppHandle) -> bool {
    let autostart = app.autolaunch();
    let _ = autostart.enable();
    autostart.is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_onboarding_complete(state: State<'_, OnboardingState>, complete: bool) {
    state
        .0
        .store(complete, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    }
    Ok(())
}

#[tauri::command]
async fn replace_selection(app: tauri::AppHandle, text: String) -> Result<(), String> {
    let clip = app.clipboard();
    let prev = clip.read_text().ok();
    clip.write_text(text).map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(80));
    send_mod_key(&app, 'v')?;
    std::thread::sleep(std::time::Duration::from_millis(150));
    if let Some(p) = prev {
        let _ = clip.write_text(p);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_proofs_table",
            sql: "CREATE TABLE proofs (
                    id          TEXT PRIMARY KEY,
                    ts          INTEGER NOT NULL,
                    source_app  TEXT NOT NULL,
                    before_text TEXT NOT NULL,
                    after_text  TEXT,
                    status      TEXT NOT NULL,
                    error       TEXT,
                    screenshot  BLOB
                  );
                  CREATE INDEX idx_proofs_ts ON proofs (ts DESC);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_completed_ts",
            sql: "ALTER TABLE proofs ADD COLUMN completed_ts INTEGER;",
            kind: MigrationKind::Up,
        },
    ];

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:proofs.db", migrations)
                .build(),
        )
        .manage(sound::SoundHandle::new())
        .manage(OnboardingState(std::sync::atomic::AtomicBool::new(false)))
        .manage(auth::AuthState::new())
        .invoke_handler(tauri::generate_handler![
            capture_selection,
            select_all_and_capture,
            replace_selection,
            check_accessibility_permission,
            request_accessibility_permission,
            check_input_monitoring_permission,
            request_input_monitoring_permission,
            check_launch_at_login,
            enable_launch_at_login,
            set_onboarding_complete,
            show_main_window,
            auth::auth_status,
            auth::auth_sign_out,
            auth::chatgpt_login,
            auth::chatgpt_cancel_login,
            auth::xai_start_login,
            auth::xai_poll_login,
            auth::get_model_settings,
            auth::set_model,
            inference::proofread_text,
        ]);

    builder
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }

            let autostart = app.autolaunch();
            let marker = app
                .path()
                .app_config_dir()
                .ok()
                .map(|d| d.join(".autostart-initialized"));
            if let Some(ref m) = marker {
                if !m.exists() {
                    if let Some(parent) = m.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    let _ = autostart.enable();
                    let _ = std::fs::write(m, b"1");
                }
            }

            let open_item = MenuItemBuilder::with_id("open", "Open Grammar.lol").build(app)?;
            let toggle_label = if autostart.is_enabled().unwrap_or(false) {
                "Disable launch at login"
            } else {
                "Enable launch at login"
            };
            let toggle_item = MenuItemBuilder::with_id("toggle_autostart", toggle_label).build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&open_item, &toggle_item, &quit_item])
                .build()?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .tooltip("Grammar.lol")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        let _ = show_main_window(app.clone());
                    }
                    "toggle_autostart" => {
                        let a = app.autolaunch();
                        if a.is_enabled().unwrap_or(false) {
                            let _ = a.disable();
                        } else {
                            let _ = a.enable();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            doubletap::start(app.handle().clone());
            if let Some(overlay) = app.get_webview_window("overlay") {
                if let Ok(Some(monitor)) = overlay.current_monitor() {
                    let size = monitor.size();
                    let scale = monitor.scale_factor();
                    let w = 220.0 * scale;
                    let h = 56.0 * scale;
                    let x = (size.width as f64 - w) / 2.0;
                    let y = size.height as f64 - h - (32.0 * scale);
                    let _ = overlay.set_position(PhysicalPosition::new(x, y));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let onboarding_complete = window
                        .state::<OnboardingState>()
                        .0
                        .load(std::sync::atomic::Ordering::Relaxed);
                    if onboarding_complete {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                    #[cfg(target_os = "macos")]
                    {
                        let policy = if onboarding_complete {
                            tauri::ActivationPolicy::Accessory
                        } else {
                            tauri::ActivationPolicy::Regular
                        };
                        let _ = window.app_handle().set_activation_policy(policy);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
