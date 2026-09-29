# Keyboard and Pointer Input

Most widgets handle their own input, but any time you need raw events, a global shortcut, or a custom key handler, you work with the event types directly. Every one arrives inside an `Event` that a widget's `update` method receives.

## `keyboard::Event`

Three variants, and the third is the one people miss:

| Variant | When |
| --- | --- |
| `KeyPressed` | A key goes down |
| `KeyReleased` | A key comes up |
| `ModifiersChanged` | Shift, Ctrl, Alt, or Meta changed state on its own |

Holding Shift produces one `ModifiersChanged` before the `KeyPressed` for the key you then press.

::: tip Prefer `KeyPressed` for actions
Actions belong on press, not release. It feels faster and it matches what the rest of the widget set does.
:::

## `keyboard::Key`

Three shapes, and the distinction matters when you compare keys:

| Variant | Meaning |
| --- | --- |
| `Named(Named)` | A key with a name: `Enter`, `Tab`, `Space`, `Escape`, the arrows, `Home`, `End`, `PageUp`, `PageDown`, `Backspace`, `Delete`, `Insert`, `F1` to `F24`, media keys, and the lock keys |
| `Character(char)` | A single character, already resolved through the active layout |
| `Unidentified` | A key the platform could not name |

`Named` versus `Character` is what catches people out. On a US layout, Shift+2 produces `Key::Character('@')`, not a named key, so comparing against `Named::Digit2` would miss it. Compare against `Character` when you mean "the character the user produced", and `Named` when you mean "that physical key".

```rust
match key {
    Key::Character('s') if modifiers.ctrl() => Some(Message::Save),
    Key::Character('c') if modifiers.ctrl() => Some(Message::Copy),
    Key::Named(Named::Enter)            => Some(Message::Submit),
    _ => None,
}
```

The `if modifiers.ctrl()` guard is the idiomatic form, and it is what makes the same chord work on macOS where the equivalent is Cmd+S.

### Layout-aware comparison

| Method | Returns |
| --- | --- |
| `as_ref()` | `Key<&str>`, for logging and formatting |
| `to_latin(physical)` | The `char` this key produces on a US layout, if any |

`to_latin` is the escape hatch for shortcuts you want to be layout-independent. It lets you bind Ctrl+Z to undo even on AZERTY, by asking what a physical key means on a Latin layout rather than trusting the active one.

## `keyboard::Modifiers`

A `bitflags` set, so every accessor returns a `bool`:

| Method | Key |
| --- | --- |
| `shift()` | Shift |
| `control()` | Control |
| `alt()` | Alt, or Option on macOS |
| `logo()` / `command()` / `macos_command()` | The Windows, Linux, and macOS command key |
| `jump()` | The platform's "jump to default action" key, a platform-dependent alias |

::: tip The command-key trap
`logo()` is Cmd on macOS and Win on Windows, which is not what most apps want: Ctrl+S on Windows should not become Cmd+S on macOS. Binding with `control()` gives one consistent chord everywhere; binding with `command()` deliberately diverges per platform.
:::

## `mouse::Event`

| Field | Purpose |
| --- | --- |
| `button` | `Button::Left`, `Right`, or `Middle` |
| `position` | A `Point` in logical pixels, window-relative |
| `state` | `ButtonState::Pressed` or `Released` |
| `modifiers` | The same `Modifiers` type as the keyboard |

`ScrollDelta` is a separate type on its own event:

| Variant | Meaning |
| --- | --- |
| `LineDelta { x, y }` | Discrete wheel clicks, in lines |
| `PixelDelta(Point)` | Smooth scrolling in pixels, from a trackpad or touch gesture |

The distinction matters for zoom and pan. Line deltas should zoom in fixed steps; pixel deltas should scale by distance, so a trackpad pinch feels proportional.

::: warning `LineDelta` vs `PixelDelta` is not a detail
Treating them the same makes one of the two input methods feel wrong, usually a trackpad that scrolls at a wildly different speed from a wheel. Branch on the variant.
:::

## Receiving events

There is no global `on_key_press` builder method. Keyboard handling happens in one of three places.

### Inside a custom widget

The `update` method on your own widget, matching on the event and publishing to the `Shell`. This is what every built-in input widget does.

### Through a subscription

`iced::keyboard::on_key_press` and the rest of the `input` subscriptions deliver events to your `update` as ordinary messages, without writing a widget:

```rust
fn subscription(state: &State) -> Subscription<Message> {
    keyboard::on_key_press(|key, modifiers| match key {
        Key::Character('s') if modifiers.ctrl() => Some(Message::Save),
        _ => None,
    })
    .into()
}
```

This is the right tool for application-level shortcuts that should work regardless of which widget has focus.

::: warning Subscriptions receive events even when a text field has focus
`on_key_press` fires for every key, including ones being typed into a `TextInput`. If your app-wide shortcut conflicts with typing, gate it on whether an input has focus, or handle it in the focused widget instead.
:::

### Through the window subscription

`iced::window::events()` yields `window::Event`s for window-level changes such as resize, focus, moved, and close requested.

## Focus

Keyboard input only reaches the focused widget. Focus moves with Tab and Shift+Tab automatically, and programmatically through `widget::operation::focus`:

```rust
Message::OpenDialog => {
    widget::operation::focus(Id::from("name-input")).into()
}
```

The `Id` must match the one you gave the widget:

```rust
text_input("Name", &self.name).id(Id::from("name-input"))
```

::: warning Focus needs a stable `Id`
Without an explicit `id`, a widget's identity is positional. Insert a widget above it and the focused widget may become a different one. Always give an `id` to anything you intend to focus.
:::

## Choosing between them

| Need | Use |
| --- | --- |
| A shortcut that works anywhere in the app | `keyboard::on_key_press` subscription |
| A widget that handles its own keys | `update` in your custom widget |
| Reacting to typing in a `TextInput` | `on_input`, not keyboard events |
| Reacting to a window resize | `window::resize_events()` |
| A pointer gesture on a specific area | `mouse_area` builder methods |
| Raw pointer position during a drag | `mouse_area().on_move(..)` |
| Detecting visibility for lazy loading | `sensor` |
