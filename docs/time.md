# Time & Timers

iced has three separate mechanisms for dealing with time, and they are easy to confuse. This page separates them and covers the portability traps.

| You want to…                                | Use                                                        |
| ------------------------------------------- | ---------------------------------------------------------- |
| Run something periodically                  | `time::every(duration)`                                    |
| Run an async function periodically          | `time::repeat(f, interval)` — **tokio only**               |
| Read the current time once                  | `time::now()`                                              |
| React every rendered frame                  | `window::frames()`                                         |
| Animate a value over time                   | [`Animation`](/animation)                                  |
| Get a timestamp to replay deterministically | [`application::timed`](/program#timed-—-pure-applications) |

## `time::every` — the periodic subscription

The primary tool. It returns a `Subscription<Instant>`, so the current time arrives as a message:

```rust
use iced::{time, Subscription};

fn subscription(state: &State) -> Subscription<Message> {
    if state.is_ticking {
        time::every(Duration::from_secs(1)).map(Message::Tick)
    } else {
        Subscription::none()
    }
}
```

The **first** message arrives after one full `duration`, not immediately. Subsequent messages follow the same interval.

Returning `Subscription::none()` is how you stop a stream — there is no separate unsubscribe call. The identity of a `time::every` subscription is its `duration`, so two `every` calls with the same duration in the same app are the _same_ subscription, not two.

::: warning Do not use this for animation
`time::every` drives your `update` function on a timer, which re-renders the whole widget tree each tick. For anything visual, use [`Animation`](/animation) — it runs on the frame loop and only repaints what changed. A 60fps `time::every` is a common way to make an iced app feel slow.

:::

## `time::now` — reading the clock

Returns a `Task<Instant>` rather than calling `Instant::now()` directly:

```rust
Message::Refresh => iced::Task::future(async { Instant::now() })
```

The point is purity. A normal application calls `Instant::now()` inside `update`, which makes the same message history produce a different result every run. With `time::now` the timestamp becomes a message, so the app stays a pure function of its history.

This is what makes [time-travel debugging](/program#timed-—-pure-applications) possible. The same reasoning applies to `application::timed`, which takes the `Instant` as an argument to `update` directly.

::: tip On the web
`std::time::Instant::now()` panics in a browser. iced avoids this internally by using [`wasmtimer`](https://crates.io/crates/wasmtimer) on wasm, so `time::every` and `time::now` are both safe to use. Your own direct calls to `Instant::now()` are not — see [Web Target](/web/threads#state-and-threads).

:::

## `time::repeat` — async work on an interval

Runs an async function every interval and produces its output:

```rust
time::repeat(fetch_metrics, Duration::from_secs(5)).map(Message::Metrics)
```

The first argument is a plain `fn() -> F`, not a closure — it is part of the subscription's identity, so it must be a function pointer rather than a capturing closure.

::: danger This only exists on the tokio backend
`time::repeat` is defined **only** in `iced_futures`'s tokio backend. With `smol`, the default `thread-pool` executor, or on wasm, the symbol does not exist and your build fails.

```rust
// iced_futures-0.14.0/src/backend/native/tokio.rs (64) — the sole definition
pub fn repeat<F, T>(f: fn() -> F, interval: Duration) -> Subscription<T>

// iced_futures-0.14.0/src/backend/null.rs (21-22) — nothing but a doc comment
pub mod time {
    //! Listen and react to time.
}
```

`time::every` is defined on every backend, so prefer it. If you need `repeat`, run an `async` block inside `every`:

```rust
time::every(Duration::from_secs(5)).map(move |_| Message::Metrics)
```

…or express the work as a `Task` that re-subscribes. Treat `time::repeat` as a tokio-only convenience.

:::

## `window::frames` — per redraw

Fires once for every `RedrawRequested` event, yielding that frame's `Instant`:

```rust
// iced_runtime-0.14.0/src/window.rs (208-213)
pub fn frames() -> Subscription<Instant> {
    event::listen_raw(|event, _status, _window| match event {
        crate::core::Event::Window(Event::RedrawRequested(at)) => Some(at),
        _ => None,
    })
}
```

This is the one that is actually tied to the render loop rather than a timer. It only fires when the runtime has requested a frame, so an idle app produces nothing — which makes it far cheaper than `time::every` for continuous visual updates, provided you also keep requesting frames.

::: warning An idle app requests no frames
`frames()` is driven by `RedrawRequested`. If nothing invalidates the UI, no frames are requested and the subscription is silent. Pair it with an `Animation` or an explicit `Action::request_redraw()` if you need a continuous loop.

:::

## Durations

`iced::time` re-exports the core helpers, which read better than `Duration::from_*` in subscription code:

| Helper                  | Equivalent                       |
| ----------------------- | -------------------------------- |
| `time::seconds(n)`      | `Duration::from_secs(n)`         |
| `time::milliseconds(n)` | `Duration::from_millis(n)`       |
| `time::minutes(n)`      | `Duration::from_secs(60 * n)`    |
| `time::hours(n)`        | `Duration::from_secs(3600 * n)`  |
| `time::days(n)`         | `Duration::from_secs(86400 * n)` |

All take a `u64` and return a `Duration`. They are **not** `const fn`, so they cannot be used in a `static` initializer or other const context — reach for `Duration::from_secs` directly when you need one.

## Debouncing

There is **no** `debounce` method on `text_input`, and no `debounce` helper in iced — so debouncing is something you build. Two widgets accept a delay directly:

| Widget    | Method     | Effect                                 |
| --------- | ---------- | -------------------------------------- |
| `tooltip` | `delay(d)` | Wait this long before showing          |
| `sensor`  | `delay(d)` | Wait this long before firing `on_show` |

```rust
tooltip(text("Details"), Position::Bottom)
    .delay(Duration::from_millis(500))
```

For a `text_input`, debounce in `update` by comparing timestamps. `time::every` keeps firing; you just ignore the ticks that arrive too soon:

```rust
Message::Tick(at) => {
    // Accept the value only if the user has paused
    if at.duration_since(self.last_edit) >= DEBOUNCE {
        self.last_edit = at;
        self.committed_query = self.draft_query.clone();
        return Task::none();
    }
    Task::none()
}
```

The trick is that the _draft_ updates immediately from `on_input`, while the expensive work waits for a tick that clears the debounce window. The UI stays responsive because typing never waits on the timer.

## Choosing between timers and animation

| Need                               | Reach for                           |
| ---------------------------------- | ----------------------------------- |
| A clock, countdown, or polling     | `time::every`                       |
| A value that eases toward a target | [`Animation`](/animation)           |
| Smooth 60fps visuals               | `Animation`, or `window::frames`    |
| Waiting on an external event       | `Subscription` + `Task`             |
| Replayable timestamps              | `time::now` or `application::timed` |

## See also

- [Tasks & Subscriptions](/async) — the combinators used in every recipe here
- [Animation](/animation) — the frame-loop-driven alternative
- [Program & Runtime](/program#timed-—-pure-applications) — `application::timed` and purity
- [Web Target](/web/threads#state-and-threads) — `Instant` and timers in the browser
