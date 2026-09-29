# Web Target

iced compiles to `wasm32-unknown-unknown` and renders through wgpu into a single `<canvas>` it creates itself. Most of the library works unchanged on the web; this section covers the parts that do not.

These pages assume iced **0.14**.

## How the web target fits together

```text
Vite dev server / build
        │
        ├─ index.html          ← you own this; iced injects one canvas
        └─ src/main.js         ← calls init() from wasm-pack output
                 │
                 ▼
        wasm-pack --target web
                 │
                 ▼
        pkg/*.js + *_bg.wasm    ← ES module with default-export init()
                 │
                 ▼
        iced::application(...).run()
                 │
                 ▼
        <canvas>  ← wgpu via WebGL2 (or WebGPU where available)
```

The key consequence: **there is no DOM**. iced paints every pixel itself.

::: warning No DOM to inspect
Widgets are not HTML elements, CSS does not apply to them, and browser devtools will show you one `<canvas>` and nothing else. Practically:

- No CSS layout, flexbox, or grid — use iced's own layout widgets.
- No CSS selectors — styling goes through `style` closures and theme classes.
- No browser accessibility tree. Screen reader support has to come from elsewhere.
- `getBoundingClientRect` on your widgets does not exist.

:::

## The pages in this section

| Page                                | Covers                                                 |
| ----------------------------------- | ------------------------------------------------------ |
| [Build with Vite](/web/build)       | Project layout, `wasm-pack`, scripts, dev loop, deploy |
| [Renderers & Threads](/web/threads) | WebGPU vs WebGL2, atomics, rayon, workers, COOP/COEP   |
| [Browser Gotchas](/web/gotchas)     | Input, canvas mounting, clipboard, files, debugging    |

## Inert features

These resolve and compile but do nothing on wasm. An explicit `default-features = false` plus a curated list is the conventional approach, since unused features still cost compile time.

| Feature                 | Why not                                                |
| ----------------------- | ------------------------------------------------------ |
| `tiny-skia`             | A software rasteriser with no role once wgpu is active |
| `x11`, `wayland`        | There is no display server in a browser                |
| `linux-theme-detection` | Uses `async-io` and `mundy`; never resolves on wasm    |
| `thread-pool`           | Needs OS threads; wasm has none                        |
| `tokio`, `smol`         | Same: multi-threaded runtimes                          |
| `sysinfo`               | Reads host OS state that does not exist                |

## A minimal web dependency set

```toml
[dependencies]
iced = { version = "0.14", default-features = false, features = [
    "wgpu",        # required, the only web renderer
    "webgl",       # WebGL2 fallback; without this, Safari shows nothing
    "web-colors",  # color! accepts hex and CSS names
    "fira-sans",   # bundled default font
] }
wasm-bindgen = "0.2"
console_error_panic_hook = "0.1"
```

## See also

- [Feature Flags](/features) — the full matrix, including why `webgl` is not a default
- [Tasks & Subscriptions](/async) — what changes when there are no OS threads
- [Graphics & Media](/widgets/graphics) — `shader` requires the wgpu renderer
