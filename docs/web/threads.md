# Renderers & Threads

Two topics that are more entangled on the web than anywhere else: how iced picks a GPU backend, and what "no OS threads" actually means for your Rust code.

## The `webgl` feature is the one that matters

iced on web runs through wgpu, which has **two** browser backends:

| wgpu feature | Backend         | Browser support                                 |
| ------------ | --------------- | ----------------------------------------------- |
| `webgpu`     | WebGPU          | Chromium; Firefox behind a flag; **not Safari** |
| `webgl`      | WebGL2 via GLES | Universal                                       |

`webgl` is **not** in wgpu's default feature set. A dependency on iced with only the `wgpu` feature therefore produces a WebGPU-only binary that renders nothing on Safari or on any machine with the GPU blocklisted.

```toml
iced = { version = "0.14", features = ["wgpu", "webgl"] }
```

The chain is `iced/webgl` → `iced_wgpu/webgl` → `wgpu/webgl` → `wgpu-core/webgl` → `wgpu-hal`. Enable it through **iced's** feature; enabling wgpu's directly is not equivalent.

On wasm32, iced requests WebGL2-downlevel limits unconditionally:

```rust
// wgpu/src/window/compositor.rs (147-152)
#[cfg(target_arch = "wasm32")]
let limits = [wgpu::Limits::downlevel_webgl2_defaults()
    .using_resolution(adapter.limits())];

#[cfg(not(target_arch = "wasm32"))]
let limits =
    [wgpu::Limits::default(), wgpu::Limits::downlevel_defaults()];
```

…and probes for WebGPU support before falling back:

```rust
// wgpu/src/window/compositor.rs (55-59)
let instance = wgpu::util::new_instance_with_webgpu_detection(
    &wgpu::InstanceDescriptor {
        backends: settings.backends,
        flags: if cfg!(feature = "strict-assertions") {
```

Verify what you actually got, because Cargo's resolver is the only authority:

```bash
cargo tree -e features -i wgpu | grep 'wgpu feature'
```

If `webgl` is absent from that list, your build fails silently on Safari.

## State and threads

The browser has no OS threads, so the usual Rust synchronisation primitives behave differently than you may expect. Each row was verified by running a test binary in a real browser via `wasm-pack test --headless`, not by reading documentation.

| Primitive                                | Status | Behaviour in the browser                             |
| ---------------------------------------- | ------ | ---------------------------------------------------- |
| `AtomicU32`, `AtomicBool`, `AtomicUsize` | ✅     | Correct results, but plain load/store (see below)    |
| `Mutex<T>`                               | ✅     | Poisoning never trips — no threads to panic          |
| `RwLock<T>`                              | ✅     | Works as a plain cell                                |
| `OnceLock<T>`                            | ✅     | Cleanest way to do lazy global initialisation        |
| `Arc<T>`                                 | ✅     | `strong_count` works; it is just refcounting         |
| `mpsc::channel`                          | ✅     | Same-thread send/receive works                       |
| `static Mutex<Vec<T>>`                   | ✅     | Global state with interior mutability, no `unsafe`   |
| `std::thread::spawn`                     | ❌     | **Compiles, then panics:** `operation not supported` |
| `Condvar`                                | ❌     | Panics — the impl is `sys/sync/condvar/no_threads`   |
| `std::time::Instant::now()`              | ❌     | **Panics** — `sys/time/unsupported.rs`               |

So global state of the kind covered in [Structuring Larger Apps](/scaling#state-placement-state-first-globals-last) works in the browser unchanged:

```rust
static REGISTRY: Mutex<Vec<String>> = Mutex::new(Vec::new());
static CACHE: OnceLock<HashMap<String, String>> = OnceLock::new();
```

::: warning `Instant::now()` is the sneakiest failure
It is not a compile error, and `catch_unwind` does not contain it — the panic is immediate. iced never trips over this because it swaps in [`wasmtimer`](https://crates.io/crates/wasmtimer) on wasm. In your own code, use `web_sys`'s `performance.now()` or `gloo-timers`.

:::

### The atomics are real, but not atomic

On a stock build, `AtomicU32::fetch_add` returns correct results while emitting **no atomic instruction at all** — it degrades to a plain load, add, and store. Disassembling the same module shows the difference:

| Build flags                               | `i32.atomic.*` opcodes emitted |
| ----------------------------------------- | ------------------------------ |
| default                                   | **0**                          |
| `-C target-feature=+atomics,+bulk-memory` | **94**                         |

The target advertises `target_has_atomic="32"`, but `target_feature="atomics"` is **off by default** — capability present, feature disabled. This only matters once you have more than one thread, which is the next section.

### Real threads: rayon and shared memory

`rayon` works in a browser, but not by default. Three things are all required.

**1. Build with the threads feature and shared memory.** This needs nightly, because you are recompiling `std` so the atomics inside it become real:

```toml
# .cargo/config.toml
[unstable]
build-std = ["std", "panic_abort"]

[target.wasm32-unknown-unknown]
rustflags = [
    "-C", "target-feature=+atomics,+bulk-memory,+mutable-globals",
    "-C", "link-args=--shared-memory",
    "-C", "link-args=--max-memory=2147483648",
    "-C", "link-args=--import-memory",
    "-C", "link-args=--export=__wasm_init_tls",
    "-C", "link-args=--export=__tls_size",
    "-C", "link-args=--export=__tls_align",
    "-C", "link-args=--export=__tls_base",
]
```

**2. Serve with COOP and COEP.** A shared `WebAssembly.Memory` is only constructible in a cross-origin-isolated context. Without these headers the module fails to instantiate:

```text
Refused to execute 'WebAssembly.instantiate()': SharedArrayBuffer construction
requires a cross-origin isolated context (COOP: same-origin, COEP: require-corp)
```

Vite can send them in dev, which is the easy part:

```js
// vite.config.js
export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
```

For production they must be set by whatever serves `dist/`, since a `dist/` full of static files is usually behind nginx, Caddy, or a CDN.

```html
<meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin" />
<meta http-equiv="Cross-Origin-Embedder-Policy" content="require-corp" />
```

Every cross-origin resource must then also send `Cross-Origin-Resource-Policy: cross-origin`, or it is blocked. Note that `COOP: same-origin` severs `window.opener`, which breaks OAuth popups — use `BroadcastChannel` for that flow.

::: tip Use `bun` for the static server too
`bun run preview` does not send COOP/COEP. For a threaded build, serve `dist/` with a small server that does, or preview behind the same headers your production host uses.

:::

**3. Bootstrap the pool from a Web Worker.** This is the step that is easy to miss. rayon cannot discover worker threads on its own; `wasm-bindgen-rayon` self-spawns them and hands each one the module and the shared memory:

```js
import init, { initThreadPool } from "your-wasm-package";

await init({ module_or_path: wasmUrl });
await initThreadPool(navigator.hardwareConcurrency);
```

::: warning A naive test reports "1 thread"
`rayon::current_num_threads()` called from the **main thread** returns `1`, because the main thread is never part of the pool — only the spawned workers are. Measure from inside a parallel iterator, or from code already running on a pool thread, or you will conclude the setup failed when it worked.

:::

::: tip The workers must be ES modules
`initThreadPool` spawns its pool from a generated `workerHelpers.js` that hardcodes `new Worker(..., { type: 'module' })` and resolves your package with a dynamic `import('../../..')`. Both require module workers, so keep the output as ESM and do not let a bundler plugin rewrite worker chunks into a classic-script format. The generated file explains this in its own comments.

The full pattern, including your own worker entry, is in [Running WASM in a Worker](/web/worker).

:::

### What this means for an iced app

iced owns the main thread for rendering and input, so the frame loop cannot be made multithreaded — `view()`, layout, and drawing are inherently sequential.

CPU-bound work has two viable shapes:

- **A dedicated worker** running your engine, communicating over a `MessagePort` or an RPC handler, with iced rendering the results. This is the robust option.
- **A rayon pool** initialised at startup from a worker, used inside a `Task`. This is narrow and fragile: iced's `Task` executor is `wasm_bindgen_futures::spawn_local`, which is main-thread-bound, so the `Task` body does not run on a pool thread.

Prefer `Task` for async work and move genuinely CPU-bound loops into a separate worker.

## Tasks and executors

`Task`s run on the browser's microtask queue. The executor is resolved per target, so enabling a native executor feature does not force it here. Consequences:

- `thread-pool`, `tokio`, and `smol` are unavailable and inert.
- Anything CPU-bound blocks the UI thread. Do it in a Web Worker and communicate via a `Subscription`.
- `Task::abortable` maps onto promise cancellation, so debouncing still works.

The mechanism behind this is described in [Tasks & Subscriptions](/async#the-backend-is-resolved-per-target).

## See also

- [Build with Vite](/web/build) — project layout and scripts
- [Tasks & Subscriptions](/async) — what changes when there are no OS threads
- [Structuring Larger Apps](/scaling) — where to put global state
