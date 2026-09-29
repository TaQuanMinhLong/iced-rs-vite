# Architecture

How iced is put together, read from the crate source.

## The crate stack

iced is a facade over a deliberately modular stack. Applications normally only `use iced::…`, but the layering explains a lot about the API's shape.

| Crate              | Role                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `iced`             | Facade. Re-exports everything, defines `run`, `Application`, `Daemon`, `Preset`, the feature flags                          |
| `iced_widget`      | All the widgets, plus the `helpers` constructors that build them                                                            |
| `iced_core`        | Renderer-agnostic primitives: `Element`, the `Widget` trait, layout, `Text`, `Color`, `Point`, `Size`, `Rectangle`, `Shell` |
| `iced_runtime`     | The event loop, `Task`, `Subscription`, `Action`, and the `window::*` task family                                           |
| `iced_winit`       | The `winit` windowing shell                                                                                                 |
| `iced_wgpu`        | The GPU renderer built on wgpu                                                                                              |
| `iced_graphics`    | `Color`, `geometry` (Path/Fill/Stroke), `text`, `image`, `compositor`, `viewport`                                           |
| `iced_futures`     | `Subscription` and the executor backends                                                                                    |
| `iced_tiny_skia`   | A CPU software renderer                                                                                                     |
| `iced_highlighter` | Syntax highlighting, used by code blocks in `markdown` and `text_editor`                                                    |

The split matters because `iced_core` knows nothing about pixels. It describes _where_ things go; the renderer decides _how_ they look. That is why every widget is generic over `Renderer`, and why you can swap the GPU backend without touching UI code.

## The `Widget` trait

Every visual thing in iced implements one trait. This is the single most important interface in the library:

```rust
// core/src/widget.rs (37-150)
pub trait Widget<Message, Theme, Renderer>
where
    Renderer: crate::Renderer,
{
    fn size(&self) -> Size<Length>;

    fn size_hint(&self) -> Size<Length> {
        self.size()
    }

    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &Renderer,
        limits: &layout::Limits,
    ) -> layout::Node;

    fn draw(
        &self,
        tree: &Tree,
        renderer: &mut Renderer,
        theme: &Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    );

    fn tag(&self) -> tree::Tag;
    fn state(&self) -> tree::State;
    fn children(&self) -> Vec<Tree>;

    fn diff(&self, tree: &mut Tree) {
        tree.diff_children(&self.children())
    }

    fn operate(
        &self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &Renderer,
        operation: &mut dyn Operation,
    ) {
        let _ = (tree, layout, renderer, operation);
    }

    fn update(
        &mut self,
        tree: &mut Tree,
        event: &Event,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        renderer: &Renderer,
        clipboard: &mut dyn Clipboard,
        shell: &mut Shell<'_, Message>,
        viewport: &Rectangle,
    ) {
        let _ = (tree, event, layout, cursor, renderer, clipboard, shell, viewport);
    }

    fn mouse_interaction(
        &self,
        tree: &Tree,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) -> mouse::Interaction {
        let _ = (tree, layout, cursor, viewport)
    }

    fn overlay<'a>(
        &'a self,
        tree: &'a Tree,
        layout: Layout<'_>,
        renderer: &Renderer,
    ) -> Option<overlay::Overlay<'a>> {
        let _ = (tree, layout, renderer);
        None
    }
}
```

Most methods have defaults, so a minimal widget implements only `size`, `tag`, `state`, `layout`, and `draw`.

### Why `tag` and `state` exist

Because `view()` rebuilds the entire tree on every state change, widgets that hold _internal_ state — a text cursor, a scroll offset, a dropdown's open flag — need somewhere to persist that state across rebuilds. That somewhere is a `Tree`, a parallel tree the runtime keeps alive.

`tag()` returns a type token used to decide whether a `Tree` node can be **reused** for a new widget. If two widgets return the same `tag`, the old state carries over. If they differ, the state is discarded and rebuilt.

This is the source of the classic iced gotcha: **a widget whose position in the tree changes may lose its state.** `TextInput` and `Scrollable` both take an explicit `id` to control identity:

```rust
// widget/src/scrollable.rs (144-150)
pub fn id(mut self, id: impl Into<widget::Id>) -> Self
```

```rust
// widget/src/text_input.rs (157-158)
pub fn id(mut self, id: impl Into<widget::Id>) -> Self
```

### `operate` — the pre-event pass

`operate` runs _before_ events, walking the tree to let an ancestor push an instruction downward. This is how "focus this text input" works: the runtime issues an `Operation` and `Container::operate` — which every layout widget implements — forwards it to children until a widget claims it.

```rust
// widget/src/column.rs (242-255)
fn operate(
    &mut self,
    tree: &mut Tree,
    layout: Layout<'_>,
    renderer: &Renderer,
    operation: &mut dyn Operation,
) {
    operation.container(None, layout.bounds());
    operation.traverse(&mut |operation| {
        self.children
            .iter_mut()
            .zip(&mut tree.children)
            .zip(layout.children())
            .for_each(|((child, state), layout)| {
                child
                    .as_widget_mut()
                    .operate(state, layout, renderer, operation);
            });
    });
}
```

That forwarding is exactly why custom widgets nested inside plain `column!`/`row!` are still reachable by operations.

### `Shell` — how widgets talk back

Widgets never mutate your state. They write into a `Shell`, which the runtime drains:

- `publish(message)` — emit a `Message`
- `capture_event()` — stop the event from bubbling further
- `request_redraw()` — ask for another frame
- `request_redraw_at(instant)` — schedule one

## Composition

`Element` is a newtype over a boxed `Widget`, which is what makes heterogeneous trees possible:

```rust
// core/src/element.rs (29-32)
pub fn new(widget: impl Widget<Message, Theme, Renderer> + 'a) -> Self
```

Two conveniences make components ergonomic:

1. **`From` impls** let every widget `.into()` into an `Element`. There is even one for `Option<T>`, so `column![maybe, some]` accepts optional children.
2. **`Element::map`** retags a subtree's message type, so a component can have a private `Message` enum and still be embedded in a parent that knows nothing about it:

```rust
// core/src/element.rs (189-192)
pub fn map<B>(
    self,
    f: impl Fn(Message) -> B + 'a,
) -> Element<'a, B, Theme, Renderer>
```

There is also `Element::explain(color)`, which overlays layout boxes when drawn. It is the fastest way to debug a layout that isn't doing what you expect.

## Layout

Layout is **top-down, single-pass, and constraint-based**. A parent hands each child a `Limits` value — a min/max box — and the child answers with a `Node` describing what it chose:

- `Limits` carries `min`, `max`, and a `compression` flag.
- `Node` is the resolved result: a `Size` plus a cursor over children.
- `Layout` is the read side handed back to `update`/`draw`, giving you `bounds()` and `children()`.

Children are free to ignore the max and overflow (that is what `compression` is for), which is why text can spill outside a box.

### `column` and `row` really are flex containers

This is worth stating plainly because it is commonly assumed otherwise. `Column::layout` delegates to a shared flex solver inherited from the Druid codebase:

```rust
// widget/src/column.rs (222-238)
fn layout(
    &mut self,
    tree: &mut Tree,
    renderer: &Renderer,
    limits: &layout::Limits,
) -> layout::Node {
    let limits = limits.max_width(self.max_width);

    layout::flex::resolve(
        layout::flex::Axis::Vertical,
        renderer,
        &limits,
        self.width,
        self.height,
        self.padding,
        self.spacing,
        self.align,
        &mut self.children,
        &mut tree.children,
    )
}
```

`row!` calls the same function with `Axis::Horizontal`. The algorithm runs in up to four passes:

1. **First pass** — lay out every child that is _not_ fluid along the main axis, subtracting its size from the available space and growing the cross-axis extent.
2. **Second pass** (conditional) — if the cross axis must be compressed _and_ some children are fluid along it, lay out the fixed-main-axis ones so the fluid ones learn the resulting cross size.
3. **Third pass** — distribute the leftover main-axis space across children that _are_ fluid, in proportion to their fill factors:

   ```rust
   let max_main = remaining * fill_main_factor / fill_main_sum;
   ```

   A child with `FillPortion(2.0)` gets twice what `FillPortion(1.0)` gets. If the sum is zero, the child is given `f32::INFINITY`, i.e. unbounded.

4. **Fourth pass** (conditional) — finish the deferred cross-axis-compressed children using the cross size discovered in pass three.

The cross axis is then aligned according to the container's `align_x`/`align_y`, and the whole thing is padded.

So the familiar flexbox behaviours _do_ exist: `Fill` and `FillPortion` distribute space, `Shrink` hugs content, and `Fixed` is exact. What does **not** exist is per-child control — there is no `align_self`, no `flex_basis`, no `margin`, no `order`, and no `justify_content` beyond the single cross-axis alignment enum.

::: warning Asymmetric sizing APIs
`Column` exposes `max_width` but not `max_height`; `Row` exposes neither. This falls out of the shared solver: a single `max_width` clamp is applied before resolving, and the cross axis is handled by the pass structure instead.
:::

## The frame loop

Roughly, once per frame:

1. Call your `view()` to build a fresh `Element` tree.
2. `diff` it against the retained `Tree`, matching by `tag()` and `Id`, discarding or carrying over state.
3. Run `layout()` top-down to produce `Node`s.
4. Translate platform events into `Event`s and push them through `update()` from the root down. Layout widgets forward to children first; a widget that calls `capture_event()` stops the propagation.
5. Drain the `Shell` for published `Message`s, and collect any `Task`s your `update` returned.
6. Re-render if anything changed.

Animation rides on this loop rather than replacing it. `Animation::go(new_state, at: Instant)` schedules a state change, and the runtime keeps requesting frames while `is_animating(at)` returns true.

## What this means in practice

- **`view()` runs on every state change.** Keep it cheap. Do computation in `update` and store the result.
- **There is no lifecycle hook.** No `on_mount`, no `use_effect`. Effects are `Task`s returned from `update`, or `Subscription`s for long-lived streams.
- **Widget position is identity.** Conditional widgets can shift and drop state. Give stateful widgets stable `id`s, or use `keyed_column!` for lists.
