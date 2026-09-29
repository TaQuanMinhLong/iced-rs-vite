# Layout Widgets

## Sizing with `Length`

Every widget reports a desired size as a `Length`:

| Value              | Behaviour                                  |
| ------------------ | ------------------------------------------ |
| `Shrink`           | Hug whatever the content needs             |
| `Fixed(Pixels)`    | Exactly this size                          |
| `Fill`             | Take all remaining space on that axis      |
| `FillPortion(f32)` | Take a proportional share of the remainder |

The key thing to internalise: `Fill` only means something when the **parent** has space to give. A `Column` whose own height is `Shrink` has nothing to distribute, so `Fill` children inside it collapse to their content size.

## Alignment

Two enums describe the **cross axis** of a container — the axis a container does _not_ flow along:

- `alignment::Horizontal` — `Left`, `Center`, `Right`
- `alignment::Vertical` — `Top`, `Center`, `Bottom`

So `align_x` on a `Column` positions children left/centre/right, and `align_y` on a `Row` positions them top/centre/bottom. Alignment does **not** distribute the main axis; that's exclusively what `Fill` and `FillPortion` do.

---

## `Column` and `Row`

The two workhorse layout widgets. Both delegate to the same flex solver, differing only in which axis they flow along.

### How the flex solver works

Both delegate to one solver, which runs in up to four passes: measure the non-fluid children, then (if the cross axis is compressed) lay out the fixed ones so the fluid ones learn that size, then distribute the leftover main-axis space by fill factor, then finish the deferred children.

`FillPortion(2.0)` receives twice what `FillPortion(1.0)` gets. The full pass-by-pass breakdown is in [Architecture](/architecture#layout).

The practical consequences:

- `Fill` children **share** space; they don't stack.
- A child with `Fixed` main size is measured first, so it always wins over `Fill` siblings.
- The cross axis sizes to the largest child, unless something forces compression.

### Methods

| Method             | `Column` | `Row` | What it does                       |
| ------------------ | :------: | :---: | ---------------------------------- |
| `spacing`          |    ✅    |  ✅   | Gap between children               |
| `padding`          |    ✅    |  ✅   | Inset around the whole group       |
| `width` / `height` |    ✅    |  ✅   | Set the container's own size       |
| `align_x`          |    ✅    |   —   | Cross-axis alignment (horizontal)  |
| `align_y`          |    —     |  ✅   | Cross-axis alignment (vertical)    |
| `max_width`        |    ✅    |   —   | Clamp the container's width        |
| `clip`             |    ✅    |  ✅   | Clip children to the container box |
| `push` / `extend`  |    ✅    |  ✅   | Add children                       |
| `wrap()`           |    ✅    |  ✅   | Return a line-breaking variant     |

The asymmetry is real: `Column` has `max_width` but no `max_height`, and `Row` has neither. The shared solver applies a single `max_width` clamp up front and handles the cross axis through its pass structure instead.

### Distributing space

```rust
// sidebar takes a third, content takes two thirds
row![
    sidebar().width(FillPortion(1.0)),
    content().width(FillPortion(2.0)),
]
```

```rust
// push a button to the trailing edge
row![
    text("Settings"),
    Space::new(Fill, Shrink),
    button("Save"),
]
```

### Wrapping

`.wrap()` returns a `Wrapping` widget that breaks children onto multiple lines, keeping each line aligned by the original container's setting. It exposes only `horizontal_spacing` and an alignment method.

::: warning `Wrapping`'s alignment method is confusingly named
The method is called `align_x` but takes an `alignment::Vertical` — once the column wraps, the original main axis becomes the cross axis, so vertical is what you actually want. The source names the parameter `align_y` internally. It's a naming wart, but it will surprise you if you pass a `Horizontal`.
:::

---

## `Container`

The most-used widget in practice, because it collapses sizing, padding, alignment, and decoration into a single node. Nearly every "card", "panel", or "dialog" is a `Container`.

### Methods

| Method                       | What it does                                             |
| ---------------------------- | -------------------------------------------------------- |
| `padding`                    | Inset between the border and the child                   |
| `width` / `height`           | Explicit size                                            |
| `max_width` / `max_height`   | Clamp the size                                           |
| `center(length)`             | Set size **and** centre the child on both axes           |
| `center_x(width)`            | Set width **and** centre horizontally                    |
| `center_y(height)`           | Set height **and** centre vertically                     |
| `align_left` / `align_right` | Set width and pin to one side                            |
| `align_top` / `align_bottom` | Set height and pin to one edge                           |
| `align_x` / `align_y`        | Set size and alignment independently                     |
| `clip(bool)`                 | Clip the child — essential before scrolling or shadowing |
| `style(f)` / `class(c)`      | Decoration                                               |
| `id(id)`                     | Stable identity                                          |

The `center_*` and `align_*` methods each set **both** a size and an alignment in one call, which is why `container(x).center_x(Fill)` is the idiomatic way to centre something. Using `align_x(Center)` alone would centre the child within whatever space the container happens to get, which is often zero.

### Decoration

`Container`'s `Style` is a plain struct you build with four setters:

| Setter       | What it sets                         |
| ------------ | ------------------------------------ |
| `background` | Fill colour or gradient              |
| `border`     | Colour, width, and per-corner radius |
| `shadow`     | Offset, blur radius, and colour      |
| `color`      | Text colour inherited by the child   |

Because `Border` supports per-corner radii, rounded corners of differing size on each corner are a single call:

```rust
Border {
    color: color,
    width: 1.0,
    radius: Radius {
        top_left: 8.0, top_right: 0.0, bottom_right: 8.0, bottom_left: 0.0,
    },
}
```

### Clip before you scroll

`clip(true)` isn't cosmetic — it establishes a clipping rectangle. Without it, a `Scrollable` inside a `Container` lets its scrollbar and overflowing content bleed past the container's edges.

---

## `Stack`

Overlays children in one shared box, painted in insertion order. Later children draw on top.

| Method             | What it does                                |
| ------------------ | ------------------------------------------- |
| `push`             | Add a child on top                          |
| `push_under`       | Add a child behind everything already added |
| `extend`           | Add many children                           |
| `width` / `height` | Size of the shared box                      |
| `clip(bool)`       | Clip to the box                             |

There is **no alignment method**. Every child fills the same box and positions itself with its own alignment, so to pin one to an edge you wrap it in a `Container`:

```rust
stack![
    avatar(),
    container(badge).align_top(Shrink).align_right(Shrink),
]
```

`push_under` is what makes `Stack` good for modals: the backdrop goes underneath, the dialog on top, and wrapping the backdrop in `opaque` stops clicks reaching the content below.

---

## `Pin`

A stack whose single child is offset by an absolute amount:

| Method             | What it does             |
| ------------------ | ------------------------ |
| `position(Point)`  | Set both axes at once    |
| `x(Pixels)`        | Horizontal offset        |
| `y(Pixels)`        | Vertical offset          |
| `width` / `height` | Size of the pinned child |

`position` setting both axes together is the main reason to prefer `Pin` over hand-placing a child with alignment — you express the offset directly instead of inferring it from the parent's size.

---

## `Space`

An empty elastic box — the spacer primitive.

| Method   | What it does                          |
| -------- | ------------------------------------- |
| `width`  | The space's width, commonly `Fill`    |
| `height` | The space's height, commonly `Shrink` |

A `Space` with `Fill` on one axis inside a `row!` is exactly CSS `flex-grow: 1`. It's the cleanest way to push siblings apart, because it does it with layout rather than with alignment tricks.

There is no `horizontal()` or `vertical()` constructor and `Space::new()` takes no arguments. You size a space with its builder:

```rust
// push two siblings apart on the main axis
row![
    text("Settings"),
    Space::new().width(Fill),
    button("Save"),
]
```

`space()` in `helpers.rs` is a free function wrapping the same zero-sized default, so `space()` and `Space::new()` are interchangeable.

---

## `Scrollable`

Wraps content in a viewport and manages an offset.

| Method                                                          | What it does                                       |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `direction`                                                     | Which axes scroll                                  |
| `horizontal()`                                                  | Shorthand for a horizontal-only scroller           |
| `width` / `height`                                              | Viewport size                                      |
| `id`                                                            | Stable identity when you have several              |
| `anchor_top` / `anchor_bottom` / `anchor_left` / `anchor_right` | Where content rests when smaller than the viewport |
| `anchor_x` / `anchor_y`                                         | The same, as alignment values                      |
| `on_scroll(f)`                                                  | Receive a `Viewport` on every scroll               |
| `spacing`                                                       | Gap between scrollable children                    |
| `auto_scroll(bool)`                                             | Whether to re-anchor on content resize             |
| `style` / `class`                                               | Scrollbar appearance                               |

### Anchors

Anchors control where content sits when it's _smaller_ than the viewport. `anchor_bottom` is the important one: it gives you a chat log that grows upward from the bottom, which is otherwise awkward to build.

### `auto_scroll`

When enabled (the default), the scroller re-anchors itself as content changes size. This is usually what you want for a log, but it causes a "jump" if you load items asynchronously — set `auto_scroll(false)` and manage the offset yourself if that's a problem.

### `on_scroll` and the `Viewport`

The callback receives a `Viewport` exposing `bounds`, `content_bounds`, `relative_offset`, and `absolute_offset`. Comparing the offset against the content bounds is how infinite scroll is implemented: when `content_bounds` is nearly reached, emit a message to fetch more.

### Scrollbar geometry

The scrollbar is a separate type with its own sizing, which is why scrollbar styling is configured apart from the scroller:

| Method           | What it does                      |
| ---------------- | --------------------------------- |
| `hidden()`       | No scrollbar at all               |
| `width`          | Thickness of the bar              |
| `scroller_width` | Thickness of the draggable thumb  |
| `margin`         | Gap between bar and viewport edge |
| `anchor`         | Which side it sits on             |
| `spacing`        | Gap between bar and content       |

---

## `PaneGrid`

A grid of resizable, draggable panes — the basis of an IDE-style split layout.

The split structure is plain data you own: a `pane_grid::State` paired with a `Split` tree in your application state. Because it's just data, layouts can be serialised and reproduced exactly.

| Method                 | What it does                                                 |
| ---------------------- | ------------------------------------------------------------ |
| `spacing`              | Gap between panes                                            |
| `min_size`             | Smallest a pane may be dragged to                            |
| `width` / `height`     | Overall size                                                 |
| `on_click(f)`          | A pane was clicked                                           |
| `on_drag(f)`           | A divider is being dragged; gives a `DragEvent`              |
| `on_resize(leeway, f)` | A pane was resized; gives a `ResizeEvent` with a `Direction` |
| `style` / `class`      | Pane and divider appearance                                  |

`min_size` is what stops a user from dragging a pane down to zero width and losing it.

---

## `Responsive`

Rebuilds its subtree when the available size changes.

```rust
responsive(|size| {
    if size.width < 600.0 { mobile() } else { desktop() }
})
```

The closure runs during **layout**, not `view()`, so it branches on the actual resolved size rather than a guess. That makes it more reliable than reading a window dimension from state.

Keep the closure cheap — it runs on every layout pass at that size.

---

## `Float`

Scales and translates a single child in place.

| Method            | What it does         |
| ----------------- | -------------------- |
| `scale(f32)`      | Uniform scale factor |
| `translate(...)`  | Offset               |
| `style` / `class` | Appearance           |

Useful for zoom effects and pop-in animations when combined with `Animation`.

---

## Choosing between them

| Situation                                  | Widget                    |
| ------------------------------------------ | ------------------------- |
| Sequential content, vertical or horizontal | `Column` / `Row`          |
| Overlapping visuals, badge on avatar       | `Stack`                   |
| Offset a child at known coordinates        | `Pin`                     |
| Region larger than its content             | `Scrollable`              |
| Elastic gap between siblings               | `Space` or `Length::Fill` |
| Padded, decorated box                      | `Container`               |
| User-resizable IDE-style split             | `PaneGrid`                |
| Branch on available size                   | `Responsive`              |

---

## See also

- [All Widgets](/widgets/) — the full inventory
- [Graphics & Media](/widgets/graphics) — `canvas` for anything layout cannot express
- [Quick Start](/quick-start) — the basics of `column!` and `row!`
