# Feature Flags

iced gates a large part of its surface behind Cargo features. Several of the most interesting widgets are **not** compiled by default.

## Enabling the optional widgets

```toml
[dependencies]
iced = { version = "0.14", features = [
    # drawing
    "canvas",       # Canvas + iced_graphics::geometry
    "image",        # Image widget (raster decode)
    "svg",          # Svg widget
    "qr_code",      # QRCode widget (implies canvas)

    # text
    "markdown",     # Markdown renderer
    "highlighter",  # syntax highlighting for code blocks
    "basic-shaping",# complex-script shaping

    # behaviour
    "lazy",         # Lazy widget (deferred view construction)
    "advanced",     # iced::advanced — custom widget/overlay APIs
] }
```

Each is a thin forwarding feature in the facade:

```
iced/canvas  → iced_widget/canvas → iced_renderer/geometry → iced_graphics/geometry
iced/image   → iced_widget/image  → iced_renderer/image
iced/svg     → iced_widget/svg    → iced_renderer/svg
iced/qr_code → iced_widget/qr_code → iced_renderer/geometry + qrcode
iced/markdown→ iced_widget/markdown → pulldown-cmark
iced/lazy    → iced_widget/lazy    → ouroboros
```

::: warning A missing feature fails late
`iced_widget/src/lib.rs` gates each export with `#[cfg]`:

```rust
#[cfg(feature = "svg")]
pub mod svg;

#[cfg(feature = "image")]
pub use image::Image;

#[cfg(feature = "canvas")]
pub use canvas::Canvas;

#[cfg(feature = "qr_code")]
pub use qr_code::QRCode;

#[cfg(feature = "markdown")]
pub mod markdown;
```

With the feature off, you get _"no method named `canvas` found for enum `Function`"_ pointing at your own code — not a clear feature diagnostic. If a widget seems to have vanished, check the feature list first.
:::

## The full feature matrix

### Renderer

| Feature             | Default | Notes                                             |
| ------------------- | ------- | ------------------------------------------------- |
| `wgpu`              | ✅      | GPU renderer. Also the only path on wasm          |
| `tiny-skia`         | ✅      | CPU software rasterizer. Adds a fallback renderer |
| `webgl`             | ➖      | Enables wgpu's WebGL2 backend                     |
| `web-colors`        | ✅      | `color!` macro accepts hex + CSS named colors     |
| `crisp`             | ✅      | Disables antialiasing for hard pixel edges        |
| `fira-sans`         | ✅      | Bundles Fira Sans as the default font             |
| `strict-assertions` | ➖      | Panics on wgpu validation errors                  |

### Widgets

| Feature                | Unlocks                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `canvas`               | `canvas`, `canvas::Program`, `canvas::Frame`, `canvas::Path` |
| `image`                | `image`, `image::Handle` (with codecs)                       |
| `image-without-codecs` | `image` with no built-in decoders                            |
| `svg`                  | `svg`                                                        |
| `qr_code`              | `qr_code`                                                    |
| `markdown`             | `markdown`                                                   |
| `highlighter`          | `iced::highlighter`                                          |
| `lazy`                 | `lazy`                                                       |

### Text

| Feature            | Effect                                                 |
| ------------------ | ------------------------------------------------------ |
| `basic-shaping`    | HarfBuzz shaping — ligatures, kerning, complex scripts |
| `advanced-shaping` | Shaping with more aggressive fallback                  |
| `svg`              | Also required to draw SVG through the canvas `Frame`   |

### Tooling

| Feature                   | Unlocks                                                   |
| ------------------------- | --------------------------------------------------------- |
| `debug`                   | `iced::debug` — the debug overlay with layout explanation |
| `time-travel`             | Time-travel debugger (implies `debug`)                    |
| `tester`                  | `iced_tester` — headless widget testing                   |
| `unconditional-rendering` | Render every frame, ignoring vsync                        |
| `selector`                | DOM selector integration                                  |
| `advanced`                | `iced::advanced` module                                   |

### Platform

| Feature                 | Default | Platform                               |
| ----------------------- | ------- | -------------------------------------- |
| `x11`                   | ✅      | Linux                                  |
| `wayland`               | ✅      | Linux                                  |
| `linux-theme-detection` | ✅      | Linux (reads the desktop color scheme) |
| `thread-pool`           | ✅      | All native                             |
| `tokio`                 | ➖      | All native                             |
| `smol`                  | ➖      | All native                             |
| `sysinfo`               | ➖      | All native                             |

::: tip Executors are native-only
`thread-pool`, `tokio`, and `smol` all require real OS threads. On `wasm32-unknown-unknown` there are none, so the browser's microtask queue is used instead. Selecting an executor feature when targeting wasm is either a no-op or a hard error depending on the crate.
:::

## The `webgl` question

`webgl` is what makes iced work in browsers that lack WebGPU. It is **not** in wgpu's default feature set, so a plain `iced` dependency with only the `wgpu` feature gives you a WebGPU-only build — which renders nothing on Safari.

The feature chain is:

```
iced/webgl → iced_wgpu/webgl → wgpu/webgl → wgpu-core/webgl → wgpu-hal
```

Enable it through **iced's** feature; enabling wgpu's directly is not equivalent.

The backend wgpu picks, the downlevel limits it requests on wasm, and the failure mode when `webgl` is missing are all covered in [Renderers & Threads](/web/threads#the-webgl-feature-is-the-one-that-matters).

## Inspecting the resolved feature set

Cargo's feature resolver knows the final answer; ask it rather than guessing:

```bash
# what features a package actually has
cargo tree -e features -i wgpu

# just the wgpu features
cargo tree -e features -i wgpu | grep 'wgpu feature'
```

This resolves the union across the whole graph, which is the only reliable way to confirm a transitive feature is on.

## Default feature set

If you don't pass `default-features = false`, you get:

```
wgpu, tiny-skia, crisp, web-colors, thread-pool,
linux-theme-detection, x11, wayland
```

For a `wasm32-unknown-unknown` build, `default-features = false` plus an explicit list is the conventional approach, since `x11`, `wayland`, `linux-theme-detection`, and `thread-pool` are all inert on web but still resolved and compiled.
