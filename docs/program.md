# Program & Runtime

## `run` — the simple path

The shortest complete iced program:

```rust
fn main() -> iced::Result {
    iced::run(State::update, State::view)
}
```

`run` takes your `update` and `view` functions and infers everything else — the initial state comes from `State: Default`, the theme is `Theme::default`, and the `Message` type is inferred from your signatures. It's genuinely all you need for a single-window app.

## `application` — the configurable path

When you need to configure anything, use `application` with the builder:

```rust
iced::application(State::default, State::update, State::view)
    .title("My App")
    .window_size((1024.0, 768.0))
    .theme(Theme::Dark)
    .subscription(State::subscription)
    .run()
```

The builder methods available on `Application`:

| Method                      | What it configures                                                     |
| --------------------------- | ---------------------------------------------------------------------- |
| `settings`                  | Global graphics settings: antialiasing, vsync, default font, text size |
| `window(window::Settings)`  | The window's full settings struct                                      |
| `title`                     | Window title, as a `str` or a `fn(&State) -> String`                   |
| `window_size`               | Initial size                                                           |
| `centered`                  | Start the window centred                                               |
| `position`                  | Initial window position                                                |
| `resizable` / `decorations` | Chrome behaviour                                                       |
| `transparent`               | Transparent window background                                          |
| `level`                     | Always on top, popover, and so on                                      |
| `antialiasing`              | MSAA on the renderer                                                   |
| `default_font` / `font`     | Typography defaults and additional font loading                        |
| `scale_factor`              | Override the display scale factor, as a `fn(&State) -> f32`            |
| `theme`                     | A `fn(&State) -> Theme`, so the theme can follow state                 |
| `style`                     | A `fn(&State, &Theme) -> theme::Style` for app-wide colours            |
| `subscription`              | A `fn(&State) -> Subscription<Message>`                                |
| `executor`                  | Swap the async runtime                                                 |
| `presets`                   | Named boot strategies, for reproducible test environments              |
| `exit_on_close_request`     | Whether closing the window ends the process                            |
| `run()`                     | Start the event loop                                                   |

::: tip There is no `icon` method
The window icon is set through `window::Settings`, not as a top-level builder method:

```rust
.window(window::Settings {
    icon: Some(window::icon::from_file_data(include_bytes!("../icon.png"))?),
    ..window::Settings::default()
})
```

:::

`theme` and `subscription` take closures over state, which is what lets a light/dark toggle or a live data feed exist at all.

`presets` is the one that is easy to misread. A `Preset` is not a style or a theme — it is a **named boot strategy**, a `Fn() -> (State, Task<Message>)`. You use it to override how the app starts under test, so a test can begin from a known state instead of whatever the real boot logic produced. The default implementation returns an empty slice, and nothing is needed unless you are writing tests against `iced_tester`.

## `timed` — pure applications

`application::timed` is a variant constructor whose `update` also receives the `Instant` of the message. It takes **four** arguments — note the `subscription`, which is required, not optional:

```rust
pub fn timed<State, Message, Theme, Renderer>(
    boot: impl BootFn<State, Message>,
    update: impl UpdateFn<State, Message>,
    subscription: impl Fn(&State) -> Subscription<Message>,
    view: impl for<'a> ViewFn<'a, State, Message, Theme, Renderer>,
) -> Application<impl Program<State = State, Message = (Message, Instant), Theme = Theme>>
```

Two things are easy to get wrong here. It returns an `Application`, **not** a tuple — there is no `Timed` type to name. And the `Message` type parameter is wrapped: the application's message is `(Message, Instant)`, which is how the timestamp reaches `update`.

```rust
iced::timed(
    State::default,
    |state: &mut State, (message, instant): (Message, Instant)| {
        state.update(message, instant)
    },
    |state: &State| state.subscription(),
    State::view,
)
.run()
```

The point is **purity**. A normal application calls `Instant::now()` inside `update`, so the same message history always produces a different result. With `timed`, the timestamp is an argument rather than a side-effecting call, so the app is a pure function of its message history.

That property is what makes time-travel debugging work: replaying the same messages with the same timestamps reproduces the exact same state. It is designed for the [comet](https://github.com/iced-rs/comet) debugger, and it is the only way to get a reliable replay.

Use it whenever you intend to debug animation or timing. Otherwise `application` is the one to reach for.

## `daemon` — headless programs

`daemon` builds a program with **no window**. It runs silently until an update returns a task created by `window::open`, and it keeps running when all windows close. This is how you write a background process, a tray app, or a multi-window server-style application.

```rust
iced::daemon(State::default, State::update, State::view)
    .title("Service")
    .run()
```

## The `Program` trait

Both `application` and `daemon` produce something implementing `Program`, the trait that describes an entire application to the runtime:

| Item             | Required | Purpose                                                    |
| ---------------- | :------: | ---------------------------------------------------------- |
| `State`          |    ✅    | Your application state                                     |
| `Message`        |    ✅    | Your event type                                            |
| `Theme`          |    ✅    | Your theme type                                            |
| `Renderer`       |    ✅    | The graphics backend                                       |
| `Executor`       |    ✅    | The async runtime                                          |
| `name()`         |    ✅    | Application name, used for the process and devtools        |
| `settings()`     |    ✅    | Graphics settings                                          |
| `window()`       |    ✅    | The window settings, or `None` for a daemon                |
| `boot()`         |    ✅    | Produces the initial state plus an optional startup `Task` |
| `update()`       |    ✅    | Applies a `Message`                                        |
| `view()`         |    ✅    | Renders a window                                           |
| `title()`        |    ➖    | Window title, derived from state                           |
| `subscription()` |    ➖    | Long-lived reactive streams                                |
| `theme()`        |    ➖    | Picks the theme from state                                 |
| `style()`        |    ➖    | App-wide text and background colours                       |
| `scale_factor()` |    ➖    | The display scale factor for a window                      |
| `presets()`      |    ➖    | Named boot strategies for reproducible tests               |

Every method with a default can be overridden by implementing the trait directly, or more practically by using the corresponding `Application` builder method. `Application` is itself a `Program` wrapper that holds your `Program` and applies these decorators, which is why chaining builder methods returns a new `Application` each time rather than mutating one.

The five associated types are what make iced generic end to end. Implementing `Program` by hand is possible but rarely necessary — `application`, `timed`, and `daemon` cover it.

## The frame loop

Once per frame the runtime:

1. Calls `view()` to build a fresh `Element` tree.
2. Diffs it against the retained `Tree`, matching widgets by `tag()` and `Id`, carrying over or discarding state.
3. Runs `layout()` top down to produce resolved boxes.
4. Converts platform input into `Event`s and pushes them through widget `update()` from the root downward. Layout widgets forward to children first; a widget that calls `capture_event()` halts propagation.
5. Drains the `Shell` for published `Message`s, and collects `Task`s your update returned.
6. Re-renders if anything changed.

Animation is built on this loop rather than replacing it. `Animation::go(new_state, at: Instant)` schedules a state change, and the runtime keeps requesting frames while the animation is live.

## Window tasks

`iced::window` provides a family of tasks that act on windows, all returning `Task<T>`:

| Task                                                                        | Purpose                                    |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| `open(settings)`                                                            | Open a new window; returns its `Id`        |
| `close(id)`                                                                 | Close a window                             |
| `oldest()` / `latest()`                                                     | Query the oldest or newest window id       |
| `frames()`                                                                  | Subscription firing every frame            |
| `events()`                                                                  | Subscription of all window events          |
| `open_events()` / `close_events()`                                          | Subscription of just openings and closings |
| `resize_events()`                                                           | Subscription of size changes               |
| `close_requests()`                                                          | Subscription of close attempts             |
| `size(id)` / `is_maximized(id)` / `is_minimized(id)` / `position(id)`       | Query window state                         |
| `resize(id, size)` / `move_to(id, point)`                                   | Change geometry                            |
| `maximize` / `minimize` / `toggle_maximize`                                 | Window state changes                       |
| `set_resizable` / `set_min_size` / `set_max_size` / `set_resize_increments` | Constraint changes                         |
| `mode(id)` / `set_mode(id, mode)`                                           | Fullscreen or windowed                     |
| `decorations(id, bool)`                                                     | Toggle window chrome                       |
| `drag(id)` / `drag_resize(id, direction)`                                   | Start a programmatic drag                  |
| `scale_factor(id)`                                                          | The display scale factor                   |
| `request_user_attention(id)`                                                | Flash the taskbar or dock                  |

This is how multi-window applications are built: return `window::open(...)` from an update, and give each window a view function that dispatches on its `Id`.

## Window settings

`window::Settings` is a plain struct you can build directly or modify field by field:

| Field                                                     | Purpose                                                  |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `size`                                                    | Initial size                                             |
| `position`                                                | Initial position                                         |
| `min_size` / `max_size`                                   | Size constraints                                         |
| `maximized` / `fullscreen`                                | Initial display state                                    |
| `visible`                                                 | Whether to show immediately                              |
| `resizable` / `closeable` / `minimizable` / `decorations` | Chrome and behaviour flags                               |
| `transparent`                                             | Transparent background                                   |
| `blur`                                                    | Background blur, where the platform supports it          |
| `level`                                                   | Window level: normal, always on top, popover, status bar |
| `icon`                                                    | Window icon                                              |
| `exit_on_close_request`                                   | Whether closing ends the process                         |
| `platform_specific`                                       | Escape hatch for platform only options                   |

## When are `view` and `subscription` called?

Precisely, because it determines where you can put work.

| Function       | Called                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| `boot`         | Once, at startup                                                           |
| `view`         | At startup, then again after every batch of messages that changed state    |
| `update`       | Once per message                                                           |
| `subscription` | Once at startup, then again whenever the returned value's identity changes |
| `theme`        | Once per frame, per window                                                 |
| `style`        | Once per frame, per window                                                 |

`view` is **not** called on a fixed timer. It is called when state changes, which is why a `Subscription` that emits nothing never triggers a rebuild.

`subscription` is the subtle one. It is re-evaluated on every update, and the result is compared by identity — the recipe plus a hash of the values you passed to it. If the identity is unchanged the existing subscription is kept alive; if it changed, the old one is dropped and a new one started. That is why a subscription configured from rapidly-changing state will thrash, and why `with` exists to carry varying data without changing identity.

::: warning Do not call `Instant::now()` in `view`
`view` should be a pure function of state. Anything time-dependent belongs in `update` or in an `Animation`, and if you need replayable time-travel debugging, use `application::timed` so the instant arrives as a message rather than a side-effecting call.
:::

## Does iced redraw all the time?

No. Rendering is on demand. The runtime requests a new frame when:

- a message arrives and changes state
- an `Animation` is in progress
- a widget requests a redraw through an `Action`, such as `Action::request_redraw()` or `Action::request_redraw_at(instant)`
- the window is resized or exposed

A completely idle application is not consuming the GPU. If you find yourself redrawing continuously, something is either emitting messages in a loop or an animation that never completes.

## What this implies for your code

- **`view()` runs on every state change.** Keep it cheap — do computation in `update` and store the result.
- **There is no lifecycle hook.** No `on_mount`, no `use_effect`. Effects are `Task`s returned from `update`, or `Subscription`s for long-lived work.
- **Widget position is identity.** A widget that moves in the tree can lose its internal state. Give stateful widgets explicit `id`s, and use `keyed_column!` for lists.
