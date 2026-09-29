# Input Widgets

Every interactive widget follows the same contract: it keeps its own internal state (hovered, focused, being dragged), and when something meaningful happens it **publishes a `Message`** instead of mutating yours. The `Status` value handed to your style function is how you render those internal states.

The recurring pattern across all of them:

- Handlers are named `on_*` and take a message or a function producing one.
- There is no `enabled(bool)`. A widget is enabled exactly when it has a handler.
- The `_maybe` variant of each handler takes an `Option`, which is how you disable conditionally.
- Styling is a closure `Fn(&Theme, Status) -> Style`, or a `class` resolved through the theme.

This page covers text entry and raw pointer handling. Switches, dropdowns, sliders, and progress bars are in [Selection Controls](/widgets/selection).

---

## `Button`

The primary click target. It renders any `Element` as its child, so a button can hold a row, an icon, or a whole layout.

### Enabling and disabling

There is no `enabled` flag. A button is interactive **iff** it has an `on_press` handler — the widget reports `Status::Disabled` when it doesn't, and your style function can render that differently.

```rust
// interactive
button("Save").on_press(Message::Save)

// not interactive — no handler, so no clicks are published
button("Saving…")

// conditional, the idiomatic form
button("Save").on_press_maybe(if self.valid { Some(Message::Save) } else { None })
```

Use `on_press_maybe` rather than branching in `view()`. It keeps the widget in the tree in both cases, so its `Tree` state survives the toggle instead of being rebuilt.

### Methods

| Method                        | What it does                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `on_press(msg)`               | Publish `msg` on click                                                           |
| `on_press_maybe(Option<msg>)` | Same, but `None` disables the button                                             |
| `on_press_with(f)`            | Publish a message computed from the pointer position and modifiers at press time |
| `width` / `height`            | Set explicit size; defaults to hugging the label                                 |
| `padding`                     | Space between the border and the label                                           |
| `clip(bool)`                  | Clip the child to the button's box — needed if the label overflows               |
| `style(f)`                    | Style as a function of `Status`                                                  |
| `class(c)`                    | Style via a named class from your theme catalog                                  |

`on_press_with` is the escape hatch for the rare case where "what was clicked" matters — a position for a context menu, or modifier keys for an "open in new tab" affordance.

### Statuses

A button is always in exactly one of four states, and the distinction between _hovered_ and _pressed_ is what makes a button feel physical:

| Status     | Meaning                    |
| ---------- | -------------------------- |
| `Active`   | Idle and clickable         |
| `Hovered`  | Pointer is over it         |
| `Pressed`  | Pointer is held down on it |
| `Disabled` | No handler attached        |

Style `Pressed` for a press-down offset or darker fill, and `Hovered` for a subtle lift. Because both are separate from `Active`, a single style function can express a full hover-and-press interaction.

### Built-in styles

iced ships opinionated presets you can pass straight to `.style(...)`: `primary`, `secondary`, `success`, `warning`, `danger`, `text`, `background`, `subtle`. Each has the signature `fn(&Theme, Status) -> Style`, so `.style(button::primary)` works with no closure.

---

## `TextInput`

A single-line editor with full cursor movement, selection, and clipboard support.

### The value flows _out_, not in

This is the most important thing to understand about `TextInput`. The widget **owns the text**. Your state is a mirror, updated on every keystroke:

```rust
enum Message {
    NameChanged(String),
    Submit,
}

fn update(&mut self, message: Message) {
    match message {
        Message::NameChanged(value) => self.name = value,
        Message::Submit => { /* … */ }
    }
}

fn view(&self) -> Element<'_, Message> {
    text_input("Name", &self.name)
        .on_input(Message::NameChanged)
        .on_submit(Message::Submit)
        .into()
}
```

`on_input` hands you the **entire current value** as a `String`, not a delta. This is deliberate: it's what lets you validate, transform, uppercase, or reject input on every keystroke without reimplementing a text editor.

The flip side is that you must not fight it. Don't try to store a substring or reformat the value in a way that moves the cursor — the widget will reset the cursor to the end whenever the text it holds diverges from what it last emitted.

### Methods

| Method                                      | What it does                                                         |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `placeholder(str)`                          | Grey hint shown when empty                                           |
| `value(&str)`                               | Initial content                                                      |
| `on_input(f)`                               | `f: Fn(String) -> Message`, called with the full value on every edit |
| `on_input_maybe(Option<f>)`                 | Makes the field read-only when `None`                                |
| `on_submit(msg)`                            | Publish on Enter                                                     |
| `on_paste(f)`                               | Intercept pasted text — sanitise, transform, or reject it            |
| `secure(bool)`                              | Mask the content, for passwords                                      |
| `id(id)`                                    | Stable identity, so focus and selection survive tree changes         |
| `icon(Icon)`                                | Place a glyph inside the field, left or right                        |
| `font` / `size` / `line_height` / `align_x` | Typography                                                           |
| `width` / `padding`                         | Box sizing                                                           |
| `style(f)` / `class(c)`                     | Appearance, keyed on `Status`                                        |

`on_paste` is the hook for input validation that shouldn't be bypassable — a paste that would exceed a length limit, or that contains characters you disallow.

### Icons inside the field

`Icon` is a font glyph plus placement, not an image:

| Field        | Purpose                           |
| ------------ | --------------------------------- |
| `font`       | Which font to take the glyph from |
| `code_point` | The `char` to render              |
| `size`       | Optional size override            |
| `spacing`    | Gap between icon and text         |
| `side`       | `Left` or `Right`                 |

Since icons are glyphs, you need an icon font loaded — see [Text & Rich Content](/widgets/text). There is no bundled icon set.

### Controlling the cursor programmatically

The widget exposes imperative methods for when a parent must drive it — moving focus after a dialog opens, or selecting all when the user hits a shortcut:

| Method                                            | Effect                        |
| ------------------------------------------------- | ----------------------------- |
| `focus()` / `unfocus()`                           | Move keyboard focus in or out |
| `is_focused()`                                    | Query current focus           |
| `move_cursor_to_front()` / `move_cursor_to_end()` | Jump the caret                |
| `move_cursor_to(pos)`                             | Absolute caret index          |
| `select_all()`                                    | Select the whole value        |
| `select_range(start, end)`                        | Select a span by index        |
| `cursor()`                                        | Current caret position        |

### Statuses

| Status                   | Meaning                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `Active`                 | Editable, not focused                                                 |
| `Hovered`                | Pointer is over it                                                    |
| `Focused { is_hovered }` | Has keyboard focus; the flag says whether the pointer is also over it |
| `Disabled`               | `on_input_maybe(None)`                                                |

`Focused` carries its own `is_hovered` flag so you can show a combined "focused and hovered" appearance, which is common in design systems.

---

## `TextEditor`

A multi-line editor. It uses a different model from `TextInput` because code editing needs more than a value.

### Actions, not values

Instead of streaming text, `TextEditor` emits semantic **`Action`s** — "insert this", "delete selection", "move line up". Your `update` collects them and applies them to a stored `Content`:

```rust
enum Message {
    Editor(Action),
}

struct State {
    content: text_editor::Content,
}

fn update(&mut self, message: Message) {
    match message {
        Message::Editor(action) => self.content.perform(action),
    }
}

fn view(&self) -> Element<'_, Message> {
    text_editor(&self.content)
        .on_action(Message::Editor)
        .height(200)
        .into()
}
```

The document lives in a `text_editor::Content<Renderer>` **in your state**, not in the widget. Build one with `Content::new()`, `Content::with_text("...")`, or `Default::default()`, and pass a reference to `text_editor(&self.content)`.

This indirection is what makes undo, external edits, and programmatic transformations possible. It's also the mechanism behind the `key_binding` method: you can rebind a key to a different `Action` and the widget's own default is bypassed.

### Methods

| Method                                      | What it does                                     |
| ------------------------------------------- | ------------------------------------------------ |
| `placeholder(str)`                          | Hint when empty                                  |
| `id(id)`                                    | Stable identity                                  |
| `on_action(f)`                              | Receive an `Action` for each edit                |
| `height` / `min_height` / `max_height`      | Box sizing; `min`/`max` let it grow with content |
| `width`                                     | Fixed width in pixels                            |
| `wrapping(Wrapping)`                        | `None`, `Word`, or `Character`                   |
| `font` / `size` / `line_height` / `padding` | Typography and spacing                           |
| `highlight_with(h)` / `highlight(lang, h)`  | Attach a syntax highlighter                      |
| `key_binding(binding)`                      | Override the action bound to a key               |
| `style(f)` / `class(c)`                     | Appearance, keyed on `Status`                    |

Note `height` takes a `Length` while `width` takes `Pixels` — an asymmetry in the API, so `width(400)` is unambiguous but height needs `.height(Fill)`.

### Inspecting and transforming the content

The accessors live on `Content`, not on the widget. You call them on your own stored document:

| Method            | Returns                         |
| ----------------- | ------------------------------- |
| `text()`          | The whole content as a `String` |
| `selection()`     | Just the selected text, if any  |
| `line_count()`    | Number of lines                 |
| `line(i)`         | One `Line`                      |
| `lines()`         | Iterator over all lines         |
| `line_ending()`   | The dominant line ending        |
| `is_empty()`      | Whether there's any content     |
| `perform(action)` | Apply an `Action`               |
| `move_to(cursor)` | Set the cursor position         |
| `cursor()`        | Current cursor                  |

The line-level accessors are what make features like "jump to line", "current line highlight", and "line numbers in the gutter" implementable.

### Syntax highlighting

`highlight_with` takes anything implementing `text::Highlighter`, and `iced_highlighter` provides a `Language` type driven by the `highlighter` feature. It is a stateful, line-at-a-time API: `prepare` warms up a grammar, then `highlight_line` tokenises one line at a time.

Highlighting is genuinely expensive. If the document re-renders on every keystroke, cache the editor in your state rather than recreating it in `view()`.

---

## `MouseArea`

Attaches raw pointer events to any widget. This is the foundation for everything iced doesn't ship.

| Method                                            | Fires when                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `on_press(msg)`                                   | Any button goes down over the area                                               |
| `on_release(msg)`                                 | Any button comes up                                                              |
| `on_double_click(msg)`                            | Double click                                                                     |
| `on_right_press(msg)`                             | Right button down                                                                |
| `on_right_release(msg)`                           | Right button up                                                                  |
| `on_middle_press(msg)` / `on_middle_release(msg)` | Middle button                                                                    |
| `on_scroll(f)`                                    | Wheel; `Fn(mouse::ScrollDelta) -> Message`                                       |
| `on_enter(msg)`                                   | Pointer enters the bounds                                                        |
| `on_exit(msg)`                                    | Pointer leaves the bounds                                                        |
| `on_move(f)`                                      | Pointer moves; `Fn(Point) -> Message` gives the position                         |
| `interaction(i)`                                  | Set the cursor icon — `Pointer`, `Grab`, `Grabbing`, `Text`, `Crosshair`, `None` |

`on_move` is what makes drag gestures possible: take `on_press`, record the start position, track `on_move`, and finish on `on_release`.

### Event propagation

By default, an event that a child handles keeps bubbling up to the `MouseArea` as well, so a parent can observe the same click a button already consumed.

```rust
mouse_area(content)
    .on_press(Message::DragStart)
    .on_move(|point| Message::DragMove(point))
    .on_release(Message::DragEnd)
```

::: warning Handlers cannot capture events
Every `MouseArea` handler returns a `Message`, not an `Option<Action<Message>>` — so unlike `canvas::Program::update`, you cannot stop propagation with `Action::capture()` from here. If you need to claim an event, place the interactive widget so no ancestor `MouseArea` overlaps it.

:::

`interaction` is independent of your message handling and just changes the cursor, so set it whenever the area behaves like something grabbable.

---

## `hover` — the swap helper

Not a widget with a builder, but a function that exchanges one subtree for another while the pointer is over it:

```rust
hover(
    button("Hover me").style(button::secondary),
    button("Now hovering").style(button::primary),
)
```

It's the cheapest way to add a hover state to a composed component without writing a style closure, and it composes: the `top` element can itself be a `hover(...)`.

## `opaque` — the event blocker

Wraps content so it swallows every pointer event, making anything beneath unclickable. This is what a modal backdrop needs:

```rust
stack![
    opaque(dark_backdrop).width(Fill).height(Fill),
    container(dialog).center_x(Fill).center_y(Fill),
]
```

## Choosing between them

| Need                                         | Widget                         |
| -------------------------------------------- | ------------------------------ |
| Click action                                 | `Button`                       |
| One-line text entry                          | `TextInput`                    |
| Multi-line or highlighted editing            | `TextEditor`                   |
| Custom gestures, context menus, hover layers | `MouseArea`, `hover`, `opaque` |

For on/off switches, dropdowns, sliders, and progress bars, see [Selection Controls](/widgets/selection).

---

## See also

- [Selection Controls](/widgets/selection) — `Toggler`, `Radio`, `PickList`, `Slider`, `ProgressBar`
- [Keyboard & Pointer Input](/input-keys) — raw key events, modifiers, and focus
- [Theme & Style](/theming) — what a `Status` actually changes visually
- [Quick Start](/quick-start) — if you have not written an iced app yet
