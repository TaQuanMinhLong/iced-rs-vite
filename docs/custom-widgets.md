# Custom Widgets

When the built-in set runs out — and it does, since there is no tab bar, tree view, or virtualized list — you implement `Widget` yourself. The `advanced` feature gate exposes the module.

## The minimum viable widget

Five methods are required. The rest have defaults.

```rust
use iced::advanced::Widget;
use iced::{Element, Layout, Rectangle, Size, Length, mouse, renderer};
use iced::advanced::layout;
use iced::advanced::widget::tree;

struct MyWidget {
    content: String,
}

impl<Message, Theme, Renderer> Widget<Message, Theme, Renderer> for MyWidget
where
    Renderer: renderer::Geometry,
{
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<MyWidget>()
    }

    fn state(&self) -> tree::State {
        tree::State::None
    }

    fn size(&self) -> Size<Length> {
        Size { width: Length::Shrink, height: Length::Shrink }
    }

    fn layout(
        &mut self,
        _tree: &mut tree::Tree,
        _renderer: &Renderer,
        _limits: &layout::Limits,
    ) -> layout::Node {
        layout::Node::default()
    }

    fn draw(
        &self,
        _tree: &tree::Tree,
        _renderer: &mut Renderer,
        _theme: &Theme,
        _style: &renderer::Style,
        _layout: Layout<'_>,
        _cursor: mouse::Cursor,
        _viewport: &Rectangle,
    ) {
    }
}
```

Wrapping it in an `Element` makes it usable like any built-in:

```rust
fn view(&self) -> Element<'_, Message> {
    Element::new(MyWidget { content: "hello".into() })
}
```

::: warning `tag` defines state identity
`tree::Tag::of::<MyWidget>()` is what lets the runtime decide whether to reuse a `Tree` node. If your widget holds internal state, make the tag discriminate on the state type so different variants don't inherit each other's state.
:::

## The methods that matter

| Method              | Default              | When you need it                                    |
| ------------------- | -------------------- | --------------------------------------------------- |
| `tag`               | required             | Always — it defines state identity                  |
| `state`             | required             | Always — declare your internal state type           |
| `size`              | required             | Always                                              |
| `layout`            | required             | Always                                              |
| `draw`              | required             | Always                                              |
| `size_hint`         | falls back to `size` | When a container should size around you differently |
| `children`          | empty                | If you wrap other widgets                           |
| `diff`              | diffs children       | If your child list changed shape                    |
| `operate`           | no-op                | To intercept focus or other operations              |
| `update`            | no-op                | To handle events and publish messages               |
| `mouse_interaction` | default              | To change the cursor over your area                 |
| `overlay`           | `None`               | To draw a popup above everything                    |

### Handling events

`update` is where a widget responds. To publish a message, use the `Shell`:

```rust
fn update(
    &mut self,
    _tree: &mut tree::Tree,
    event: &Event,
    layout: Layout<'_>,
    cursor: mouse::Cursor,
    _renderer: &Renderer,
    _clipboard: &mut dyn Clipboard,
    shell: &mut Shell<'_, Message>,
    _viewport: &Rectangle,
) {
    if let Event::Mouse(mouse::Event::ButtonPressed { button, .. }) = event {
        if layout.bounds().contains(cursor.position) && *button == mouse::Button::Left {
            shell.publish(MyMessage::Clicked);
        }
    }
}
```

Calling `shell.capture_event()` stops the event from reaching widgets underneath.

### Drawing

`draw` receives everything it needs. The common pattern is to delegate to a helper:

```rust
fn draw(&self, _tree: &tree::Tree, renderer: &mut Renderer, theme: &Theme,
        style: &renderer::Style, layout: Layout<'_>, cursor: mouse::Cursor,
        viewport: &Rectangle) {
    renderer.with_translation(layout.bounds().position(), |renderer| {
        container(self.content.clone())
            .width(Length::Fill)
            .draw(renderer, theme, style, Layout::default(), cursor, viewport);
    });
}
```

Wrapping the drawing in `with_translation` moves the coordinate origin to your widget's top-left, so you can draw in local coordinates.

## Layout

`layout` receives `Limits` — the min/max box the parent permits — and returns a `Node`. The `layout` module has helpers for the common cases:

| Helper                                                  | Use                                            |
| ------------------------------------------------------- | ---------------------------------------------- |
| `layout::atomic(limits, width, height)`                 | A leaf occupying exactly its stated size       |
| `layout::sized(size, node)`                             | Force a child's resolved size                  |
| `layout::contained(limits, node)`                       | Fit a child inside limits                      |
| `layout::padded(padding, node)`                         | Inset a node                                   |
| `layout::positioned(node, position)`                    | Move a resolved node                           |
| `layout::next_to_each_other(node_a, node_b, direction)` | Place two nodes side by side                   |
| `layout::flex::resolve(...)`                            | The full flex algorithm `Column` and `Row` use |

`layout::flex::resolve` is worth knowing about: if your widget arranges children along an axis with fill distribution, you can reuse the same solver the built-ins use rather than reinventing it.

## Internal state

If your widget needs to remember something between frames, store it in the `Tree`:

```rust
#[derive(Default)]
struct MyState {
    is_hovered: bool,
    clicks: usize,
}

fn state(&self) -> tree::State {
    tree::State::new(MyState::default())
}
```

Then downcast in `update` or `draw`:

```rust
let state = tree.state.downcast_mut::<MyState>();
```

This state is **not** your application state. It is scratch space for interaction bookkeeping. Anything the rest of your app cares about must become a `Message`.

::: warning Downcasting panics on a mismatch
`downcast_mut` assumes the `Tree` holds your type. That holds when `tag()` is correct, which is why getting the tag right is not optional.
:::

## Operations

`operate` runs before events, letting an ancestor push an instruction down the tree. This is how `TextInput` gets focused: the runtime issues an `Operation`, and every container forwards it to children until one claims it.

If you wrap other widgets, forward operations too, or focus will stop working inside you:

```rust
fn operate(&mut self, tree: &mut tree::Tree, layout: Layout<'_>,
           renderer: &Renderer, operation: &mut dyn Operation) {
    operation.container(Some(&self.id), layout.bounds());
    operation.traverse(&mut |operation| { /* forward to children */ });
}
```

`operation.container(id, bounds)` registers your widget with the focus system, and giving it a stable `Id` is what lets you focus it later.

## Overlays

To draw something above the entire UI — a dropdown, a tooltip, a context menu — return an `Overlay` from the `overlay` method. The runtime renders it in a separate pass after the main tree, so it isn't clipped or occluded.

## When not to write a widget

Before implementing `Widget`, check whether you can get there by composing:

| Want             | Compose instead                                               |
| ---------------- | ------------------------------------------------------------- |
| Tabs             | a `row!` of `button`s plus a conditional body in `view`       |
| Accordion        | a `button` toggling a `Column` in `view`                      |
| Modal            | `stack!` with an `opaque` backdrop and a centred `Container`  |
| Virtualized list | `keyed_column` in a `Scrollable`, driven by `sensor`          |
| Tree view        | recursive `Column` with a `button` for expansion              |
| Date picker      | `pick_list` cascading to day, or `canvas` for a real calendar |
| Context menu     | `mouse_area().on_right_press(..)` plus an `overlay::menu`     |

A widget is the right answer when the logic genuinely needs to own state across frames, or needs to intercept the event stream. Otherwise, `view()` composition is simpler and easier to reason about.

---

## See also

- [Architecture](/architecture) — the full `Widget` trait and the frame loop
- [Data & Containers](/widgets/data) — `lazy` and `sensor` before you write your own
- [Theme & Style](/theming) — implementing `Catalog` for a custom theme type
