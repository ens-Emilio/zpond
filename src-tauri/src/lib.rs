use tauri::{
    Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog().file().blocking_pick_folder().map(|p| p.to_string())
}

#[tauri::command]
fn pick_file(app: tauri::AppHandle) -> Option<String> {
    app.dialog().file().blocking_pick_file().map(|p| p.to_string())
}

#[tauri::command]
fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(path, None::<String>).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![pick_folder, pick_file, open_path, reveal_path])
        .setup(|app| {
            // Tray: Exibir/Ocultar + Sair — reuso ícone da janela
            let show = MenuItemBuilder::with_id("tray_show", "Exibir / Ocultar").build(app)?;
            let quit = MenuItemBuilder::with_id("tray_quit", "Sair").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
            let handle = app.handle().clone();
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = if w.is_visible().unwrap_or(true) { w.hide() } else { w.show().and_then(|_| w.set_focus()) };
                        }
                    }
                })
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "tray_show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = if w.is_visible().unwrap_or(true) { w.hide() } else { w.show().and_then(|_| w.set_focus()) };
                        }
                    }
                    "tray_quit" => app.exit(0),
                    _ => {}
                })
                .build(&handle)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running zpond");
}
