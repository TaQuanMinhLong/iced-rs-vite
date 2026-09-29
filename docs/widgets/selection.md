# Selection Controls

Widgets for choosing a value: booleans, one-of-many, a number in a range, and progress.

## Booleans

Three widgets cover on/off. All of them report through a **function**, not a bare message, because they must tell you the new value.

### `Checkbox` and `Toggler`

```rust
toggler(is_enabled)
    .label("Enable notifications")
    .on_toggle(|enabled| if enabled { Message::On } else { Message::Off })
```

That makes the pattern slightly awkward when you already store a `bool`. Two options:

```rust
// 1. pass the value through
Message::Toggled(bool) => self.enabled = enabled,

// 2. map to intent
.on_toggle(move |enabled| if enabled { Message::TurnOn } else { Message::TurnOff })
```

`on_toggle_maybe(Option<f>)` disables the control when `None`, which is how you render a read-only row.

`Toggler` is the switch; `Checkbox` is the box. Both take `label`, `size`, `width`, `spacing`, `text_size`, `text_line_height`, `text_wrapping`, `font`, `style`, and `class`. `Toggler` additionally has `text_alignment`; `Checkbox` has `icon` for a custom check glyph.

| Method                           | Applies to | What it does                                |
| -------------------------------- | ---------- | ------------------------------------------- |
| `label(fragment)`                | both       | Text beside the control                     |
| `on_toggle(f)`                   | both       | `Fn(bool) -> Message`                       |
| `on_toggle_maybe(Option<f>)`     | both       | Disables when `None`                        |
| `size` / `width`                 | both       | Control dimensions                          |
| `text_size` / `text_line_height` | both       | Label typography                            |
| `text_wrapping`                  | both       | How a long label wraps                      |
| `spacing`                        | both       | Gap between control and label               |
| `text_alignment`                 | `Toggler`  | Where the label sits relative to the switch |
| `icon`                           | `Checkbox` | Custom check glyph                          |
| `style` / `class`                | both       | Appearance                                  |

`Checkbox` ships `primary`, `secondary`, `success`, and `danger` styles; `Toggler` ships a `default`.

## One of many

### `Radio`

Radio buttons are **not** grouped by the widget. Grouping is your job, and the constructor makes that explicit by taking the group's shared selection alongside each option's own value:

```rust
for (i, option) in options.iter().enumerate() {
    radio(format!("Option {i}"), i, self.choice, Message::Chose)
}
```

The four arguments are:

| Argument   | Type                        | Purpose                                                               |
| ---------- | --------------------------- | --------------------------------------------------------------------- |
| `label`    | `impl Into<String>`         | The visible text                                                      |
| `value`    | `V`                         | This option's own value                                               |
| `selected` | `Option<V>`                 | The **group's** current selection, shared by every radio in the group |
| `on_click` | `impl FnOnce(V) -> Message` | Receives _this_ option's `value` when clicked                         |

So the widget works out whether it is selected by comparing `value` against `selected`, and hands you the value back on click. `V` must be `Copy + Eq`, and the message must be `Clone`.

The useful consequence is that you do not need a closure per row — one `Message::Chose` function works for the whole group, and the value is carried in the message:

```rust
enum Message {
    Chose(usize),
}
```

Compare this with `Toggler` and `Checkbox`, whose handlers take a `bool` because a single boolean has no identity to pass back. A radio's option _does_ have identity, so the widget passes it along.

| Method                           | What it does                    |
| -------------------------------- | ------------------------------- |
| `size`                           | Diameter of the radio dot       |
| `width`                          | Total width including the label |
| `spacing`                        | Gap between dot and label       |
| `text_size` / `text_line_height` | Label typography                |
| `text_wrapping`                  | Label wrapping                  |
| `font`                           | Label font                      |
| `style` / `class`                | Appearance, keyed on `Status`   |

### `PickList`

A dropdown for a fixed set of options.

```rust
pick_list(options, self.selected, Message::Selected)
```

The three arguments are the option slice, the current selection, and the message to publish on change. Options must be `Clone + PartialEq + Display` — the widget displays them with `Display` and compares them for selection.

| Method                                    | What it does                                        |
| ----------------------------------------- | --------------------------------------------------- |
| `placeholder(str)`                        | Text when nothing is selected                       |
| `width`                                   | Box width                                           |
| `menu_height`                             | Height of the opened menu — set this for long lists |
| `text_size` / `text_line_height` / `font` | Typography of both the field and the menu           |
| `padding`                                 | Inner padding                                       |
| `handle(Handle)`                          | The indicator arrow                                 |
| `on_open` / `on_close`                    | Messages when the menu opens or closes              |
| `style` / `class`                         | The closed field                                    |
| `menu_style` / `menu_class`               | The opened menu, styled separately                  |

`Handle` controls the indicator: `Arrow` (the default ▼), `Static` (one glyph), `Dynamic` (different glyphs for open and closed — use this for a rotating chevron), or `None` to hide it.

`on_open`/`on_close` are useful for closing a menu when focus moves elsewhere, since the widget has no way to know about outside clicks otherwise.

### `ComboBox`

A **searchable** dropdown, for when the list is long enough that scrolling a menu is awkward. It's a text field plus a menu, which is why it has two style hooks.

```rust
combo_box(&self.options, "Search…", None, Message::Selected)
    .on_input(Message::Input)
    .on_option_hovered(Message::Hovered)
    .menu_style(pick_list::menu::default)
```

The four constructor arguments are the `State<T>` you own, the placeholder text, the current selection, and the handler for a chosen option:

```rust
combo_box(state: &combo_box::State<T>, placeholder: &str, selection: Option<&T>, on_selected: impl Fn(T) -> Message)
```

Note the constructor takes `on_selected`, while the _builder_ method for search text is `on_input`. They are different events: `on_selected` fires when an option is chosen, `on_input` fires as the user types. You attach both.

| Method                                      | What it does                                        |
| ------------------------------------------- | --------------------------------------------------- |
| `on_input(f)`                               | The search text changed                             |
| `on_option_hovered(msg)`                    | Keyboard/mouse navigation moved the highlight       |
| `on_open` / `on_close`                      | Menu lifecycle                                      |
| `width`                                     | Field width                                         |
| `menu_height`                               | Height of the option list                           |
| `padding` / `size` / `line_height` / `font` | Typography and spacing                              |
| `text_shaping(Shaping)`                     | Glyph shaping for the search text                   |
| `icon`                                      | Glyph in the field, same `Icon` type as `TextInput` |
| `input_style` / `input_class`               | The text field                                      |
| `menu_style` / `menu_class`                 | The option list                                     |

The options live in a `combo_box::State<T>` you own. Build it with `State::new(options)` or `State::with_selection(options, selection)`, read it with `options()`, and mutate it with `push(new_option)` or `into_options()`. Keeping the list in your own state is what lets you filter it as the user types.

::: tip Pick between PickList and ComboBox
`PickList` for ≤ ~20 options where scrolling is fine. `ComboBox` when the list exceeds that or needs filtering. `Radio` group when there are ≤ ~5 options and you want them all visible without interaction.

:::

## `Slider` and `VerticalSlider`

A draggable handle over a track, for choosing a number in a range.

```rust
slider(0.0..=100.0, self.volume).on_change(Message::VolumeChanged)
```

### The value flows _in_, not out

This is the opposite of `TextInput`. The slider **reads** your `Option<T>`:

- `Some(value)` — use this value; the widget renders it
- `None` — use the widget's own default (set with `.default(v)`)

The widget publishes a new value continuously while dragging. You store it in state, and on the next `view()` the handle moves.

| Method                    | What it does                                                 |
| ------------------------- | ------------------------------------------------------------ |
| `default(v)`              | Starting value when the state is `None`                      |
| `on_release(msg)`         | Fires **once** when the drag ends                            |
| `step(t)`                 | Snap increment                                               |
| `shift_step(t)`           | Finer increment while Shift is held                          |
| `with_circular_handle(r)` | Draw a round handle instead of the default bar               |
| `width` / `height`        | Track dimensions; `width` is a `Length`, `height` a `Pixels` |
| `style` / `class`         | Appearance, keyed on `Status`                                |

::: tip In 0.14 the handler is `on_change`
Older iced releases called this `on_input`. In 0.14 it is `on_change` only — there is no `on_input` on `Slider`. If you are porting older code, that is the rename to expect.

:::

### Why `on_release` matters

`on_change` fires on every drag step, which for a live preview is what you want. But if the update is expensive — a network call, a shader recompile, a filter rebuild — use `on_release` to fire once at the end instead. Attaching both gives you smooth feedback and a single committed action.

`shift_step` is the standard fine-tune modifier and is what makes a slider usable for precise values.

### Vertical variant

`VerticalSlider` mirrors the API, with `height` taking a `Length` instead of `width`, and `step` taking a bare `T` rather than `impl Into<T>`.

The value type must be convertible to and from `f32` and ordered — `f32`, `i32`, `u8` all work.

## `ProgressBar`

A determinate progress indicator. The value is an `f32` from `0.0` to `1.0`.

| Method            | What it does                            |
| ----------------- | --------------------------------------- |
| `length`          | Length of the track along its long axis |
| `girth`           | Thickness                               |
| `vertical()`      | Orient vertically                       |
| `style` / `class` | Appearance                              |

Styles: `primary`, `secondary`, `success`, `warning`, `danger`.

::: tip The value is clamped for you
`ProgressBar::new` clamps its input to the range in the constructor, so passing `1.5` for a `0.0..=1.0` range saturates at the top rather than overflowing the track. You do not need to clamp in `update`.

:::

There is no indeterminate or spinner variant. For unknown-duration work, animate a value yourself with `Animation`, or cycle a phase in state.

## See also

- [Input Widgets](/widgets/input) — `Button`, `TextInput`, `TextEditor`
- [Keyboard & Pointer Input](/input-keys) — raw key events, modifiers, and focus
- [Theme & Style](/theming) — what a `Status` actually changes visually
