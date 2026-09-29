# Theme and Style

iced has two independent styling systems, and confusing them is the usual source of "why doesn't my theme apply".

| System            | What it styles                               | How you supply it                      |
| ----------------- | -------------------------------------------- | -------------------------------------- |
| `theme::Theme`    | Global colours every widget reads by default | `Application::theme`                   |
| `Catalog` classes | Per-widget named styles                      | Implement `Catalog` on your theme type |

## The theme type

`Theme` is an enum with a generous set of built-in palettes: `Light`, `Dark`, `Dracula`, `Nord`, `SolarizedLight`, `SolarizedDark`, `GruvboxLight`, `GruvboxDark`, the four `Catppuccin` flavours, three `TokyoNight` variants, three `Kanagawa` variants, `Moonfly`, `Nightfly`, `Oxocarbon`, `Ferra`, and `Custom`.

A theme is chosen as a function of state, which is what makes a runtime light/dark toggle work:

```rust
Application::new(...)
    .theme(|state: &State| {
        if state.dark_mode { Theme::Dark } else { Theme::Light }
    })
```

### Custom themes

`Theme::custom` and `Theme::custom_with_fn` build one from a name and a palette, the latter letting you compute the palette from a function:

```rust
Theme::custom_with_fn("Brand".into(), |mode| Palette {
    background: Color::from_rgb8(0x10, 0x10, 0x10),
    text:       Color::from_rgb8(0xf0, 0xf0, 0xf0),
    primary:    Color::from_rgb8(0x3b, 0x82, 0xf6),
    success:    Color::from_rgb8(0x22, 0xc5, 0x5e),
    warning:    Color::from_rgb8(0xea, 0xb8, 0x58),
    danger:     Color::from_rgb8(0xef, 0x44, 0x44),
})
```

`Palette` is deliberately small — six roles. For anything more specific you need the extended palette or your own theme type.

## The extended palette

`Theme::extended_palette()` returns an `Extended` struct, which is where the real design tokens live. It groups colours by role, and each group offers intensity steps:

| Group        | Available strengths                                                               |
| ------------ | --------------------------------------------------------------------------------- |
| `background` | `base`, `weakest`, `weaker`, `weak`, `neutral`, `strong`, `stronger`, `strongest` |
| `primary`    | `base`, `weak`, `strong`                                                          |
| `secondary`  | `base`, `weak`, `strong`                                                          |
| `success`    | `base`, `weak`, `strong`                                                          |
| `warning`    | `base`, `weak`, `strong`                                                          |
| `danger`     | `base`, `weak`, `strong`                                                          |

Each slot is a `Pair` holding a `color` and the `text` colour that reads well on it. That pairing is what stops you shipping unreadable contrast.

The background ramp is the key idea for building a coherent design system: surfaces step from `weakest` to `strongest` as they come forward, instead of you inventing a grey for every card.

## App-wide style

`Application::style` sets the two colours that apply to everything not otherwise specified:

```rust
.style(|_state, _theme| theme::Style {
    background_color: Color::from_rgb8(0x0a, 0x0a, 0x0a),
    text_color:       Color::from_rgb8(0xe5, 0xe5, 0xe5),
})
```

## Styling individual widgets

There are two ways, and they serve different purposes.

### `style` — a closure

You pass a function from theme and status to a `Style` struct:

```rust
button("Delete").style(|theme, status| {
    let palette = theme.extended_palette();
    let base = if status == button::Status::Hovered {
        palette.danger.strong.color
    } else {
        palette.danger.base.color
    };
    button::Style {
        background: Some(base.into()),
        text_color: palette.danger.base.text,
        ..button::Style::default()
    }
})
```

This is the right choice for one-off, state-dependent styling. You get the full theme and the widget's `Status`, so hover and press variants are a branch away.

### `class` — a named style

You name a class and resolve it through the theme's `Catalog`:

```rust
container(content).class(theme::Class::from("card"))
```

`class` is better when the same style recurs across many widgets, or when you want styles selectable at runtime without rebuilding closures. The widget calls `Catalog::style(&theme, status, class)` and gets a `Style` back.

The `Catalog` trait is per-widget — `button::Catalog`, `container::Catalog`, and so on. You implement them for your theme type:

```rust
impl button::Catalog for MyTheme {
    type Class<'a> = ButtonClass;

    fn default() -> Self::Class<'a> { ButtonClass::Primary }

    fn style(&self, class: &ButtonClass, status: Status) -> Style { /* … */ }
}
```

Using an enum as the class type rather than a `&'a str` gives compile-time safety: a typo is a compile error, not a silent fallback to the default.

::: tip One class type per widget
Each widget's `Catalog` defines its own `Class<'a>` associated type. That's deliberate — a `ButtonClass` and a `ContainerClass` are different types, so you can't pass a button class to a container by mistake.
:::

## `Themer`

A widget that applies a theme to a subtree without affecting the rest of the app:

```rust
themer(Some(MyTheme::dark_variant()), content).into()
```

Note the argument order: the **theme comes first**, and it is an `Option<Theme>`, not the content. Pass `None` to leave the subtree on the ambient theme.

It takes a `fn(&Theme) -> Color` for text colour and a `fn(&Theme) -> Background` for the background, so a `Container` or `Stack` can host a differently themed region.

## Colours, borders, shadows

The value types live in `iced::core` and all build fluently.

### `Color`

Constructed from RGB, RGBA, or — with the `web-colors` feature — the `color!` macro accepting hex literals, shorthand, and CSS colour names:

```rust
color!(0x3b82f6)        // hex
color!(0x3b82f680)       // hex with alpha
color!(0xfff)            // shorthand
color!(r, g, b)          // 8-bit components
Color::from_linear_rgba(0.2, 0.4, 0.9, 1.0)
```

Two utilities worth knowing:

| Method                       | What it does                                    |
| ---------------------------- | ----------------------------------------------- |
| `relative_luminance()`       | Perceived brightness, `0.0` to `1.0`            |
| `relative_contrast(other)`   | WCAG contrast ratio between two colours         |
| `is_readable_on(background)` | Whether this text is legible on that background |

`is_readable_on` is worth using when generating a foreground colour at runtime, rather than assuming white or black.

### `Border`

Per-corner radii, uniform width, one colour:

```rust
Border {
    color: color!(0x333333),
    width: 1.0,
    radius: Radius {
        top_left: 8.0, top_right: 8.0,
        bottom_right: 0.0, bottom_left: 0.0,
    },
}
```

### `Shadow`

Three fields — `color`, `offset`, and `blur_radius`. Multi-pass shadows are done by stacking several.

### `Padding`

Uniform or per-side, with `horizontal` and `vertical` shorthands.

### `Background`

Either a solid `Color` or a `Gradient`, so a container background can be a linear or radial gradient.

## Theming checklist

If a colour isn't applying, it is almost always one of these:

1. The widget's `style` was not set, so the theme's `Catalog` default is used instead.
2. A `class` was set that the `Catalog` doesn't recognise, silently falling back to default.
3. `text` has `Style { color: None }` by default, meaning _inherit_ — and the inherited colour came from `Application::style`, not the palette.
4. A parent `Themer` is overriding what the widget would otherwise use.

---

## See also

- [Input Widgets](/widgets/input) — every `Status` you can key styles on
- [Layout Widgets](/widgets/layout) — `Container` is where most decoration happens
- [Custom Widgets](/custom-widgets) — implementing `Catalog` for your own theme type
