# Tasks and Subscriptions

iced splits async work into two mechanisms. Picking the right one is most of the battle.

|             | `Task`                           | `Subscription`                    |
| ----------- | -------------------------------- | --------------------------------- |
| Lifetime    | One-shot, returned from `update` | Long-lived, declared at app level |
| Produces    | Exactly one value                | A stream of values                |
| Typical use | Fetch once, save, open a window  | Timers, websockets, event streams |

One result is a `Task`. A repeating or push-based stream is a `Subscription`.

---

## `Task`

A `Task<T>` resolves to a single `T`. You return it from `update` and its output arrives back as a `Message`.

```rust
fn update(&mut self, message: Message) -> Task<Message> {
    match message {
        Message::Fetch => Task::perform(
            async { api::load_user().await },
            Message::Loaded,
        ),
        _ => Task::none(),
    }
}
```

### Constructors

| Method               | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `none()`             | Do nothing, the "no work" value                        |
| `done(value)`        | Immediately yields `value`                             |
| `perform(future, f)` | Run a future, map the output with `f`                  |
| `run(stream, f)`     | Drain a stream into messages                           |
| `sip(stream)`        | A stream that produces no messages but must stay alive |
| `batch(iter)`        | Run many tasks concurrently                            |
| `future(future)`     | A task yielding a value, for combinators               |
| `stream(stream)`     | A task yielding items from a stream                    |

`Task::done` is the one to reach for when state already exists but a message still needs delivering, such as a button that closes a dialog on success.

`batch` fires independent operations at once rather than in sequence.

### Combinators

| Method              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `map(f)`            | Transform the output                          |
| `and_then(task, f)` | Chain, feeding this result into the next task |
| `then(task)`        | Chain, discarding this result                 |
| `chain(task)`       | Alias of `then`                               |
| `collect()`         | Gather many outputs into a `Vec`              |
| `discard()`         | Drop the output, yield a different type       |
| `map_err(f)`        | Transform the error type                      |

`and_then` is the sequential tool: fetch a user, then fetch that user's posts, then load each.

`collect` turns a burst of values into one message, batching them into a single state update.

### Cancellation

| Method            | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `abortable()`     | Returns `(Task, Handle)`; `handle.abort()` stops it |
| `abort_on_drop()` | Abort automatically when dropped                    |
| `is_aborted()`    | Whether cancellation happened                       |
| `abort()`         | Cancel explicitly                                   |

This is how you debounce: start the task abortable, keep the handle, and abort the previous one before starting the next.

```rust
Message::Search(String) => {
    if let Some(handle) = self.search_handle.take() {
        handle.abort();
    }
    let (task, handle) = Task::perform(
        async { api::search(&query).await },
        Message::SearchResult,
    ).abortable();
    self.search_handle = Some(handle);
    task
}
```

`abort_on_drop` is the safer default when you don't need explicit control.

---

## `Subscription`

A `Subscription<T>` is a long-lived stream. You declare one at the application level, and it stays alive while its identity and configuration are stable.

```rust
fn subscription(state: &State) -> Subscription<Message> {
    every(Duration::from_secs(1)).map(|_| Message::Tick)
}

iced::application(State::default, State::update, State::view)
    .subscription(State::subscription)
    .run()
```

### Built-in recipes

| Recipe                    | Produces                                         |
| ------------------------- | ------------------------------------------------ |
| `time::every(duration)`   | An `Instant` on a fixed interval                 |
| `time::repeat(f, d)`      | An async fn's output on an interval — tokio only |
| `time::now()`             | A `Task` yielding the current `Instant`          |
| `window::frames()`        | An `Instant` every rendered frame                |
| `window::events()`        | All window events                                |
| `window::resize_events()` | Size changes                                     |

`window::frames()` is unusually useful for animation driven by actual rendered frames rather than wall-clock time. The timing recipes have their own page — see [Time & Timers](/time).

### Composing

| Method                    | What it does                        |
| ------------------------- | ----------------------------------- |
| `none()`                  | No subscription                     |
| `run(builder)`            | Build from a function               |
| `run_with(data, builder)` | Build from a function taking data   |
| `batch(iter)`             | Merge several into one              |
| `with(value)`             | Attach a constant, producing tuples |
| `map(f)`                  | Transform each item                 |
| `filter_map(f)`           | Transform and drop `None` results   |
| `units()`                 | How many recipes it contains        |

`batch` merges independent streams. `with` is the idiomatic way to tag a stream with what it belongs to:

```rust
Subscription::batch([
    stream_a.with(StreamId::A),
    stream_b.with(StreamId::B),
])
```

### Identity and lifecycle

A subscription's identity comes from its recipe plus the hash of the values passed to it. When that changes, the old subscription is dropped and a new one started.

The consequence worth remembering: a subscription whose configuration changes every frame will restart every frame. Build subscriptions from stable configuration and carry the varying part as data with `with`.

---

## Executors

| Feature                 | Executor              | Notes                     |
| ----------------------- | --------------------- | ------------------------- |
| `thread-pool` (default) | `futures` thread pool | Multi-threaded            |
| `tokio`                 | Tokio runtime         | If you already use Tokio  |
| `smol`                  | `smol`                | Lightweight async runtime |

`Application::executor` swaps it explicitly.

### The backend is resolved per target

iced picks an executor implementation at compile time rather than through the feature list alone, so one codebase can target both native and the web without conditional compilation in your own code:

```rust
// iced_futures-0.14.0/src/backend/default.rs
#[cfg(not(target_arch = "wasm32"))]
mod platform {
    #[cfg(feature = "tokio")]
    pub use crate::backend::native::tokio::*;

    #[cfg(all(feature = "smol", not(feature = "tokio")))]
    pub use crate::backend::native::smol::*;

    // ... and `thread-pool`, then `backend::null` as the final fallback
}

#[cfg(target_arch = "wasm32")]
mod platform {
    pub use crate::backend::wasm::wasm_bindgen::*;
}

pub use platform::*;
```

Two `cfg` layers are at work, and both matter. The outer one picks native versus wasm; the inner `feature` cfgs then choose _which_ native executor. Selecting a native executor feature therefore does not force that executor on every target — each target resolves the backend it can actually support. The per-target specifics are covered in [Web Target](/web/threads#tasks-and-executors).

::: danger The silent-drop executor
If no executor feature is resolved, iced falls back to `backend::null`, whose `spawn` has an empty body:

```rust
// iced_futures-0.14.0/src/backend/null.rs (9-11)
fn spawn(&self, _future: impl Future<Output = ()> + MaybeSend + 'static) {}
```

Futures are **dropped, never run** — no panic, no warning. If a `Task` appears to do nothing, check the resolved backend before debugging your own code.

:::

## `MaybeSend` — one async API across targets

`Task`, `Subscription`, and `Executor` are bounded by `MaybeSend` rather than `Send`. iced defines it so a single `async fn` compiles everywhere without `cfg` gates:

```rust
// iced_futures-0.14.0/src/maybe.rs (2-4, 18-20)
#[cfg(not(target_arch = "wasm32"))]
pub trait MaybeSend: Send {}

#[cfg(target_arch = "wasm32")]
pub trait MaybeSend {}          // ← no `Send` supertrait here
```

On a target with real threads, `MaybeSend` means `Send`. Where there are no threads to race against, it is an empty trait satisfied by everything.

::: tip The asymmetry is deliberate
A future holding an `Rc` or another non-`Send` handle is accepted only where nothing can move it between threads. You keep `Send` guarantees where they are meaningful, and drop them only where they are vacuous.
:::

---

## Patterns

### Concurrent loading

```rust
Message::Load => Task::batch([
    Task::perform(fetch_user(), Message::User),
    Task::perform(fetch_settings(), Message::Settings),
])
```

### Timers

```rust
fn subscription(state: &State) -> Subscription<Message> {
    if state.is_running {
        every(Duration::from_millis(16)).map(|_| Message::Frame)
    } else {
        Subscription::none()
    }
}
```

Returning `none()` is how you stop a stream. There is no separate unsubscribe call.

---

## See also

- [Task](#task) vs [Subscription](#subscription) is decided by whether you need one result or a stream
- [Program & Runtime](/program) — where `Task`s are actually run
- [Web Target](/web/threads) — threads, atomics, and worker constraints on the browser
- [Structuring Larger Apps](/scaling) — where state belongs vs a global
