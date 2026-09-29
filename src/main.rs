mod canvas;
mod log;

use iced::widget::{button, column, text};
use iced::*;

#[derive(Default)]
struct Counter {
    value: i32,
}

#[derive(Debug, Clone, Copy)]
enum Message {
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
                .size(50),
            button("-").on_press(Message::Decrement),
        ]
        .padding(20)
        .into()
    }
}

fn main() -> iced::Result {
    log::init();
    iced::run(Counter::update, Counter::view).inspect(|_| {
        log::info("Hello, world!");
    })
}
