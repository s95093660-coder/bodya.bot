mod media;
mod secrets;

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(media::Jobs::default())
        .invoke_handler(tauri::generate_handler![
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            media::ffmpeg_run,
            media::ffmpeg_cancel,
            media::ffprobe_duration,
            media::ffmpeg_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI Video Studio");
}
