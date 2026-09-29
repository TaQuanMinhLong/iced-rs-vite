# Builder Patterns & Chaining

Every widget in iced is built the same way: construct it, then call builder methods that take `self` by value and give it back. This one page explains the shape shared by every widget API in the reference.

## The pattern

Three steps, always in this order:

1. **Construct** with a free function. Constructors are free functions in `iced::widget` that return a **concrete** widget struct — not an `Element`.
2. **Configure** with builder methods that consume `self` and return it, so calls chain.
3. **Convert** with `.into()` to erase the concrete type into `Element<'a, Message>`.

```rust
use iced::widget::{button, text};
use iced::{Element, Length};

let save: Element<()> = button("Save")
    .width(Length::Fill)
    .padding(12)
    .into();
```

There is no `Button::new()` in application code — `button("Save")` is the constructor, and it returns a `Button`, not an `Element`.

## Why the types work out

The reason chaining is ergonomic is that constructors and methods both stay generic over `Message`, `Theme`, and `Renderer`, and `.into()` is where erasure happens. You rarely write those parameters out because inference fills them in from `view()`'s return type.

`Element` itself has a deliberately tiny surface. In 0.14 it exposes three methods you will actually use:

| Method           | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `new(widget)`    | Wrap any `Widget` into an `Element`                           |
| `map(message)`   | Rewrite an `Element`'s message type when composing components |
| `explain(color)` | Debug aid — tints this subtree to show nesting                |

There are also `as_widget` and `as_widget_mut`, which hand back the boxed `Widget` behind the element. They exist for custom-widget and testing code; ordinary application code never needs them.

So the builder methods you chain are **inherent methods on the concrete widget**, not on `Element`. `.padding(12)` is `Button::padding`, not `Element::padding`. That is why `Element` can stay so small while widgets are so configurable.

::: tip `map` is the composition tool
Because a component returns `Element<'a, ComponentMessage>`, the parent converts it with `.map(Message::Component)`. This is what lets screens stay ignorant of the root message type — see [Structuring Larger Apps](/scaling).

:::

## Methods that recur across widgets

These are the methods that appear on many widgets. **None of them is universal** — check the widget's page for what it actually has.

| Method                | On which widgets                               | Typical use                 |
| --------------------- | ---------------------------------------------- | --------------------------- |
| `width`               | most layout and container widgets (31 uses)    | `.width(Length::Fill)`      |
| `height`              | most layout and container widgets (21 uses)    | `.height(40)`               |
| `style`               | nearly every visual widget (21 uses)           | `.style(\|t, status\| ...)` |
| `class`               | nearly every visual widget (21 uses)           | `.class("danger")`          |
| `padding`             | `container`, `column`, `row`, `button`, `text` | `.padding(12)`              |
| `spacing`             | `column`, `row`, `grid`                        | gap between children        |
| `align_x` / `align_y` | `column`, `row`, `container`                   | cross-axis alignment        |
| `max_width`           | `container`, `column`, `row`                   | cap the shrink-to-fit size  |
| `clip`                | `container`, `column`, `row`, `button`         | clip children to bounds     |

The counts are occurrences across `iced_widget-0.14.2/src/`, not per-widget guarantees.

### Numeric arguments are flexible

Sizing and spacing methods take `impl Into<Length>` or `impl Into<Padding>`, which is why these all compile:

```rust
container(content)
    .width(320)              // u32 -> Length::Fixed
    .height(100.0)           // f32 -> Length::Fixed
    .padding(12)             // u16 -> Padding (all sides)
    .padding([8, 16])        // [u16; 2] -> vertical, horizontal
```

## `Container` and `Column` are not the same

A frequent source of confusion — these are different widgets with overlapping methods:

- `container` **wraps a single child** and adds padding, alignment, clipping, and decoration.
- `column` / `row` **hold many children** and add `spacing` and cross-axis alignment.

```rust
// column.rs (94-135) — spacing, push, align_x, clip
column![header, body, footer]
    .spacing(12)
    .padding(16)
    .align_x(alignment::Center)

// container.rs (109-224) — no spacing; adds alignment + decoration
container(text("Card"))
    .padding(16)
    .width(Length::Fixed(320.0))
    .class("card")
```

Reaching for `spacing` on a `container` is a compile error, not a silent no-op.

## Building collections

`column` and `row` collect children through `push`, `extend`, or the macro forms. `push` returns `Self` so it chains too:

```rust
// column.rs (140-155)
let mut list = column![].spacing(8);
for item in items {
    list = list.push(text(item));
}
```

::: tip `push` and void widgets
`Column::push` calls `size_hint()` and **skips** any child whose size hint is void. A widget with a void hint — a `Space` with no fill, for instance — may be dropped from a collection. Use `row!`/`column!` macro forms or check the widget's sizing if children go missing.

:::

## A footgun: most builder methods are not `#[must_use]`

Forgetting to use the result of a builder method is usually a silent no-op, not a compile error. The attributes are applied inconsistently — in `button.rs`, 19 public methods carry only **two** `#[must_use]` attributes, on `style` and `class`:

```rust
// button.rs (183-195) — only these two are marked
#[must_use]
pub fn style(mut self, style: impl Fn(&Theme, Status) -> Style + 'a) -> Self

#[must_use]
pub fn class(mut self, class: impl Into<Theme::Class<'a>>) -> Self
```

So `button("Save").width(100);` compiles and discards the whole button, while `.style(..)` on its own warns. Treat the return value as mandatory by convention.

## Where to look up a specific widget

Every widget page in this reference lists its builder methods as a table with a note on what each one does. Start from [All Widgets (A–Z)](/widgets/).

## See also

- [All Widgets (A–Z)](/widgets/) — the full inventory
- [Layout](/widgets/layout) — `container`, `column`, `row`, `scrollable`
- [Theme & Style](/theming) — the `style` and `class` methods in depth
- [Custom Widgets](/custom-widgets) — implementing `Widget` yourself
