//! FFmpeg / FFprobe execution with progress events and cancellation.
//! Binaries are resolved in this order:
//!   1. AIVS_FFMPEG / AIVS_FFPROBE env vars
//!   2. bundled sidecar next to the app executable (externalBin)
//!   3. system PATH

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct Jobs(pub Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>);

#[derive(Clone, Serialize)]
struct Progress {
    job_id: String,
    seconds: f64,
}

fn exe_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

pub fn resolve_bin(base: &str) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var(format!("AIVS_{}", base.to_uppercase())) {
        let p = PathBuf::from(p);
        if p.exists() {
            return Ok(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let cand = dir.join(exe_name(base));
            if cand.exists() {
                return Ok(cand);
            }
        }
    }
    which::which(base).map_err(|_| {
        format!("{base} не найден. Установите FFmpeg или соберите приложение со встроенным бинарником (npm run fetch-ffmpeg).")
    })
}

fn command(bin: &PathBuf) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[tauri::command]
pub async fn ffmpeg_run(
    app: AppHandle,
    jobs: State<'_, Jobs>,
    job_id: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let bin = resolve_bin("ffmpeg")?;
    let mut cmd = command(&bin);
    cmd.args(["-progress", "pipe:1", "-nostats"]).args(&args);
    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("не удалось запустить ffmpeg: {e}"))?;
    let stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let child = Arc::new(Mutex::new(child));
    jobs.0.lock().unwrap().insert(job_id.clone(), child.clone());
    let jobs_map = jobs.0.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let err_thread = std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = stderr.read_to_string(&mut buf);
            buf
        });
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(v) = line.strip_prefix("out_time_us=").or_else(|| line.strip_prefix("out_time_ms=")) {
                if let Ok(us) = v.trim().parse::<f64>() {
                    let _ = app.emit("ffmpeg://progress", Progress { job_id: job_id.clone(), seconds: us / 1_000_000.0 });
                }
            }
        }
        let status = loop {
            if let Some(s) = child.lock().unwrap().try_wait().map_err(|e| e.to_string())? {
                break s;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        };
        let err = err_thread.join().unwrap_or_default();
        jobs_map.lock().unwrap().remove(&job_id);
        if status.success() {
            Ok(())
        } else {
            let tail: String = err.chars().rev().take(2000).collect::<Vec<_>>().into_iter().rev().collect();
            Err(format!("ffmpeg завершился с кодом {:?}:\n{tail}", status.code()))
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    result
}

#[tauri::command]
pub fn ffmpeg_cancel(jobs: State<'_, Jobs>, job_id: String) -> Result<(), String> {
    if let Some(child) = jobs.0.lock().unwrap().get(&job_id) {
        let _ = child.lock().unwrap().kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn ffprobe_duration(path: String) -> Result<f64, String> {
    let bin = resolve_bin("ffprobe")?;
    tauri::async_runtime::spawn_blocking(move || {
        let out = command(&bin)
            .args(["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", &path])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).to_string());
        }
        String::from_utf8_lossy(&out.stdout).trim().parse::<f64>().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ffmpeg_info() -> Result<String, String> {
    let bin = resolve_bin("ffmpeg")?;
    let out = command(&bin).arg("-version").output().map_err(|e| e.to_string())?;
    let first = String::from_utf8_lossy(&out.stdout).lines().next().unwrap_or_default().to_string();
    Ok(format!("{first} ({})", bin.display()))
}
