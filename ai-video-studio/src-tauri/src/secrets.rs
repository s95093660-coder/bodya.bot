//! API keys in the OS keychain: Windows Credential Manager, macOS Keychain,
//! Secret Service on Linux. Nothing is ever written to disk in plain text.

const SERVICE: &str = "ai-video-studio";

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if name.is_empty() || name.len() > 64 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("invalid secret name".into());
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain: {e}")),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?.set_password(value.trim()).map_err(|e| format!("keychain: {e}"))
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain: {e}")),
    }
}
