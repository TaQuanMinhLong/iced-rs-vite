# Quick Start

This page builds a working iced application from nothing, then explains each part. If you only read one page, read this one.

## Setup

```bash
cargo new my-app
cd my-app
```

Add iced to `Cargo.toml`:

```toml
[dependencies]
iced = "0.14"
```

That is enough for a native build. For the web, see [Web Target](/web/) — you will need the `webgl` feature and a bundler setup.

## The smallest possible program

```rust
fn main() -> iced::Result {
    iced::run(update, view)
}

fn update(state: &mut u64, message: Message) {
    match message {
        Message::Increment => *state += 1,
    }
}

fn view(state: &u64) -> Element<'_, Message> {
    button(text(state)).on_press(Message::Increment).into()
}

#[derive(Debug, Clone)]
enum Message {
    Increment,
}
```

`iced::run` infers everything else: the initial state comes from `Default` on `u64`, the theme is `Theme::default`, and the renderer is the default. Two functions and an enum, and you have a counter.

Note what is _not_ here. There is no `Component`, no `render()`, no `useState`, no lifecycle hook. `run` is the entire framework entry point.

## The three moving parts

Every iced application is exactly these three things:

| Part      | Signature                            | Responsibility               |
| --------- | ------------------------------------ | ---------------------------- |
| `update`  | `fn(&mut State, Message)`            | The only place state changes |
| `view`    | `fn(&State) -> Element<'_, Message>` | Turns state into widgets     |
| `Message` | your enum                            | Connects the two             |

The cycle is: a widget publishes a `Message`, `update` applies it to state, `view` rebuilds, repeat.

```text
State ──view()──▶ Element tree ──click──▶ Message ──update()──▶ State
```

The consequence worth internalising: **widgets cannot touch your state**. `button` has no way to mutate anything. It can only hand you a `Message` and wait. That is why every handler is named `on_*` and takes a message rather than a closure over `&mut self`.

## Using a struct

Real applications outgrow a bare `u64`. Define a state struct:

```rust
#[derive(Default)]
struct Counter {
    value: u64,
}

fn update(state: &mut Counter, message: Message) {
    match message {
        Message::Increment => state.value += 1,
    }
}

fn view(state: &Counter) -> Element<'_, Message> {
    column![
        text(format!("You clicked {} times", state.value)),
        button("Increment").on_press(Message::Increment),
    ]
    .into()
}
```

`Default` is required for the initial state, and that is the only constraint `run` imposes.

## Full imports

Everything above assumes these are in scope:

```rust
use iced::widget::{button, column, text};
use iced::Element;
```

A realistic file starts like this:

```rust
use iced::widget::{button, column, text};
use iced::{Alignment, Element, Length};

#[derive(Default)]
struct Counter {
    value: u64,
}

#[derive(Debug, Clone)]
enum Message {
    Increment,
}

impl Counter {
    fn view(&self) -> Element<'_, Message> {
        column![
            text(format!("You clicked {} times", self.value)),
            button("Increment").on_press(Message::Increment),
        ]
        .spacing(10)
        .padding(20)
        .width(Length::Shrink)
        .align_x(Alignment::Center)
        .into()
    }
}

fn update(state: &mut Counter, message: Message) {
    match message {
        Message::Increment => state.value += 1,
    }
}

fn main() -> iced::Result {
    iced::run(Counter::default, update, Counter::view)
}
```

::: tip The `Self::` convention
Once methods live on your state struct, `view` takes no separate `&self` argument at the call site. `iced::run(Counter::default, update, Counter::view)` passes them as plain function items. This is the shape most production iced code settles into.
:::

## Handling typed input

Adding a text field shows the pattern for values, which flows the _opposite_ way from the counter:

```rust
#[derive(Default)]
struct Form {
    name: String,
}

#[derive(Debug, Clone)]
enum Message {
    NameChanged(String),
    Submitted,
}

fn update(state: &mut Form, message: Message) {
    match message {
        Message::NameChanged(value) => state.name = value,
        Message::Submitted => { /* … */ }
    }
}

fn view(state: &Form) -> Element<'_, Message> {
    column![
        text_input("Name", &state.name)
            .on_input(Message::NameChanged)
            .on_submit(Message::Submitted),
    ]
    .into()
}
```

`on_input` hands you the **entire current value** on every keystroke, and `TextInput` owns the text while your state mirrors it. The full explanation is in [Input Widgets](/widgets/input).

## `view` can return a widget, not just an `Element`

`view` usually returns `Element<'_, Message>`, but any type that converts into one is accepted. Returning the concrete widget is nicer when you do not need to nest it further:

```rust
use iced::widget::{button, column, text, Column};

fn view(state: &Counter) -> Column<'_, Message> {
    column![
        text(format!("You clicked {} times", state.value)),
        button("Increment").on_press(Message::Increment),
    ]
}
```

The `.into()` at the end is optional in this case, because the runtime converts whatever you return. The rule is `Widget: Into<Element<'a, Message, Theme, Renderer>>`.

::: tip `Never` for views that emit nothing
A layout that only displays state and emits no messages can use `Never` as its message type:

```rust
use iced::Never;

fn view(_: &()) -> Container<'_, Never> {
    container(text("Static content"))
}
```

`Never` is an alias for `std::convert::Infallible`, the uninhabited type, so the compiler proves no message can ever be produced. It is a neat way to make the absence of interactions explicit rather than incidental.
:::

Anything that takes time returns a `Task` from `update` rather than blocking:

```rust
use iced::Task;

#[derive(Debug, Clone)]
enum Message {
    Load,
    Loaded(String),
}

fn update(state: &mut State, message: Message) -> Task<Message> {
    match message {
        Message::Load => Task::perform(
            async { fetch_thing().await },
            Message::Loaded,
        ),
        Message::Loaded(value) => {
            state.value = value;
            Task::none()
        }
    }
}
```

One-shot work is a `Task`. Repeating or push-based streams are `Subscription`s. See [Tasks and Subscriptions](/async).

## Configuring the window

Once you need more than `run` provides, switch to `iced::application`. It takes the same three pieces, but the boot function returns **both** the state and a startup `Task`:

```rust
fn main() -> iced::Result {
    iced::application(Counter::boot, update, Counter::view)
        .title("My App")
        .window_size((400.0, 300.0))
        .run()
}

fn boot() -> (Counter, Task<Message>) {
    (Counter::default(), Task::none())
}
```

`title` accepts a `&'static str` or any `impl TitleFn<State>`, so a title can be derived from state if you want it to. Everything the builder can configure is in [Program and Runtime](/program).

## When to read what

| If you want to                     | Read                              |
| ---------------------------------- | --------------------------------- |
| Know what widgets exist            | [All Widgets](/widgets/)          |
| Arrange things on screen           | [Layout Widgets](/widgets/layout) |
| Handle clicks, typing, choices     | [Input Widgets](/widgets/input)   |
| Change colours and spacing         | [Theme and Style](/theming)       |
| Animate a value                    | [Animation](/animation)           |
| Load data or open a socket         | [Tasks and Subscriptions](/async) |
| Ship to the browser                | [Web Target](/web/)               |
| Build something iced does not have | [Custom Widgets](/custom-widgets) |
| Understand the machinery           | [Architecture](/architecture)     |
