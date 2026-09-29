# Graphics and Media

## `canvas`

Feature-gated behind `canvas`. It gives you an immediate-mode 2D drawing surface for anything the widget set doesn't cover — charts, custom gauges, a colour picker, a waveform, a game board.

### The `Program` trait

You implement `Program` on a type describing what to draw. It has three methods, two with defaults:

| Method              | Required | Purpose                                                  |
| ------------------- | -------- | -------------------------------------------------------- |
| `draw`              | yes      | Produce the geometry to render                           |
| `update`            | no       | Handle events, mutate `State`, optionally emit a message |
| `mouse_interaction` | no       | Set the cursor when over the canvas                      |

The associated `State` is your program's own scratch space, persisted in the widget tree between frames. It is **not** your application state — anything meaningful should become a `Message` and go through `update`.

```rust
struct Gauge { radius: f32 }

impl<Message> canvas::Program<Message> for Gauge {
    type State = ();

    fn draw(
        &self,
        _state: &(),
        renderer: &Renderer,
        _theme: &Theme,
        bounds: Rectangle,
        _cursor: mouse::Cursor,
    ) -> Vec<canvas::Geometry> {
        let mut frame = canvas::Frame::new(renderer, bounds.size());
        let circle = canvas::Path::circle(frame.center(), self.radius);
        frame.fill(&circle, Color::BLACK);
        frame.stroke(
            &circle,
            canvas::Stroke::default().with_width(2.0).with_color(Color::WHITE),
        );
        vec![frame.into_geometry()]
    }
}
```

`update` returns `Option<Action<Message>>`, and that `Action` is the interesting part:

| Return                               | Effect                                                          |
| ------------------------------------ | --------------------------------------------------------------- |
| `None`                               | Nothing happens                                                 |
| `Action::publish(msg)`               | Publishes `msg` to your application                             |
| `Action::request_redraw()`           | Requests another frame — combine with a message for a game loop |
| `Action::request_redraw_at(instant)` | Requests a frame at a specific time                             |
| `Action::capture()`                  | Stops the event bubbling to widgets underneath                  |

The redraw methods are the ones that make a self-animating canvas possible. A published message reaches your `update`, where you mutate state and return a task or schedule the next frame — so a canvas animation is driven by messages, not by drawing in a loop.

The fields on `Action` (`message_to_publish`, `redraw_request`, `event_status`) are private, so the constructors above are the only way to build one. To publish a message _and_ capture the event, chain `and_capture`:

```rust
Some(Action::publish(Message::Selected).and_capture())
```

### `Frame` — the drawing surface

`Frame` is a batched geometry recorder. You draw into it, then convert once with `into_geometry()`.

| Method                             | Draws                               |
| ---------------------------------- | ----------------------------------- |
| `fill(path, fill)`                 | A filled path                       |
| `fill_rectangle(bounds, fill)`     | A filled rectangle                  |
| `stroke(path, stroke)`             | A path outline                      |
| `stroke_rectangle(bounds, stroke)` | A rectangle outline                 |
| `fill_text(text)`                  | Text                                |
| `draw_image(bounds, image)`        | An image                            |
| `draw_svg(bounds, svg)`            | An SVG (requires the `svg` feature) |

Rounded rectangles go through a `Path` rather than the rectangle helpers, because they need corner geometry.

Transform and clipping operations:

| Method                                 | Purpose                        |
| -------------------------------------- | ------------------------------ |
| `translate(vector)`                    | Move the origin                |
| `rotate(angle)`                        | Rotate                         |
| `scale(f32)`                           | Uniform scale                  |
| `scale_nonuniform(vector)`             | Non-uniform scale              |
| `with_clip(bounds, f)`                 | Draw clipped to a rectangle    |
| `with_save(f)`                         | Save and restore the transform |
| `push_transform` / `pop_transform`     | Manual transform stack         |
| `width` / `height` / `size` / `center` | Frame geometry helpers         |

### `Path`

Paths are built two ways. For simple shapes there are direct constructors:

| Constructor                                       | Shape               |
| ------------------------------------------------- | ------------------- |
| `Path::line(from, to)`                            | A line segment      |
| `Path::rectangle(top_left, size)`                 | A rectangle         |
| `Path::rounded_rectangle(top_left, size, radius)` | A rounded rectangle |
| `Path::circle(center, radius)`                    | A circle            |

For anything else, use the builder, which is a full vector path API: `move_to`, `line_to`, `arc`, `arc_to`, `ellipse`, `bezier_curve_to`, `quadratic_curve_to`, `rectangle`, `rounded_rectangle`, `circle`, `close`, and `build`.

`Path::transform` applies a `lyon` transform to an existing path, and `Path::raw` exposes the underlying `lyon_path::Path` if you need to interoperate with that ecosystem.

### `Fill` and `Stroke`

`Fill` is a solid `Color` or a `Gradient` (linear or radial), built with the `fill` and `gradient` helpers.

`Stroke` has:

| Method           | Purpose                        |
| ---------------- | ------------------------------ |
| `with_color`     | Stroke colour                  |
| `with_width`     | Thickness                      |
| `with_line_cap`  | `Butt`, `Round`, `Square`      |
| `with_line_join` | `Miter`, `Round`, `Bevel`      |
| `LineDash`       | Dashed strokes, with an offset |

### Sizing

`Canvas` is a leaf widget — it never inspects its content, so it has no intrinsic size. You **must** give it `width` and `height` or it collapses to nothing. `Length::Fill` is the usual choice for a responsive chart.

### Caching

For geometry that is expensive to build and rarely changes, render it once into a `cache::Group` and reuse it. The canvas module re-exports `Group` for this.

---

## `image`

Feature-gated behind `image`. Displays raster graphics.

```rust
image(image::Handle::from_bytes(bytes))
    .width(Fill)
    .content_fit(ContentFit::Cover)
```

| Method                        | What it does                          |
| ----------------------------- | ------------------------------------- |
| `width` / `height`            | Box size                              |
| `expand(bool)`                | Ignore the image's intrinsic size     |
| `content_fit(ContentFit)`     | `Contain`, `Cover`, or `Fill`         |
| `filter_method(FilterMethod)` | `Nearest` or `Linear` sampling        |
| `rotation`                    | Rotate the image                      |
| `opacity`                     | Alpha from 0 to 1                     |
| `scale`                       | Uniform scale factor                  |
| `crop(Rectangle<u32>)`        | Show a sub-region, for sprite atlases |
| `border_radius(radius)`       | Round the corners                     |

`Handle` comes in three forms: `from_path` for a file on disk, `from_bytes` for in-memory data, and `from_rgba` for raw pixels.

`ContentFit::Cover` plus `border_radius` is the standard way to render an avatar: fill the box, crop the overflow, round the corners. `filter_method(Nearest)` is what you want for pixel art; the default `Linear` suits photographs.

---

## `svg`

Feature-gated behind `svg`. Renders vector graphics from a file.

| Method                    | What it does                       |
| ------------------------- | ---------------------------------- |
| `Svg::from_path(path)`    | Load from a file path              |
| `width` / `height`        | Box size                           |
| `content_fit(ContentFit)` | How the vector scales into the box |
| `rotation`                | Rotate                             |
| `opacity`                 | Alpha from 0 to 1                  |
| `style` / `class`         | Appearance                         |

Unlike `Image`, an SVG scales cleanly at any size, so it's the right choice for icons and logos. Colours come from `fill` styling inside the SVG file itself.

---

## `qr_code`

Feature-gated behind `qr_code`, which implies `canvas`. Renders a QR code from data you supply.

| Method            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `cell_size`       | Size of one module                            |
| `total_size`      | Overall size, overriding the cell calculation |
| `style` / `class` | Foreground and background colours             |

The `Data` builder controls encoding: `with_error_correction(level)` takes an `ErrorCorrection` variant, and `with_version` caps the symbol version. Higher error correction makes the code more robust but denser.

---

## `shader`

Available with the `wgpu` feature. Runs a WGSL fragment shader over a rectangle. The program type supplies the shader source and uniforms.

Because it is a real GPU pipeline, this is how you do effects no widget can express — animated gradients, procedural noise, a plasma background. It requires the wgpu renderer, so it is unavailable on the tiny-skia backend.

---

## Choosing between them

| Need                                         | Use                                      |
| -------------------------------------------- | ---------------------------------------- |
| Arbitrary 2D shapes, charts, custom controls | `canvas`                                 |
| Photographs, bitmaps, sprites                | `image`                                  |
| Icons and logos that scale cleanly           | `svg`                                    |
| A scannable code                             | `qr_code`                                |
| Per-pixel GPU effects                        | `shader`                                 |
| Simple decoration                            | `Container` with a gradient `Background` |
