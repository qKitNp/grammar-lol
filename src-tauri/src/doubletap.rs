//! Cross-platform double-tap-Right-Shift detector.
//!
//! On macOS uses a CGEventTap on a dedicated thread (requires Accessibility
//! permission). On Windows and Linux (X11) uses `rdev::listen`. Emits
//! "doubletap-rshift" to the frontend when Right Shift is tapped twice within
//! DOUBLE_TAP_WINDOW_MS with no intervening keyboard or mouse activity.
//!
//! On macOS we retry installing the tap until Accessibility is granted — users
//! often enable it mid-onboarding after the first failed attempt.

use tauri::{AppHandle, Manager, Runtime};

// Slightly generous window — 300ms felt too tight for many users.
const DOUBLE_TAP_WINDOW_MS: u128 = 450;
const PERMISSION_TOAST_EVENT: &str = "doubletap-permission-missing";
const TRIGGER_EVENT: &str = "doubletap-rshift";

pub fn start<R: Runtime>(app: AppHandle<R>) {
    std::thread::Builder::new()
        .name("doubletap-rshift".into())
        .spawn(move || imp::run(app))
        .expect("failed to spawn doubletap thread");
}

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
    use core_graphics::event::{
        CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
        EventField, KeyCode,
    };
    use tauri::Emitter;

    struct State {
        last_rshift_down: Option<Instant>,
        clean: bool,
        rshift_held: bool,
    }

    pub fn run<R: Runtime>(app: AppHandle<R>) {
        // Retry until Accessibility is granted. The first attempt often fails
        // during onboarding before the user opens System Settings.
        let mut warned = false;
        let tap = loop {
            let state: Mutex<State> = Mutex::new(State {
                last_rshift_down: None,
                clean: true,
                rshift_held: false,
            });

            let app_for_cb = app.clone();
            let tap_result = CGEventTap::new(
                CGEventTapLocation::HID,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                vec![
                    CGEventType::FlagsChanged,
                    CGEventType::KeyDown,
                    CGEventType::LeftMouseDown,
                    CGEventType::RightMouseDown,
                ],
                move |_proxy, etype, event| {
                    let Ok(mut s) = state.lock() else { return None };

                    match etype {
                        CGEventType::FlagsChanged => {
                            let keycode =
                                event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE)
                                    as u64;
                            if keycode != KeyCode::RIGHT_SHIFT as u64 {
                                // Any other modifier change (including left shift)
                                // dirties the sequence.
                                s.clean = false;
                                s.last_rshift_down = None;
                                s.rshift_held = false;
                                return None;
                            }
                            if s.rshift_held {
                                // This is the release half of the transition.
                                s.rshift_held = false;
                                return None;
                            }
                            // Press edge of right shift.
                            s.rshift_held = true;
                            let now = Instant::now();
                            let fired = matches!(
                                s.last_rshift_down,
                                Some(prev)
                                    if s.clean
                                        && now.duration_since(prev).as_millis()
                                            <= DOUBLE_TAP_WINDOW_MS
                            );
                            if fired {
                                println!("[doubletap] Right Shift double-tap detected");
                                app_for_cb.state::<crate::sound::SoundHandle>().play_click();
                                let _ = app_for_cb.emit(TRIGGER_EVENT, ());
                                s.last_rshift_down = None;
                            } else {
                                s.last_rshift_down = Some(now);
                            }
                            s.clean = true;
                        }
                        CGEventType::KeyDown
                        | CGEventType::LeftMouseDown
                        | CGEventType::RightMouseDown => {
                            s.clean = false;
                            s.last_rshift_down = None;
                        }
                        _ => {}
                    }
                    None
                },
            );

            match tap_result {
                Ok(t) => break t,
                Err(()) => {
                    eprintln!(
                        "[doubletap] CGEventTapCreate failed (Accessibility permission missing?); retrying…"
                    );
                    if !warned {
                        warned = true;
                        let _ = app.emit(PERMISSION_TOAST_EVENT, ());
                    }
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        };

        let loop_source = match tap.mach_port.create_runloop_source(0) {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[doubletap] create_runloop_source failed");
                return;
            }
        };
        let current = CFRunLoop::get_current();
        unsafe {
            current.add_source(&loop_source, kCFRunLoopCommonModes);
        }
        tap.enable();
        println!("[doubletap] event tap installed; waiting for double-tap Right Shift");

        CFRunLoop::run_current();
    }
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
mod imp {
    use super::*;
    use std::sync::Mutex;
    use std::time::Instant;

    use rdev::{listen, Button, Event, EventType, Key};
    use tauri::Emitter;

    struct State {
        last_rshift_down: Option<Instant>,
        clean: bool,
        rshift_held: bool,
    }

    pub fn run<R: Runtime>(app: AppHandle<R>) {
        let state: Mutex<State> = Mutex::new(State {
            last_rshift_down: None,
            clean: true,
            rshift_held: false,
        });

        let app_for_cb = app.clone();
        let callback = move |event: Event| {
            let Ok(mut s) = state.lock() else { return };

            match event.event_type {
                EventType::KeyPress(Key::ShiftRight) => {
                    if s.rshift_held {
                        return;
                    }
                    s.rshift_held = true;
                    let now = Instant::now();
                    let fired = matches!(
                        s.last_rshift_down,
                        Some(prev)
                            if s.clean
                                && now.duration_since(prev).as_millis() <= DOUBLE_TAP_WINDOW_MS
                    );
                    if fired {
                        app_for_cb.state::<crate::sound::SoundHandle>().play_click();
                        let _ = app_for_cb.emit(TRIGGER_EVENT, ());
                        s.last_rshift_down = None;
                    } else {
                        s.last_rshift_down = Some(now);
                    }
                    s.clean = true;
                }
                EventType::KeyRelease(Key::ShiftRight) => {
                    s.rshift_held = false;
                }
                EventType::KeyPress(_)
                | EventType::ButtonPress(Button::Left)
                | EventType::ButtonPress(Button::Middle)
                | EventType::ButtonPress(Button::Right) => {
                    s.clean = false;
                    s.last_rshift_down = None;
                }
                _ => {}
            }
        };

        if let Err(err) = listen(callback) {
            eprintln!("[doubletap] rdev::listen failed: {:?}", err);
            let _ = app.emit(PERMISSION_TOAST_EVENT, ());
            return;
        }
        println!("[doubletap] listener installed; waiting for double-tap Right Shift");
    }
}
