//! Desktop: de balk bovenaan het scherm (de "notch" van Windows en Linux), het systeemvak en de globale sneltoetsen.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use crate::state::AppState;

pub const BAR: &str = "bar";

/// Bar sizes: closed (round orb or Dynamic Island pill) and open (the panel with tabs).
pub const COLLAPSED: (f64, f64) = (44.0, 44.0);
/// Dynamic Island pill in resting state (Nook orb + clock or status), with room for its two shoulders (10 each, `--island-shoulder`).
pub const COLLAPSED_PILL: (f64, f64) = (216.0, 36.0);
/// Dynamic Island pill widened for live media controls or active agent status.
pub const COLLAPSED_PILL_WIDE: (f64, f64) = (332.0, 38.0);
/// A compact agent notice: the bar keeps its height and grows wider, with the message and its buttons in the row.
pub const NOTICE: (f64, f64) = (580.0, 38.0);
/// The closed bar with a chat chip under the round Nook ("Bericht van Peter"): the round Nook on top, the chip below it.
pub const CHIP: (f64, f64) = (232.0, 82.0);
/// The open panel's full preset size is this share of the screen's work area, in both directions.
pub const EXPANDED_SCREEN_FRACTION: f64 = 0.75;
/// The smallest the open panel can be dragged to.
pub const EXPANDED_MIN: (f64, f64) = (420.0, 280.0);
pub const EXPANDED_COMPACT: (f64, f64) = (520.0, 360.0);
pub const EXPANDED_MEDIUM: (f64, f64) = (680.0, 460.0);
pub const EXPANDED_LARGE: (f64, f64) = (920.0, 620.0);

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    create_bar(app)?;
    create_tray(app)?;
    register_shortcuts(app);
    watch_fullscreen(app);
    let settings = app.state::<AppState>().settings();
    if settings.start_local_brain {
        start_local_brain(app, settings.provider);
    }
    restore_main(app);
    Ok(())
}

/// While a game or another app runs full screen, clicks pass through the closed bar to that app, so a click near the
/// top of the screen never lands on Nook by accident. The open panel (from a shortcut, the tray or a message that opens
/// it) and a focused bar always take clicks.
#[cfg(windows)]
fn watch_fullscreen(app: &AppHandle) {
    let app = app.clone();
    let _ = std::thread::Builder::new().name("nook-fullscreen".into()).spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(750));
        let fullscreen = fullscreen_app_in_front();
        let handle = app.clone();
        // Decided and applied on the main thread, in order with the panel opening (`bar_expand` runs there), so a
        // click-through queued from here can never land after the open panel turned it off.
        let _ = app.run_on_main_thread(move || {
            let Some(bar) = handle.get_webview_window(BAR) else { return };
            let pass = fullscreen && !PANEL_OPEN.load(Ordering::Relaxed) && !bar.is_focused().unwrap_or(false);
            if pass != CLICKS_PASS.load(Ordering::Relaxed) {
                set_clicks_pass(&bar, pass);
            }
        });
    });
}

#[cfg(not(windows))]
fn watch_fullscreen(_app: &AppHandle) {}

/// Whether the bar lets clicks through right now.
static CLICKS_PASS: AtomicBool = AtomicBool::new(false);

/// Whether the bar shows its open panel, even without focus.
static PANEL_OPEN: AtomicBool = AtomicBool::new(false);

/// Whether the bar's panel is open right now.
pub fn panel_open() -> bool {
    PANEL_OPEN.load(Ordering::Relaxed)
}

fn set_clicks_pass(bar: &tauri::WebviewWindow, pass: bool) {
    if bar.set_ignore_cursor_events(pass).is_ok() {
        CLICKS_PASS.store(pass, Ordering::Relaxed);
    }
}

/// Windows' own answer to "is a full-screen app in front?": a Direct3D game in exclusive full screen, a borderless
/// full-screen window (most games, a video, a slideshow) or presentation mode.
#[cfg(windows)]
fn fullscreen_app_in_front() -> bool {
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
    unsafe { SHQueryUserNotificationState() }
        .is_ok_and(|state| state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE)
}

/// Shortcuts that could not be registered (another app holds them), by action, for Settings to point out.
static SHORTCUT_PROBLEMS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

pub fn shortcut_problems() -> Vec<String> {
    SHORTCUT_PROBLEMS.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// A local brain that is installed but not running is started in the background, so the first question just works.
pub fn start_local_brain(_app: &AppHandle, provider: nook_core::provider::AIProvider) {
    use super::local_brain::{ensure_running, Server};
    use nook_core::provider::AIProvider;
    let server = match provider {
        AIProvider::Ollama => Server::Ollama,
        AIProvider::Lmstudio => Server::LmStudio,
        _ => return,
    };
    tauri::async_runtime::spawn(async move {
        let outcome = ensure_running(server).await;
        log::info!("Local brain at launch: {outcome:?}");
    });
}

/// The first time the main window is closed: a note that Nook keeps running, so it does not look like it quit (or
/// like it is still open by mistake).
pub fn closed_main(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.settings().tray_hint_shown {
        return;
    }
    state.update_settings(|s| s.tray_hint_shown = true);
    super::notify(
        app,
        nook_core::i18n::tr("Nook draait verder", "Nook keeps running"),
        nook_core::i18n::tr(
            "Nook blijft bovenaan je scherm en in het systeemvak. Alt+Ctrl+W opent het venster weer; stoppen doe je via het systeemvak.",
            "Nook stays at the top of your screen and in the system tray. Alt+Ctrl+W opens the window again; quit from the system tray.",
        ),
    );
}

/// Puts the main window back where it was (size, place, maximized), if that place is still on a screen.
fn restore_main(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else { return };
    let Some(placement) = app.state::<AppState>().settings().main_window else { return };
    let screens: Vec<(i32, i32, u32, u32)> = main
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    if !placement.visible_on(&screens) {
        return;
    }
    let _ = main.set_size(tauri::PhysicalSize::new(placement.width, placement.height));
    let _ = main.set_position(tauri::PhysicalPosition::new(placement.x, placement.y));
    if placement.maximized {
        let _ = main.maximize();
    }
}

/// Remembers where the main window is, before it hides or Nook stops.
pub fn remember_main(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else { return };
    if !main.is_visible().unwrap_or(false) || main.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = main.is_maximized().unwrap_or(false);
    let state = app.state::<AppState>();
    // A maximized window keeps the size it had before, so un-maximizing after a restart still gives a normal window.
    let previous = state.settings().main_window;
    let (Ok(pos), Ok(size)) = (main.outer_position(), main.inner_size()) else { return };
    let placement = match (maximized, previous) {
        (true, Some(before)) => nook_core::settings::WindowPlacement { maximized: true, ..before },
        _ => nook_core::settings::WindowPlacement { x: pos.x, y: pos.y, width: size.width, height: size.height, maximized },
    };
    if previous != Some(placement) {
        state.update_settings(|s| s.main_window = Some(placement));
    }
}

/// The tray tooltip says what waits on you, so a glance at the taskbar is enough.
pub fn tray_status(app: &AppHandle, waiting: usize, working: usize) {
    let Some(tray) = app.tray_by_id("nook") else { return };
    let _ = tray.set_tooltip(Some(tray_tooltip(waiting, working)));
}

pub fn tray_tooltip(waiting: usize, working: usize) -> String {
    use nook_core::i18n::{tr, trf};
    match (waiting, working) {
        (0, 0) => "Kimily".into(),
        (0, n) => trf("Kimily · bezig met {n}", "Kimily · working on {n}", &[("n", &n)]),
        (1, _) => tr("Kimily · 1 chat wacht op je", "Kimily · 1 chat is waiting for you").into(),
        (n, _) => trf("Kimily · {n} chats wachten op je", "Kimily · {n} chats are waiting for you", &[("n", &n)]),
    }
}

fn create_bar(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, BAR, WebviewUrl::App("index.html#bar".into()))
        .title("Kimily")
        .inner_size(COLLAPSED.0, COLLAPSED.1)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        // Files dragged onto the closed bar arrive as web drop events; the native handler would swallow them on Windows.
        .disable_drag_drop_handler()
        // Op Linux negeert GTK `set_size` bij een vast formaat; zonder rand kan de gebruiker hem toch niet slepen.
        .resizable(true)
        .min_inner_size(COLLAPSED.0, COLLAPSED.1)
        .always_on_top(true)
        .skip_taskbar(true)
        // Dragged against the top edge, Windows Snap would maximize the island to the whole screen.
        .maximizable(false)
        .visible(false)
        .build()?;
    // Should Snap still maximize it (a floating island dragged to the top), it goes straight back to its own size.
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Resized(_) = event {
            if let Some(bar) = handle.get_webview_window(BAR) {
                if bar.is_maximized().unwrap_or(false) {
                    let _ = bar.unmaximize();
                    place_bar(&handle, panel_open());
                }
            }
        }
    });
    place_bar(app, false);
    window.show()?;
    Ok(())
}

/// While the docked island is being slid along the top edge: where the pointer holds it, in logical px from the
/// island's left edge.
static DOCK_SLIDE: Mutex<Option<f64>> = Mutex::new(None);
/// Where the slide has put it so far: the distance from the middle of that screen, and which screen.
static DOCK_SLID: Mutex<Option<(f64, Option<String>)>> = Mutex::new(None);

/// Slides the docked island along the top edge under the pointer, onto another screen too when the pointer crosses
/// over. Kimily moves the window itself instead of handing the drag to Windows, which would let it leave the edge and
/// snap it to full screen. `done` saves the spot and the screen; a slide of a few pixels is a slip of the hand and
/// leaves it in the middle.
pub fn slide_docked_bar(app: &AppHandle, grab: f64, done: bool) -> Option<nook_core::settings::Settings> {
    *DOCK_SLIDE.lock().unwrap_or_else(|e| e.into_inner()) = Some(grab);
    place_bar(app, panel_open());
    if !done {
        return None;
    }
    *DOCK_SLIDE.lock().unwrap_or_else(|e| e.into_inner()) = None;
    let slid = DOCK_SLID.lock().unwrap_or_else(|e| e.into_inner()).take();
    let saved = app.state::<AppState>().update_settings(|s| {
        if let Some((offset, screen)) = slid {
            s.dock_x = (offset.abs() >= 12.0).then_some(offset);
            if screen.is_some() {
                s.dock_screen = screen;
            }
        }
    });
    place_bar(app, panel_open());
    Some(saved)
}

/// The screen the docked island sits on: the one under the pointer while it is slid, then the one it was slid to
/// (kept by name, so it comes back there after a restart), else where the window is now, else the main screen.
fn bar_monitor(window: &tauri::WebviewWindow, settings: &nook_core::settings::Settings) -> Option<(tauri::Monitor, Option<f64>)> {
    if settings.placement != "floating" {
        if DOCK_SLIDE.lock().unwrap_or_else(|e| e.into_inner()).is_some() {
            if let Ok(cursor) = window.cursor_position() {
                if let Ok(Some(monitor)) = window.monitor_from_point(cursor.x, cursor.y) {
                    return Some((monitor, Some(cursor.x)));
                }
            }
        }
        if let Some(name) = settings.dock_screen.as_deref() {
            if let Some(monitor) = window.available_monitors().ok().and_then(|all| all.into_iter().find(|m| m.name().map(String::as_str) == Some(name))) {
                return Some((monitor, None));
            }
        }
    }
    window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten()).map(|m| (m, None))
}

/// Bovenaan in het midden van het gekozen scherm, of op de plek waar de gebruiker hem neerzette (zwevend).
pub fn place_bar(app: &AppHandle, expanded: bool) {
    place_bar_sized(app, expanded, false, false, LAST_WIDE.load(Ordering::Relaxed));
}

/// Resets any custom dragged panel size and applies the new preset size immediately.
pub fn reset_panel_size(app: &AppHandle) {
    *DRAGGED_SIZE.lock().unwrap_or_else(|e| e.into_inner()) = None;
    *ACTIVE_PRESET.lock().unwrap_or_else(|e| e.into_inner()) = String::new();
    let is_open = PANEL_OPEN.load(Ordering::Relaxed);
    place_bar_sized(app, is_open, false, false, LAST_WIDE.load(Ordering::Relaxed));
}

/// Whether the closed Dynamic Island pill is currently in its wide media/status layout.
static LAST_WIDE: AtomicBool = AtomicBool::new(false);

/// The size you dragged the open panel to, and the size preset it was made under. Kept so closing the panel and
/// opening it again brings it back at that size instead of the default; a changed preset starts over.
static DRAGGED_SIZE: Mutex<Option<(f64, f64, String)>> = Mutex::new(None);
static ACTIVE_PRESET: Mutex<String> = Mutex::new(String::new());

/// Like [`place_bar`]; `notice` widens the closed bar for a compact agent notice, `chip` makes room under the round
/// Nook for the chip of a new chat message, `wide` widens the closed Dynamic Island pill for media controls or active agents.
pub fn place_bar_sized(app: &AppHandle, expanded: bool, notice: bool, chip: bool, wide: bool) {
    LAST_WIDE.store(wide, Ordering::Relaxed);
    let was_open = PANEL_OPEN.swap(expanded, Ordering::Relaxed);
    let Some(window) = app.get_webview_window(BAR) else { return };
    let settings = app.state::<AppState>().settings();
    let preset = settings.effective_panel_size().to_string();
    if was_open {
        let active_preset = ACTIVE_PRESET.lock().unwrap_or_else(|e| e.into_inner()).clone();
        // The panel is about to close or be placed again: what you dragged it to is kept first if the preset did not change.
        if active_preset == preset {
            if let Ok(inner) = window.inner_size() {
                let window_scale = window.scale_factor().unwrap_or(1.0);
                let (w, h) = (inner.width as f64 / window_scale, inner.height as f64 / window_scale);
                if w >= EXPANDED_MIN.0 && h >= EXPANDED_MIN.1 {
                    *DRAGGED_SIZE.lock().unwrap_or_else(|e| e.into_inner()) = Some((w, h, preset.clone()));
                }
            }
        }
    }
    if expanded {
        *ACTIVE_PRESET.lock().unwrap_or_else(|e| e.into_inner()) = preset.clone();
        // Over a full-screen game the closed bar lets clicks through; the open panel must take them right away.
        set_clicks_pass(&window, false);
    }
    let Some((monitor, cursor_x)) = bar_monitor(&window, &settings) else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let left = area.position.x as f64 / scale;
    let top = area.position.y as f64 / scale;
    let width = area.size.width as f64 / scale;
    let height = area.size.height as f64 / scale;
    let full_open = (
        (width * EXPANDED_SCREEN_FRACTION).max(EXPANDED_MIN.0).min(width),
        (height * EXPANDED_SCREEN_FRACTION).max(EXPANDED_MIN.1).min(height),
    );
    let preset_open = match preset.as_str() {
        "compact" => (EXPANDED_COMPACT.0.min(width), EXPANDED_COMPACT.1.min(height)),
        "medium" => (EXPANDED_MEDIUM.0.min(width), EXPANDED_MEDIUM.1.min(height)),
        "large" => (EXPANDED_LARGE.0.min(width), EXPANDED_LARGE.1.min(height)),
        "full" => full_open,
        _ => (EXPANDED_MEDIUM.0.min(width), EXPANDED_MEDIUM.1.min(height)),
    };
    let dragged = (*DRAGGED_SIZE.lock().unwrap_or_else(|e| e.into_inner()))
        .clone()
        .filter(|(_, _, p)| p == &preset)
        .map(|(w, h, _)| (w, h));
    let (w, h) = if !expanded && notice {
        NOTICE
    } else if !expanded && chip {
        CHIP
    } else if !expanded {
        if settings.island_display == "orb" {
            COLLAPSED
        } else if wide {
            COLLAPSED_PILL_WIDE
        } else {
            COLLAPSED_PILL
        }
    } else if let Some((w, h)) = dragged {
        // A size dragged on a larger screen still fits this one.
        (w.min(width).max(EXPANDED_MIN.0.min(width)), h.min(height).max(EXPANDED_MIN.1.min(height)))
    } else {
        preset_open
    };
    let (x, y) = match (settings.placement.as_str(), settings.float_x, settings.float_y) {
        ("floating", Some(fx), Some(fy)) => (left + width / 2.0 + fx - w / 2.0, top + fy),
        // Docked: on the top edge, slid sideways as far as the user dragged it, but never off the screen.
        _ => {
            let centered = left + (width - w) / 2.0;
            let grab = *DOCK_SLIDE.lock().unwrap_or_else(|e| e.into_inner());
            let offset = match (grab, cursor_x) {
                (Some(grab), Some(cursor)) => {
                    let offset = cursor / scale - grab - centered;
                    *DOCK_SLID.lock().unwrap_or_else(|e| e.into_inner()) = Some((offset, monitor.name().cloned()));
                    offset
                }
                _ => settings.dock_x.unwrap_or(0.0),
            };
            ((centered + offset).clamp(left, (left + width - w).max(left)), top)
        }
    };
    // The closed bar is a fixed round Nook: stretching it would only blow the circle up, so its size is pinned by min
    // and max. (Toggling `resizable` instead changes the window frame, which throws the first open off.)
    let _ = window.set_max_size(None::<LogicalSize<f64>>);
    let _ = window.set_min_size(Some(if expanded { LogicalSize::new(EXPANDED_MIN.0, EXPANDED_MIN.1) } else { LogicalSize::new(w, h) }));
    set_bounds(&window, x, y, w, h, scale);
    if !expanded {
        let _ = window.set_max_size(Some(LogicalSize::new(w, h)));
    }
}

/// Moves and resizes the bar in one step. Two separate calls (size, then position) made Windows draw the window once
/// at the new size on the old spot, so the island visibly jumped sideways every time it opened or closed on hover.
fn set_bounds(window: &tauri::WebviewWindow, x: f64, y: f64, w: f64, h: f64, scale: f64) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
        if let Ok(handle) = window.hwnd() {
            let hwnd = HWND(handle.0 as *mut _);
            let moved = unsafe {
                SetWindowPos(
                    hwnd,
                    None,
                    (x * scale).round() as i32,
                    (y * scale).round() as i32,
                    (w * scale).round() as i32,
                    (h * scale).round() as i32,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                )
            };
            if moved.is_ok() {
                return;
            }
        }
    }
    let _ = scale;
    let _ = window.set_size(LogicalSize::new(w, h));
    let _ = window.set_position(LogicalPosition::new(x, y));
}

/// `--window` opent het hoofdvenster, `--settings` meteen de instellingen.
pub fn route_from_args(args: &[String]) -> Option<&'static str> {
    if args.iter().any(|a| a == "--settings") {
        Some("settings")
    } else if args.iter().any(|a| a == "--window") {
        Some("chat")
    } else {
        None
    }
}

pub fn toggle_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        if main.is_visible().unwrap_or(false) && main.is_focused().unwrap_or(false) {
            let _ = main.hide();
        } else {
            let _ = main.show();
            let _ = main.set_focus();
        }
    }
}

pub fn show_main(app: &AppHandle, route: &str) {
    // Bewaard voor het geval de interface nog laadt en het event mist.
    *app.state::<AppState>().pending_route.lock().unwrap_or_else(|e| e.into_inner()) = Some(route.to_string());
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
        let _ = main.emit("navigate", route);
    }
}

/// Shows the terminal Nook just started beside the chat in the main window.
pub fn open_terminal_beside_chat(app: &AppHandle, folder: &str, id: &str, nook_id: Option<&str>) {
    let terminal = crate::state::ChatTerminal { folder: folder.to_string(), id: id.to_string() };
    *app.state::<AppState>().pending_chat_terminal.lock().unwrap_or_else(|e| e.into_inner()) = Some(terminal.clone());
    let route = nook_id.map(|n| format!("nook:{n}")).unwrap_or_else(|| "chat".into());
    show_main(app, &route);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("chat-terminal", terminal);
    }
}

/// Opent de balk en zet de cursor in het invoerveld.
pub fn open_bar(app: &AppHandle, focus: &str) {
    // While Nook hides for a share or meeting, agent prompts wait in the bar; a shortcut or the tray still opens it.
    if focus == "agents" && crate::services::quiet::holds_cards(app) {
        return;
    }
    if let Some(bar) = app.get_webview_window(BAR) {
        place_bar(app, true);
        let _ = bar.show();
        let _ = bar.set_focus();
        let _ = bar.emit("bar-open", focus);
    }
}

/// The tray menu's labels in the interface language, in menu order: open, window, new, settings, quit.
fn tray_labels(language: &str) -> [&'static str; 5] {
    match language {
        "nl" => ["Open Kimily", "Open in venster", "Nieuwe chat", "Instellingen…", "Stop Kimily"],
        "de" => ["Kimily öffnen", "Im Fenster öffnen", "Neuer Chat", "Einstellungen…", "Kimily beenden"],
        "fr" => ["Ouvrir Kimily", "Ouvrir dans une fenêtre", "Nouvelle discussion", "Réglages…", "Quitter Kimily"],
        "es" => ["Abrir Kimily", "Abrir en ventana", "Nuevo chat", "Ajustes…", "Salir de Kimily"],
        _ => ["Open Kimily", "Open in window", "New chat", "Settings…", "Quit Kimily"],
    }
}

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let [open, window, new_nook, settings, quit] = tray_labels(&app.state::<AppState>().settings().app_language);
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let window = MenuItem::with_id(app, "window", window, true, Some("Alt+CommandOrControl+W"))?;
    let new_nook = MenuItem::with_id(app, "new", new_nook, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings, true, Some("CommandOrControl+,"))?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&open, &window, &new_nook, &PredefinedMenuItem::separator(app)?, &settings, &PredefinedMenuItem::separator(app)?, &quit],
    )
}

/// Rebuilds the tray menu after the interface language changed.
pub fn refresh_tray(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id("nook"), tray_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = tray_menu(app)?;
    let mut builder = TrayIconBuilder::with_id("nook").tooltip("Kimily").menu(&menu).show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open_bar(app, "chat"),
            "window" => show_main(app, "chat"),
            "new" => {
                show_main(app, "chat");
                let _ = app.emit("new-nook", ());
            }
            "settings" => show_main(app, "settings"),
            "quit" => {
                remember_main(app);
                app.exit(0)
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                open_bar(tray.app_handle(), "chat");
            }
        })
        .build(app)?;
    Ok(())
}

/// Globale sneltoetsen uit de instellingen. Een toets die al door een andere app bezet is, wordt overgeslagen
/// (en gemeld in het logboek), nooit een crash.
pub fn register_shortcuts(app: &AppHandle) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    let shortcuts = app.state::<AppState>().settings().shortcuts;
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    let mut problems = vec![];
    for (action, accelerator) in shortcuts {
        if accelerator.trim().is_empty() {
            continue;
        }
        let name = action.clone();
        let action = action.clone();
        let result = manager.on_shortcut(accelerator.as_str(), move |app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            match action.as_str() {
                "chat" => open_bar(app, "chat"),
                "talk" => open_bar(app, "voice"),
                "window" => toggle_main(app),
                "lookAlong" => open_bar(app, "lookAlong"),
                _ => {}
            }
        });
        if let Err(e) = result {
            log::warn!("Sneltoets {accelerator} kon niet worden vastgelegd: {e}");
            problems.push(name);
        }
    }
    *SHORTCUT_PROBLEMS.lock().unwrap_or_else(|e| e.into_inner()) = problems;
    crate::services::register_shortcuts(app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tray_says_what_waits() {
        nook_core::i18n::set_language("nl");
        assert_eq!(tray_tooltip(0, 0), "Kimily");
        assert_eq!(tray_tooltip(0, 2), "Kimily · bezig met 2");
        assert_eq!(tray_tooltip(1, 3), "Kimily · 1 chat wacht op je");
        assert_eq!(tray_tooltip(4, 0), "Kimily · 4 chats wachten op je");
    }
}
