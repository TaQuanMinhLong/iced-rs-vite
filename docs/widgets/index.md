# All Widgets (A–Z)

The complete inventory of `iced_widget 0.14.2`.

Nearly every entry is a free constructor function living in `iced_widget/src/helpers.rs`. The exception is `Menu`, marked in the table below, because it is reached differently.

## Status column

| Icon | Meaning                                                                    |
| ---- | -------------------------------------------------------------------------- |
| ✅   | Available with your current `Cargo.toml`                                   |
| 🔒   | Needs a feature flag you have not enabled — see [Feature Flags](/features) |
| 🌐   | Web caveat applies                                                         |

## A–Z inventory

The **Group** column names the page that documents each widget.

| Widget           | Constructor                                           | Status        | Group     |
| ---------------- | ----------------------------------------------------- | ------------- | --------- |
| `Button`         | `button`                                              | ✅            | Input     |
| `Canvas`         | `canvas`                                              | 🔒 `canvas`   | Graphics  |
| `Checkbox`       | `checkbox`                                            | ✅            | Selection |
| `Column`         | `column!` / `column(iter)`                            | ✅            | Layout    |
| `ComboBox`       | `combo_box`                                           | ✅            | Selection |
| `Container`      | `container`                                           | ✅            | Layout    |
| `Float`          | `float`                                               | ✅            | Layout    |
| `Grid`           | `grid(iter)`                                          | ✅            | Layout    |
| `Image`          | `image`                                               | 🔒 `image`    | Graphics  |
| `Keyed Column`   | `keyed_column!`                                       | ✅            | Layout    |
| `Lazy`           | `lazy`                                                | 🔒 `lazy`     | Layout    |
| `Markdown`       | `markdown`                                            | 🔒 `markdown` | Text      |
| `Menu`           | `overlay::menu::Menu::new(..)` — 6 args, not a helper | ✅            | Overlay   |
| `MouseArea`      | `mouse_area`                                          | ✅            | Input     |
| `PaneGrid`       | `pane_grid`                                           | ✅            | Layout    |
| `PickList`       | `pick_list`                                           | ✅            | Selection |
| `Pin`            | `pin`                                                 | ✅            | Layout    |
| `ProgressBar`    | `progress_bar`                                        | ✅            | Display   |
| `QRCode`         | `qr_code`                                             | 🔒 `qr_code`  | Graphics  |
| `Radio`          | `radio`                                               | ✅            | Selection |
| `Responsive`     | `responsive`                                          | ✅            | Layout    |
| `Rich`           | `rich_text`                                           | ✅            | Text      |
| `Row`            | `row!` / `row(iter)`                                  | ✅            | Layout    |
| `Rule`           | `rule::horizontal` / `rule::vertical`                 | ✅            | Display   |
| `Scrollable`     | `scrollable`                                          | ✅            | Layout    |
| `Sensor`         | `sensor`                                              | ✅            | Layout    |
| `Shader`         | `shader`                                              | ✅ wgpu       | Graphics  |
| `Slider`         | `slider`                                              | ✅            | Selection |
| `Space`          | `space()`                                             | ✅            | Layout    |
| `Span`           | `span`                                                | ✅            | Text      |
| `Stack`          | `stack`                                               | ✅            | Layout    |
| `Svg`            | `svg`                                                 | 🔒 `svg`      | Graphics  |
| `Table`          | `table` + `column`                                    | ✅            | Data      |
| `Text`           | `text`                                                | ✅            | Text      |
| `TextEditor`     | `text_editor`                                         | ✅            | Input     |
| `TextInput`      | `text_input`                                          | ✅            | Input     |
| `Themer`         | `themer`                                              | ✅            | Styling   |
| `Toggler`        | `toggler`                                             | ✅            | Selection |
| `Tooltip`        | `tooltip`                                             | ✅            | Overlay   |
| `VerticalSlider` | `vertical_slider`                                     | ✅            | Selection |

## Alignment helpers

Shorthands that wrap `container`. Available unconditionally:

`center`, `center_x`, `center_y`, `right`, `right_center`, `bottom`, `bottom_center`, `bottom_right`

## Interaction helpers

| Helper       | Signature shape               | Purpose                                                                                             |
| ------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `hover`      | `hover(base, top)`            | Swap `base` for `top` while hovered — the cheapest way to add a hover state to a composed component |
| `opaque`     | `opaque(elem)`                | Swallow all events; children never fire. Use for modal backdrops                                    |
| `sensor`     | `sensor(content).on_show(..)` | Fire messages on visibility change — your lazy-load / infinite-scroll primitive                     |
| `mouse_area` | `mouse_area(elem).on_*(..)`   | Raw pointer events incl. right/middle/double-click                                                  |

## What iced does **not** have

This is the part the official docs won't tell you. There is no built-in:

- **Tabs / tab bar** — build with `row!` of `button`s + a `Stack`/`Container` swap in `view()`
- **Virtualized list** — use `keyed_column!` for identity, or `lazy`, or `scrollable` + manual windowing
- **Date picker / calendar** — `pick_list` of strings is the common workaround
- **Tree / file browser** — recursive `Column` + `pick_list` for expansion
- **Modal / dialog** — `Stack` with `opaque` backdrop + centered `Container`
- **Accordion / disclosure** — `button` + conditional `Column`
- **Breadcrumb, pagination, stepper** — compose from `row!` + `button`
- **Context menu** — only `overlay::menu` as a popup; no right-click menu widget. Attach `mouse_area().on_right_press(..)` yourself
- **Color picker** — `canvas` is the intended route
- **Splitter / resizable** — `pane_grid` only (pane-based, not arbitrary)

Every one of these is a component _you_ write in `view()`. Because `view()` is a pure function of state, "components" are just functions returning `Element<'a, Message>`.

## Next

- [Layout](/widgets/layout) — `column`, `row`, `container`, `scrollable`, `pane_grid`
- [Input](/widgets/input) — buttons, text entry, pointer handling
- [Selection Controls](/widgets/selection) — toggles, dropdowns, sliders, progress
- [Text & Rich Content](/widgets/text) — `text`, `rich_text`, `markdown`
- [Graphics & Media](/widgets/graphics) — `canvas`, `image`, `svg`, `shader`
- [Data & Containers](/widgets/data) — `table`, `grid`, `lazy`, `sensor`
