# Data and Containers

Widgets for showing collections of records, and for deferring expensive view construction.

---

## `table`

A grid with a header row, per-column alignment, and separators.

```rust
table(
    columns![
        column("Name", |user: &User| text(&user.name).into()),
        column("Email", |user: &User| text(&user.email).into()),
    ],
    users,
)
```

The constructor takes two arguments: a collection of `Column` definitions, and the rows. Each `Column` is built with a header and a **view function** that turns a row into the cell's contents.

The row type must be `Clone`, because the widget clones each row to feed it to the per-column view functions.

### Table methods

| Method                                      | What it does      |
| ------------------------------------------- | ----------------- |
| `width`                                     | Table width       |
| `padding` / `padding_x` / `padding_y`       | Cell padding      |
| `separator` / `separator_x` / `separator_y` | Gap between cells |

### Column methods

| Method                | What it does                              |
| --------------------- | ----------------------------------------- |
| `width`               | Column width, `Length::Shrink` by default |
| `align_x` / `align_y` | Cell alignment within the column          |

Because a column is a fixed width rather than a flexible one, `table` gives you predictable alignment across rows — which is exactly what a plain `column!` of `row!`s cannot do.

::: warning Not virtualized
`Table` renders every row it is given. A thousand rows means a thousand layouts, every frame it is rebuilt. Wrap it in a `Scrollable` and be honest about the row count, or implement windowing yourself.
:::

---

## `grid`

A simple uniform grid with a fixed or responsive column count.

```rust
grid(items).columns(3).spacing(12)
```

| Method                           | What it does                                                           |
| -------------------------------- | ---------------------------------------------------------------------- |
| `columns(usize)`                 | Fixed number of columns                                                |
| `fluid(max_width)`               | Column count derived from available width, never exceeding `max_width` |
| `width`                          | Overall width                                                          |
| `height(Sizing)`                 | Overall height                                                         |
| `spacing`                        | Gap between cells                                                      |
| `push` / `push_maybe` / `extend` | Add children                                                           |

`push_maybe` takes an `Option` and skips `None`, which makes conditional cells painless.

`Sizing` is either `EvenlyDistribute(Length)` — divide the space evenly among cells — or `AspectRatio(f32)`, built with the `aspect_ratio(width, height)` helper. The latter is what you want for a gallery of uniformly shaped tiles.

::: tip `grid` vs `table`
`grid` is layout: equal cells, no header, no per-cell alignment. `table` is data: a header, consistent column widths, separators. Use `grid` for dashboards and galleries, `table` for records.
:::

---

## `keyed_column`

A `Column` that preserves widget state across list mutations.

The problem it solves is specific and worth understanding. Because `view()` rebuilds the tree and `Tree` nodes are matched by position, inserting an item at the top of a plain `Column` shifts every subsequent child — so every `TextInput` below it loses its cursor and selection, and every `Scrollable` loses its offset.

A keyed column stores an explicit key per child and matches on that instead of position:

```rust
keyed_column(users.iter().map(|user| (user.id, row_for(user))))
```

Each entry is a `(Key, Element)` pair. `Key` must be `Copy + PartialEq`, so `u64` ids or `String` keys both work.

The builder surface matches `Column` — `spacing`, `padding`, `width`, `height`, `max_width`, `align_x` — plus `from_vecs(keys, children)` if you already have the two vectors separately.

::: warning The key must be stable and unique
A key that changes between frames defeats the purpose, and duplicate keys match arbitrarily. Use the record's database id, never the index.
:::

---

## `lazy`

Feature-gated behind `lazy`. Defers building a subtree until something actually needs it.

```rust
lazy(data.clone(), |data: &Data| expensive_view(data))
```

The closure runs only when the widget must be laid out, drawn, or updated. The `Dependency` value — which must be `Hash` — decides whether the cached result is still valid; if the hash changes, the view is rebuilt.

This is the escape hatch for a genuinely expensive subtree that most of the time is off-screen or unchanged. For ordinary list performance, `keyed_column` is the better first choice, because `lazy` still rebuilds when the dependency changes.

::: warning `Component` is gone
The `component()` helper and the `Component` trait were **removed** in 0.14 — there is no `component` module in `iced_widget` at all. If you are porting from 0.13 or earlier, note that components introduced encapsulated state that fought the single-source-of-truth model. Compose in `view()` instead, or write a custom widget.
:::

---

## `sensor`

Generates messages when its content enters or leaves the viewport.

```rust
sensor(thumbnail)
    .on_show(|size| Message::ThumbnailVisible(size))
    .on_hide(Message::ThumbnailHidden)
    .anticipate(200.0)
```

| Method                 | What it does                                          |
| ---------------------- | ----------------------------------------------------- |
| `on_show(f)`           | Content became visible; `f: Fn(Size) -> Message`      |
| `on_hide(msg)`         | Content left the viewport                             |
| `on_resize(f)`         | Content size changed while visible                    |
| `anticipate(distance)` | Fire `on_show` this many pixels _before_ it's visible |
| `delay(Duration)`      | Debounce the notification                             |
| `key` / `key_ref`      | Stable identity so state survives reordering          |

This is the primitive behind lazy image loading and infinite scroll. `anticipate` is the important one: firing slightly early means the load starts before the user sees the gap.

Combine it with `lazy` and you have genuine viewport-driven virtualisation:

```rust
sensor(lazy(item.data.clone(), |data| render(data)))
    .on_show(|_| Message::LoadMore)
```

---

## `tooltip`

A floating label shown on hover.

```rust
tooltip(
    button("Delete"),
    text("Permanently removes this file"),
    Position::Bottom,
)
```

| Method                       | What it does                       |
| ---------------------------- | ---------------------------------- |
| `gap(distance)`              | Distance from the target           |
| `padding`                    | Inner padding                      |
| `delay(Duration)`            | Hover time before showing          |
| `snap_within_viewport(bool)` | Keep the tooltip inside the window |
| `style` / `class`            | Appearance                         |

`snap_within_viewport` matters near window edges, where an unclamped tooltip would be cut off.

`Position` covers `Top`, `Bottom`, `Left`, and `Right`.

---

## `overlay::menu`

A popup menu, used by `PickList` and `ComboBox` internally but usable directly.

```rust
overlay::menu(items, position)
```

| Method                                    | What it does                                 |
| ----------------------------------------- | -------------------------------------------- |
| `width`                                   | Menu width                                   |
| `padding`                                 | Inner padding                                |
| `text_size` / `text_line_height` / `font` | Typography                                   |
| `overlay(bool)`                           | Render above everything rather than in place |

`State` tracks the open item index for keyboard navigation, and the `Catalog` extends `scrollable::Catalog` so menus scroll when they exceed the viewport.

There is no built-in right-click context menu. Attach `mouse_area().on_right_press(..)` yourself and show a `menu` from an overlay.

---

## `rule`

A divider line.

```rust
rule::horizontal(1.0)     // 1px tall, full width
rule::vertical(1.0)       // 1px wide, full height
```

Both take a thickness. The direction comes from which constructor you use, and `.style(f)` / `.class(c)` control the colour. `FillMode` decides whether the rule is centred within the space it occupies.

---

## `themer`

Applies a theme to a subtree, so a region can look different from the app around it.

```rust
themer(Some(MyTheme::dark()), content)
    .text_color(|theme| theme.extended_palette().background.base.color)
    .background(|theme| theme.extended_palette().primary.base.color.into())
```

The theme is the **first** argument and is an `Option<Theme>`; `None` inherits the ambient theme.

Use it for a code preview panel, a branded callout, or any surface that needs its own colour scheme without affecting the rest of the app.

---

## Choosing between them

| Situation                                      | Widget          |
| ---------------------------------------------- | --------------- |
| Records with headers and aligned columns       | `table`         |
| Uniform tiles, a gallery, a dashboard          | `grid`          |
| A list where items get inserted or reordered   | `keyed_column`  |
| A subtree too expensive to build speculatively | `lazy`          |
| Detect visibility for loading or paging        | `sensor`        |
| A hover label                                  | `tooltip`       |
| A popup list of actions                        | `overlay::menu` |
| A visual separator                             | `rule`          |
| A region with its own theme                    | `themer`        |
