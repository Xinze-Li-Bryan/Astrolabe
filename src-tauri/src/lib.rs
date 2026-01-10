// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// Global state to hold the sidecar process
struct SidecarState(Mutex<Option<CommandChild>>);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            // Start the backend sidecar
            let shell = app.shell();

            match shell.sidecar("astrolabe-server") {
                Ok(sidecar_command) => {
                    match sidecar_command.spawn() {
                        Ok((mut rx, child)) => {
                            // Store the child process handle
                            let state = app.state::<SidecarState>();
                            *state.0.lock().unwrap() = Some(child);

                            // Log sidecar output
                            tauri::async_runtime::spawn(async move {
                                use tauri_plugin_shell::process::CommandEvent;
                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            println!("[Backend] {}", String::from_utf8_lossy(&line));
                                        }
                                        CommandEvent::Stderr(line) => {
                                            eprintln!("[Backend] {}", String::from_utf8_lossy(&line));
                                        }
                                        CommandEvent::Error(err) => {
                                            eprintln!("[Backend Error] {}", err);
                                        }
                                        CommandEvent::Terminated(payload) => {
                                            println!("[Backend] Terminated with code: {:?}", payload.code);
                                        }
                                        _ => {}
                                    }
                                }
                            });

                            println!("[Astrolabe] Backend sidecar started");
                        }
                        Err(e) => {
                            eprintln!("[Astrolabe] Failed to spawn sidecar: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[Astrolabe] Failed to find sidecar: {}", e);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill sidecar when window is closed
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<SidecarState>();
                let child = state.0.lock().unwrap().take();
                if let Some(child) = child {
                    let _ = child.kill();
                    println!("[Astrolabe] Backend sidecar stopped");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
