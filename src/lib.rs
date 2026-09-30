use iced::widget::{button, column, text};
use iced::*;

// Only `start()` below needs the macro, and that function is wasm-only.
#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[derive(Default)]
pub struct Counter {
    value: i32,
}

#[derive(Debug, Clone, Copy)]
pub enum Message {
    Increment,
    Decrement,
}

impl Counter {
    fn update(&mut self, message: Message) {
        match message {
            Message::Increment => self.value += 1,
            Message::Decrement => self.value -= 1,
        }
    }

    fn view(&self) -> Element<'_, Message> {
        column![
            button("+").on_press(Message::Increment),
            text(self.value)
                .style(|_| text::Style {
                    color: Some(Color {
                        a: 255.0,
                        r: 255.0,
                        g: 255.0,
                        b: 255.0
                    })
                })
                .size(90),
            button("-").on_press(Message::Decrement),
        ]
        .padding(20)
        .into()
    }
}

/// Native entry point. Only meaningful with `--features native`; a `cdylib`
/// never runs `fn main`, so the web build boots through [`start`] instead.
#[cfg(feature = "native")]
#[inline]
pub fn run() -> iced::Result {
    iced::run(Counter::update, Counter::view).inspect(|_| {
        log::info!("Hello, world!");
    })
}

/// Web entry point. A `cdylib` never runs `fn main`, so startup is driven by
/// `#[wasm_bindgen(start)]`, which wasm-bindgen calls during instantiation.
#[cfg(feature = "wasm")]
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    console_log::init().ok();

    if let Err(error) = iced::run(Counter::update, Counter::view) {
        log::error!("{error}");
    }
}
