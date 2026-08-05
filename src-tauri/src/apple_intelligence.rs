//! On-device Apple Intelligence (Foundation Models) via a tiny Swift bridge.
//!
//! We use a local `swift-bridge/AppleIntelligenceBridge.swift` instead of the
//! `foundation-models` crates.io crate, which currently requires a newer Xcode
//! SDK (26.4+/26.5) than many machines still ship.

#![cfg(target_os = "macos")]

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr;

use serde::Serialize;

#[link(name = "AppleIntelligenceBridge", kind = "static")]
unsafe extern "C" {
    fn gl_ai_is_available() -> bool;
    fn gl_ai_availability_code() -> i32;
    fn gl_ai_string_free(ptr: *mut c_char);
    fn gl_ai_proofread(
        instructions: *const c_char,
        prompt: *const c_char,
        out_error: *mut *mut c_char,
    ) -> *mut c_char;
}

#[derive(Debug, Clone, Serialize)]
pub struct Status {
    pub supported: bool,
    pub available: bool,
    pub reason: Option<String>,
}

fn free_c_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe { gl_ai_string_free(ptr) };
    }
}

fn take_c_string(ptr: *mut c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let s = unsafe { CStr::from_ptr(ptr) }
        .to_string_lossy()
        .into_owned();
    free_c_string(ptr);
    s
}

pub fn status() -> Status {
    let code = unsafe { gl_ai_availability_code() };
    if unsafe { gl_ai_is_available() } {
        return Status {
            supported: true,
            available: true,
            reason: None,
        };
    }
    let reason = match code {
        1 => Some(
            "This Mac is not eligible for Apple Intelligence (Apple Silicon required)."
                .to_string(),
        ),
        2 => Some(
            "Apple Intelligence is not enabled. Turn it on in System Settings.".to_string(),
        ),
        3 => Some(
            "The on-device model is still downloading or not ready. Try again in a moment."
                .to_string(),
        ),
        -1 => Some(
            "macOS 26 or newer is required for on-device Apple Intelligence.".to_string(),
        ),
        _ => Some("Apple Intelligence is unavailable on this Mac.".to_string()),
    };
    Status {
        supported: true,
        available: false,
        reason,
    }
}

pub fn is_available() -> bool {
    unsafe { gl_ai_is_available() }
}

/// Run a single-shot proofread with system instructions. Blocking.
pub fn proofread(instructions: &str, text: &str) -> Result<String, String> {
    if !is_available() {
        let st = status();
        return Err(st.reason.unwrap_or_else(|| {
            "Apple Intelligence is not available. Enable it in System Settings.".into()
        }));
    }

    let instructions_c =
        CString::new(instructions).map_err(|_| "instructions contain interior NUL".to_string())?;
    let prompt_c = CString::new(text).map_err(|_| "text contains interior NUL".to_string())?;

    let mut err_ptr: *mut c_char = ptr::null_mut();
    let result_ptr = unsafe {
        gl_ai_proofread(
            instructions_c.as_ptr(),
            prompt_c.as_ptr(),
            &mut err_ptr as *mut *mut c_char,
        )
    };

    if result_ptr.is_null() {
        let msg = if err_ptr.is_null() {
            "Apple Intelligence returned no result".to_string()
        } else {
            take_c_string(err_ptr)
        };
        return Err(format!("Apple Intelligence: {msg}"));
    }

    let out = take_c_string(result_ptr);
    if out.trim().is_empty() {
        return Err("Apple Intelligence returned empty correction".into());
    }
    Ok(out)
}
