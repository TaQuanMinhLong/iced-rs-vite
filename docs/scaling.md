# Structuring Larger Applications

Once an application outgrows a single state struct, the question is how to split it. The `update`, `view`, and `Message` triplet composes very cleanly, and the answer is screens plus plain function composition.

## Start with functions, not components

iced has no `Component` abstraction — the one that existed before 0.14 was removed. A "component" is simply a function returning an `Element`:

```rust
fn header() -> Element<'_, Message> {
    row![text("Title"), Space::new().width(Fill)].into()
}
```

This is enough for the large majority of reusable UI. Reach for a custom widget only when a piece of logic must own state across frames or intercept the event stream.

::: warning Functions cannot hold state
A plain function has no memory between calls. A toggle written as a function needs its state in the parent struct. If a component keeps needing parent state threaded through it, that is the signal to either pass a struct or write a real widget.
:::

## Split into screens

The official pattern is one module per screen, each owning its own state, messages, and the `update`/`view` pair. The top-level state holds an enum of whichever screen is active, and the top-level `Message` wraps each screen's messages.

```rust
use iced::{Element, Task};

struct State {
    screen: Screen,
}

enum Screen {
    Contacts(Contacts),
    Conversation(Conversation),
}

enum Message {
    Contacts(contacts::Message),
    Conversation(conversation::Message),
}
```

The `update` match dispatches to the active screen and ignores messages for inactive ones:

```rust
fn update(state: &mut State, message: Message) -> Task<Message> {
    match message {
        Message::Contacts(message) => {
            if let Screen::Contacts(contacts) = &mut state.screen {
                let action = contacts.update(message);

                match action {
                    contacts::Action::None => Task::none(),
                    contacts::Action::Run(task) => task.map(Message::Contacts),
                    contacts::Action::Chat(contact) => {
                        let (conversation, task) = Conversation::new(contact);
                        state.screen = Screen::Conversation(conversation);
                        task.map(Message::Conversation)
                    }
                }
            } else {
                Task::none()
            }
        }
        // … the other screens
    }
}
```

Three things are worth noticing in that match.

**The `if let` guard discards messages for the wrong screen.** When `Screen::Conversation` is active and a stale `contacts::Message` arrives from an in-flight task, the `else` arm returns `Task::none()` and nothing happens. Without the guard this is a runtime panic.

**`task.map(Message::Contacts)` re-wraps a screen's task into the app's message type.** This is what lets a screen return `Task<contacts::Message>` without knowing anything about the application. It is the single most important line in the pattern.

**Switching screens is just assigning to `state.screen`.** The `Chat` action constructs the next screen, assigns it, and returns its boot task.

::: tip Screens return their own message type
A screen's `update` returns `Task<contacts::Message>`, not `Task<Message>`. The top level adapts it with `.map()`. Keeping screens ignorant of the root message is what makes them independently testable and reusable.
:::

## The `Action` escape hatch

The example above has a screen return its own `Action` enum rather than a `Task`, which lets it express "switch to another screen" as a value:

```rust
enum Action {
    None,
    Run(Task<Message>),
    Chat(Contact),
}
```

This is not built into iced — it is a pattern, and a plain `Task` is usually enough. Reach for an `Action` enum when a screen needs to command the _application_ rather than just do async work of its own.

## Where subscriptions go

`subscription` is a single top-level function, so batch the screens' streams and tag them:

```rust
fn subscription(state: &State) -> Subscription<Message> {
    match &state.screen {
        Screen::Contacts(contacts) => contacts.subscription().map(Message::Contacts),
        Screen::Conversation(conversation) => {
            conversation.subscription().map(Message::Conversation)
        }
    }
}
```

Matching on the active screen is the simplest correct approach, and it also means a background screen stops receiving events while hidden. If a screen must keep running while hidden, batch both subscriptions instead of switching on `state.screen`.

## State placement: `State` first, globals last

The message loop already serialises everything, so shared mutable state is usually a sign that state is in the wrong place. Reach for a field on `State` before anything else.

When a value genuinely must outlive the app instance or be shared with non-UI code, a `static` with interior mutability is the idiomatic Rust answer:

```rust
// `Mutex::new` is a `const fn`, so this needs no lazy initialisation
static REGISTRY: Mutex<Vec<String>> = Mutex::new(Vec::new());

// `OnceLock` covers values whose construction needs code
static CACHE: OnceLock<HashMap<String, String>> = OnceLock::new();

fn register(name: &str) {
    REGISTRY.lock().unwrap().push(name.to_string());
}
```

This needs no `unsafe` and no `cfg` gates. It compiles on any target, though a target without OS threads has its own constraints — see [Web Target](/web/threads#state-and-threads) before relying on it in a browser.

| Situation                             | Do this                       |
| ------------------------------------- | ----------------------------- |
| Anything the UI renders               | A field on `State`            |
| Config, feature flags, app-wide cache | `static OnceLock<T>`          |
| A registry mutated at runtime         | `static Mutex<T>`             |
| Work spanning several screens         | A screen module, not a global |

::: warning A global is not shared state's replacement
A `static Mutex<T>` is invisible to `view()`. Nothing re-renders because the global changed — you would still have to publish a `Message` for the UI to notice. If the value affects what is drawn, it belongs in `State`.

:::

## A practical directory layout

```text
src/
├── main.rs           — the app: state, Message, update, view, subscription
├── contacts.rs       — a screen module
└── conversation.rs   — a screen module
```

Each screen module exports its state struct, its `Message`, and its `update`/`view`. Keep widget-level helpers as private functions in whichever module needs them.

## Checklist for a growing app

| Situation                               | Do this                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| Repeated UI, no state                   | Extract a function returning `Element`                          |
| A screen with its own data              | Extract a module with state, messages, `update`/`view`          |
| A screen needs to trigger navigation    | Return an `Action` enum, handle it at the top level             |
| A screen runs async work                | Return `Task<ScreenMessage>`, `.map()` it at the top level      |
| A screen needs live events              | Return `Subscription<ScreenMessage>`, `.map()` at the top level |
| A screen must keep running while hidden | Batch subscriptions instead of matching on the active screen    |
| A component needs its own memory        | Consider a custom widget, see [Custom Widgets](/custom-widgets) |

## Related

- [Program & Runtime](/program) — the `Program` trait the top level implements
- [Tasks & Subscriptions](/async) — the combinators used in the mapping above
- [Custom Widgets](/custom-widgets) — when composition genuinely is not enough
