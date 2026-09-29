# Overview

## What this is

The official iced documentation is thin — it shows one button and assumes you know the rest. This reference enumerates the **entire** public surface of iced 0.14: every widget constructor, every builder method, the `Widget` trait you implement yourself, the drawing primitives behind `canvas`, and the places where the library simply has no answer.

::: tip Reading paths
Use the links below as a reading order rather than a manual. If you have never written an iced application, start at [Quick Start](/quick-start) — it builds a working program from an empty directory and explains the three moving parts. If you are already comfortable and want the inventory, jump to [All Widgets A–Z](/widgets/).
:::

## The mental model

iced is an Elm-architecture runtime with a retained, diffed widget tree. Four ideas explain nearly all of it:

```rust
// State ──view()──▶ Element tree ──events──▶ Message ──update()──▶ State
fn view(&self) -> Element<'_, Message>        // pure, rebuilt on change
fn update(&mut self, message: Message) { }    // the only place state mutates
```

1. **`view()` is pure.** It reads state and returns widgets. It must have no side effects — all of them belong in `update`.
2. **Widgets emit `Message`s; they never mutate.** This is why every handler is named `on_*` and takes a message rather than a `&mut self` closure.
3. **`Element<'a, Message, Theme, Renderer>` is the universal currency.** Builder methods return concrete widget types; `.into()` erases them.
4. **Side effects are `Task`s and `Subscription`s**, returned from `update` and the application respectively.

::: details Full reasoning
These four ideas are not arbitrary. [Concepts & Philosophy](/concepts) derives them from the GUI trinity (widgets, interactions, state) and the Elm Architecture, and covers the design philosophy behind the library.
:::

## Capability map

Every widget in iced falls into one of six groups. The pages below are the detailed references.

| Group        | What you are building                              | Reach for                                                                  | Reference                          |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| **Layout**   | Positioning, sizing, scrolling, splitting          | `column!`, `row!`, `container`, `stack`, `scrollable`, `pane_grid`         | [Layout](/widgets/layout)          |
| **Input**    | Buttons, text entry, selection, click handling     | `button`, `text_input`, `text_editor`, `pick_list`, `slider`, `mouse_area` | [Input](/widgets/input)            |
| **Text**     | Labels, rich formatting, parsed content            | `text`, `span`, `rich_text`, `markdown`                                    | [Text & Rich](/widgets/text)       |
| **Data**     | Tabular and windowed content, overlays             | `table`, `grid`, `keyed_column!`, `lazy`, `tooltip`, `overlay::menu`       | [Data & Containers](/widgets/data) |
| **Graphics** | Images, vectors, freeform drawing, custom GPU work | `image`, `svg`, `canvas`, `qr_code`, `shader`                              | [Graphics](/widgets/graphics)      |
| **Styling**  | Theme roles, per-widget styles, motion             | `themer`, `.style()`, `Theme`, `Animation`                                 | [Theming](/theming)                |

The complete A–Z inventory — every constructor, its feature-gate status, and the list of widgets iced _does not_ ship — is on [All Widgets (A–Z)](/widgets/).

## Start here

Once the mental model clicks:

- [Concepts & Philosophy](/concepts) — the GUI trinity, the Elm Architecture, and the design philosophy
- [Builder patterns](/chaining) — how every widget is constructed, chained, and converted to an `Element`
- [Architecture](/architecture) — the crate stack, `Widget` trait, layout algorithm, frame loop
- [All widgets A–Z](/widgets/) — the full inventory, plus what iced _doesn't_ have
- [Feature flags](/features) — which capabilities are gated and how to enable them
- [Program & runtime](/program) — `run`, `application`, `timed`, `daemon`, windowing
- [Tasks & subscriptions](/async) — async work, streams, cancellation
- [Time & timers](/time) — `time::every`, `time::now`, frames, and debouncing
- [Structuring larger apps](/scaling) — screens, modules, state placement, and the official composition pattern
- [Web target](/web/) — compiling to wasm, threads and atomics, and the `webgl` requirement
- [Keyboard & pointer input](/input-keys) — key events, modifiers, focus
- [Custom widgets](/custom-widgets) — implementing `Widget` yourself

## Next

- [Quick Start](/quick-start) — a runnable counter in one file
- [Concepts & Philosophy](/concepts) — why iced is designed this way
