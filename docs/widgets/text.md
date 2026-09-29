# Text and Rich Content

iced has four text tools, and picking the wrong one is a common source of confusion:

| Tool        | Use for                                           |
| ----------- | ------------------------------------------------- |
| `text`      | A single run of plain text                        |
| `span`      | A styled run, composed into a paragraph           |
| `rich_text` | A whole paragraph built from several styled spans |
| `markdown`  | Rendering a Markdown document, feature-gated      |

## `text`

The basic widget. It renders one paragraph of text with one style.

| Method                    | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `size(Pixels)`            | Font size                                     |
| `line_height(LineHeight)` | Line spacing                                  |
| `font(Font)`              | Which font to use                             |
| `width` / `height`        | Box size                                      |
| `center()`                | Shorthand for centring both axes              |
| `align_x(Alignment)`      | Horizontal alignment within the allocated box |
| `align_y(...)`            | Vertical alignment                            |
| `wrapping(Wrapping)`      | `None`, `Word`, `Character`, or `Grapheme`    |
| `shaping(Shaping)`        | `Auto`, `Basic`, or `Advanced`                |
| `color(Color)`            | Shorthand for setting the colour              |
| `style(f)`                | Full control, via `text::Style`               |
| `class(c)`                | Style via a named theme class                 |

`text::Style` has exactly one field:

```rust
pub struct Style {
    /// The default, `None`, means using the inherited color.
    pub color: Option<Color>,
}
```

That default is significant: `None` means _inherit_, so a `text` widget picks up whatever colour its context provides unless you override it.

### Wrapping

`Wrapping` controls how a line breaks when the text exceeds its box:

| Variant     | Behaviour                                 |
| ----------- | ----------------------------------------- |
| `None`      | No wrapping; text overflows or is clipped |
| `Word`      | Break at whitespace                       |
| `Character` | Break anywhere                            |
| `Grapheme`  | Break at grapheme cluster boundaries      |

`Character` is usually right for narrow columns and CJK text. `Grapheme` is the correct choice when you must never split a combining sequence.

### Shaping

`Shaping` decides how glyphs are positioned:

| Variant    | Behaviour                                     |
| ---------- | --------------------------------------------- |
| `Auto`     | Let the renderer decide                       |
| `Basic`    | Fast path, correct for Latin                  |
| `Advanced` | HarfBuzz: ligatures, kerning, complex scripts |

The advanced paths are **feature-gated** behind `basic-shaping` and `advanced-shaping`. Without those features, `Shaping::Advanced` silently degrades, which is the usual explanation for text that renders with wrong glyph positioning.

## `span` and `rich_text`

When you need mixed styling inside one paragraph, a single `text` widget cannot express it. `rich_text` takes a list of `Span`s and lays them out as one paragraph.

A `Span` has far more surface than `text::Style`:

| Method                          | What it does                          |
| ------------------------------- | ------------------------------------- |
| `size` / `line_height` / `font` | Typography                            |
| `color(Color)`                  | Text colour                           |
| `link(Link)`                    | Attach a link payload                 |
| `background(Background)`        | Highlight behind the run              |
| `border(Border)`                | Outline around the run                |
| `padding(Padding)`              | Space between the border and the text |
| `underline(bool)`               | Underline                             |
| `strikethrough(bool)`           | Strike through                        |

`background`, `border`, and `padding` on a span are what let you build an inline code chip or a highlighted keyword rather than just colouring text.

The `Link` type is **generic**, so a span can carry any payload you like, and you receive it back in your `Message`:

```rust
enum Message {
    LinkClicked(Link),
}

rich_text![
    span!("See the "),
    span!("docs").link(DocLink::Reference),
    span!(" for more."),
]
.on_link_clicked(Message::LinkClicked)
```

This is the mechanism behind clickable inline text.

## `markdown`

Feature-gated behind `markdown`. Parses a document and renders it.

```rust
markdown(document).with_style(markdown::Style::from_palette(theme.palette()))
```

| Method                   | What it does                         |
| ------------------------ | ------------------------------------ |
| `with_style(Style)`      | Colour scheme for the whole document |
| `with_text_size(Pixels)` | Base font size                       |

`Style::from_palette` builds a scheme from any theme palette, so Markdown inherits your colours.

### The grammar

If you want control over the element tree instead of a single widget, the parsed form is exposed directly:

| Function                          | Produces                       |
| --------------------------------- | ------------------------------ |
| `markdown::view` / `view_with`    | A whole document as an element |
| `item`                            | One parsed node                |
| `heading`                         | A heading                      |
| `paragraph`                       | A paragraph                    |
| `unordered_list` / `ordered_list` | Lists                          |
| `code_block`                      | A fenced code block            |
| `quote`                           | A block quote                  |
| `rule`                            | A thematic break               |
| `table`                           | A table                        |
| `items`                           | Many items from an iterator    |

The parser itself is available if you want to walk the AST:

```rust
let items: Vec<Item> = markdown::parse(source).collect();
```

`Document` also exposes `items()` and `images()`, where `images` is a `HashSet` of referenced URIs, which is useful for preloading.

### Code blocks and highlighting

Code blocks route through `iced_highlighter` behind the `highlighter` feature. The API is stateful and line-oriented: `prepare` warms up a grammar, then `highlight_line` tokenises one line at a time.

::: warning Highlighting is expensive
Parsing grammars and tokenising text costs real time. On a large document, or one that re-renders on every keystroke, this shows up as jank. Cache the parsed document in your state rather than re-parsing inside `view()`.
:::

## Loading fonts

Text needs a font. Fonts are loaded on the application:

```rust
Application::new(...)
    .default_font(font::Font::DEFAULT)
    .font(include_bytes!("../fonts/Inter-Regular.ttf"))
```

and referenced by family anywhere a font is accepted:

```rust
text("Hello").font(font::Font {
    family: "Inter",
    weight: font::Weight::Medium,
    stretch: font::Stretch::Normal,
    style: font::Style::Normal,
})
```

The `fira-sans` feature bundles Fira Sans as the default, so text is visible before you supply anything.

## Icons are font glyphs

There is no bundled icon set. Icons in `TextInput::icon`, `PickList::handle`, and anywhere else are `char` code points rendered from a loaded font. To add icons, load an icon font such as Font Awesome or Material Icons and reference a code point:

```rust
text_input("Search", &self.query)
    .icon(text_input::Icon {
        font: icon_font,
        code_point: '\u{f002}',
        size: Some(14.0.into()),
        spacing: 8.0,
        side: text_input::Side::Left,
    })
```

This is the standard approach, and the reason icon fonts are near-universal in iced applications.

## Line height

`LineHeight` is an enum rather than a bare number, because line height must scale with text size:

| Variant            | Behaviour                   |
| ------------------ | --------------------------- |
| `Relative(f32)`    | A multiple of the font size |
| `Absolute(Pixels)` | A fixed value               |
| `Normal`           | The font's own metric       |
| `Monospace`        | Suited to code              |

`Relative` is almost always what you want. A fixed absolute line height looks wrong as soon as the text size changes.
