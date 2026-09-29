# Browser Gotchas

Behaviour that differs from native, without being an outright error. These are the things that waste the most time.

## Input

Pointer, wheel, and keyboard events arrive as normal DOM events and are translated by iced. The differences worth knowing:

- **No middle-click paste on Linux**, because the browser intercepts it.
- **Text input and IME composition** work, but the `input_method` module exists specifically to handle candidate windows and dead keys. Complex CJK input is the case most likely to need attention.
- **No right-click context menu by default**, since the browser's own menu appears. Capture `on_right_press` and suppress it, or handle `contextmenu` in JS.

Keyboard shortcuts need extra care. `Cmd`/`Ctrl` combinations that the browser also claims — `W`, `T`, `N`, `Q` — will be intercepted before they ever reach your canvas, because "close tab" and "new window" outrank a canvas key handler.

## Canvas mounting

iced appends its canvas to `document.body` by default, and it looks for an element with the id `iced` first. You can change that id; see [Build with Vite](/web/build#mounting-the-canvas-somewhere-specific).

The container is **replaced**, not filled, so it must be empty:

```html
<div id="iced-root"></div>
```

::: warning Pass the id without `#`
The value is interpolated as `#{target}`. Passing `"#iced-root"` fails to match silently and the canvas lands on `document.body` instead, with no error.

:::

Sizing is the other half. The canvas is `100%` of its parent, so every ancestor needs real height:

```css
html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
}
```

Without this the canvas computes to zero height and you get a blank page.

## Rendering and performance

- The renderer is wgpu on a single canvas, and every frame is a full redraw of the widget tree, so `view()` cost is paid continuously.
- Text shaping is CPU work. With `basic-shaping` off, complex scripts will render incorrectly; turn it on if you need anything beyond Latin.
- Very large `f32` coordinates lose precision. Keep layouts under roughly 10,000 pixels.
- Device pixel ratio is handled by the canvas sizing; a `responsive` widget is how you branch on logical size.

::: tip Screenshots can look blank when they are not
WebGL canvases frequently capture as an empty image in headless browsers and screenshot tools, because the surface is not preserved after compositing. This is a capture artefact, not an iced bug. To confirm the app is really rendering, read the pixels back:

```js
const c = document.querySelector("canvas");
const gl = c.getContext("webgl2");
const px = new Uint8Array(4);
gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
console.log("corner pixel:", px);
```

A painted background returns an opaque colour rather than `[0, 0, 0, 0]`.

:::

## Time

`std::time::Instant::now()` **panics** on wasm. iced swaps in [`wasmtimer`](https://crates.io/crates/wasmtimer) internally so its own timing works, but your own code must not call it directly — use `web_sys`'s `performance.now()` or `gloo-timers`.

This is covered in more detail in [Renderers & Threads](/web/threads#state-and-threads).

## Clipboard and filesystem

`Clipboard` is implemented, so copy and paste work. But there is no filesystem: native file pickers are unavailable. File input has to go through an HTML `<input type="file">` and back into the app via `wasm_bindgen`.

## Debugging

`Element::explain(color)` overlays layout boxes on the rendered output, which is the fastest way to find out why a layout isn't doing what you expect. On web it is considerably more useful than DOM inspection, because you have no DOM to inspect.

The `debug` feature adds a runtime overlay with frame timings and the widget tree, plus an FPS counter.

Install `console_error_panic_hook` first. Without it a Rust panic in the browser gives you a bare "unreachable executed", which tells you nothing:

```rust
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    // ...
}
```

## See also

- [Build with Vite](/web/build) — build issues and blank-canvas diagnosis
- [Renderers & Threads](/web/threads) — renderer selection and thread limits
- [Running WASM in a Worker](/web/worker) — real parallelism
