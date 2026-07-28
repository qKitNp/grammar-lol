use rodio::{Decoder, DeviceSinkBuilder};
use std::io::Cursor;
use std::sync::mpsc::{self, Sender};

const SHIFT_CLICK_SOUND: &[u8] = include_bytes!("../../public/sounds/sound.ogg");

pub struct SoundHandle {
    tx: Sender<()>,
}

impl SoundHandle {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<()>();

        std::thread::Builder::new()
            .name("doubletap-sound".into())
            .spawn(move || {
                let sink_handle = match DeviceSinkBuilder::open_default_sink() {
                    Ok(handle) => Some(handle),
                    Err(err) => {
                        eprintln!("[sound] audio output init failed: {err}");
                        None
                    }
                };

                while rx.recv().is_ok() {
                    let Some(sink_handle) = sink_handle.as_ref() else {
                        continue;
                    };

                    let Ok(source) = Decoder::try_from(Cursor::new(SHIFT_CLICK_SOUND)) else {
                        eprintln!("[sound] failed to decode click sound bytes");
                        continue;
                    };
                    sink_handle.mixer().add(source);
                }
            })
            .expect("failed to spawn sound thread");

        Self { tx }
    }

    pub fn play_click(&self) {
        let _ = self.tx.send(());
    }
}
