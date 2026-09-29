# Running WASM in a Worker

iced cannot use multiple threads for rendering — it owns the main thread. But you can still get real parallelism by running a **second, headless WASM module inside a Web Worker**, bootstrapping a rayon thread pool there, and having iced receive results over a message channel.

This is the pattern behind production apps that pair an iced UI with a compute-heavy engine, and it is what your `fml` project does.

## The architecture

```text
┌─ main thread ──────────────────┐      ┌─ worker thread ──────────────────┐
│                                │      │                                  │
│  iced app                      │      │  wasm module (headless)          │
│   ├─ view / render (1 thread)  │      │   ├─ init()                      │
│   └─ Task ──postMessage──►     │      │   └─ initThreadPool(n)  ────►┐   │
│                                │      │                              │   │
│  Subscription ◄──onmessage──┐  │      │   rayon pool: n-1 workers ◄──┘   │
│                     │       │  │      │   (shared memory)                │
│                     └───────┴──┼──────┴──────────────────────────────────┘
└────────────────────────────────┘
```

Three properties make this work:

1. The worker is a **separate global scope** with its own `WebAssembly.Instance`, so it can own a rayon pool without fighting iced for the main thread.
2. Shared memory requires **atomics + bulk memory** at build time and **COOP/COEP** at serve time.
3. iced talks to it with **`MessagePort`**, which is structured-clone based and does not need shared memory itself.

::: warning The module in the worker is not your iced app
Do not call `iced::run` in the worker. iced needs a real window and an event loop, which only exist on the main thread. The worker should be a **plain `cdylib` that exports plain functions** — your engine — and returns data.

:::

## 1. Split the crate

Make the engine its own crate. The UI crate depends on iced; the engine crate knows nothing about it.

```text
workspace/
├── crates/
│   ├── engine/          → headless, compiled into the worker
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   └── app/             → iced, compiled for the main thread
│       ├── Cargo.toml
│       └── src/lib.rs
└── web/
    ├── index.html
    └── src/
        ├── main.js             → boots iced
        ├── worker.js           → worker entry
        └── wasm/               → wasm-pack output
```

## 2. Build flags

`crates/engine/.cargo/config.toml`, or the workspace root if you build from there:

```toml
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
    "--cfg", "getrandom_backend=\"wasm_js\"",
]
```

`build-std` requires **nightly** (`cargo +nightly build`), because you are recompiling `std` so the atomics inside it become real instructions.

::: tip wasm-opt must be told about threads too
Without this, `wasm-opt` strips the atomics pass and the whole thing breaks at link time.

```toml
# crates/engine/Cargo.toml
[package.metadata.wasm-pack.profile.release]
wasm-opt = ["--enable-threads", "--enable-bulk-memory", "-Oz"]
```

:::

## 3. Serve with COOP/COEP

A shared `WebAssembly.Memory` is only constructible in a cross-origin-isolated context.

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

Verify it took effect:

```js
console.log("isolated:", self.crossOriginIsolated); // must be true
```

If that is `false`, stop — everything else will fail confusingly.

::: warning Production needs the headers too
`vite preview` and most static hosts do not send them. For a threaded build, COOP/COEP must be set by whatever serves `dist/`.

:::

## 4. The engine crate

Export ordinary functions. Keep the API narrow and serialisable.

`crates/engine/Cargo.toml`:

```toml
[package]
name = "engine"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
wasm-bindgen-rayon = "1"
rayon = "1"
serde = { version = "1", features = ["derive"] }
gloo-utils = "0.1"
console_error_panic_hook = "0.1"

[package.metadata.wasm-pack.profile.release]
wasm-opt = ["--enable-threads", "--enable-bulk-memory", "-Oz"]
```

`crates/engine/src/lib.rs`:

```rust
use rayon::prelude::*;
use wasm_bindgen::prelude::*;

// Re-exported so JS can spin up the pool.
pub use wasm_bindgen_rayon::init_thread_pool;

#[derive(serde::Serialize, Clone)]
pub struct Row {
    pub id: u32,
    pub total: f64,
}

/// CPU-bound: rayon fans this across the worker pool.
#[wasm_bindgen]
pub fn compute_totals(values: Vec<f64>) -> Vec<Row> {
    let sums: Vec<f64> = values
        .par_iter()
        .enumerate()
        .map(|(i, v)| heavy(v) * (i as f64 + 1.0))
        .collect();

    sums.into_iter()
        .enumerate()
        .map(|(i, total)| Row { id: i as u32, total })
        .collect()
}

fn heavy(x: &f64) -> f64 {
    // Pretend this is expensive.
    let mut acc = *x;
    for _ in 0..10_000 {
        acc = acc.sin() + x.ln().abs();
    }
    acc
}

/// How many pool threads we actually got — useful for verifying the setup.
#[wasm_bindgen]
pub fn num_threads() -> usize {
    rayon::current_num_threads()
}

/// Runs on a pool thread, so this is a truthful measurement.
#[wasm_bindgen]
pub fn num_threads_from_pool() -> usize {
    rayon::current_num_threads()
}
```

::: warning Measure the pool from a pool thread
`rayon::current_num_threads()` called from the **main thread** returns `1`, because the main thread is never a pool member — only the spawned workers are. That single fact causes most "my threads do not work" false alarms. Measure from inside a parallel iterator, or from code already running on a pool thread.

:::

## 5. The worker entry

The worker initialises the module, starts the pool, then dispatches messages.

`web/src/worker.js`:

```js
import init, { compute_totals, num_threads_from_pool } from "./wasm/engine.js";
import wasmUrl from "./wasm/engine_bg.wasm?url";

let ready = null;

function boot() {
  ready ??= (async () => {
    await init({ module_or_path: wasmUrl });

    // Spin up the rayon pool. Everything after this can go parallel.
    await initThreadPool(Math.max(1, navigator.hardwareConcurrency - 1));

    return { threads: num_threads_from_pool() };
  })();

  return ready;
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  try {
    await boot();

    switch (type) {
      case "computeTotals":
        self.postMessage({ id, result: compute_totals(payload) });
        break;
      default:
        throw new Error(`unknown message: ${type}`);
    }
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
```

`navigator.hardwareConcurrency - 1` leaves a core for the UI thread; the main thread is not in the pool, so subtracting is a judgement call rather than a requirement.

::: warning Module format is not optional
Every worker here must be an **ES module**. This is not a style preference — it is what the rayon plumbing requires.

`wasm-bindgen-rayon` ships a generated `workerHelpers.js` that does two things a classic worker cannot:

```js
// 1. a dynamic import of your package, resolved relative to the helper
const pkg = await import("../../..");
await pkg.default(init);

// 2. a self-spawn with the module flag hardcoded
const worker = new Worker(new URL("./workerHelpers.js", import.meta.url), {
  type: "module",
});
```

So there are **two** worker types in play, and both are modules:

- **Your** `worker.js`, which holds the engine and the pool.
- **rayon's** `workerHelpers.js`, which `initThreadPool` spawns once per thread. You never write it, and you cannot change how it is loaded.

Consequences worth knowing:

- The output directory needs `"type": "module"` in its `package.json`. `wasm-pack --target web` already writes this, so the default is correct — but if you hand-rolled the output or changed the target, check it.
- Do **not** set `build.rollupOptions.output.format` to `iife`/`umd`, and do not add a plugin that converts worker chunks to a classic-script format. Either one silently breaks the pool.
- `new Worker(url)` without `{ type: 'module' }` throws on the first import, and the failure surfaces asynchronously — as a `Failed to fetch dynamically imported module` in the console rather than at construction.

:::

## 6. The client wrapper

Wrap the worker in a promise-based API so call sites stay readable.

`web/src/engine-client.js`:

```js
export function createEngine() {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });

  const pending = new Map();
  let nextId = 1;

  worker.onmessage = (event) => {
    const { id, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;

    pending.delete(id);
    error ? entry.reject(new Error(error)) : entry.resolve(result);
  };

  const call = (type, payload) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload });
    });

  return {
    computeTotals: (values) => call("computeTotals", values),
    dispose: () => worker.terminate(),
  };
}
```

::: tip Use `new URL('./worker.js', import.meta.url)`
Vite recognises that exact form and bundles the worker as its own chunk, rewriting its imports. A bare `new Worker('/src/worker.js')` works in dev and then breaks in production because the path is not hashed.

The `type: "module"` option is required for the reason given in [the section above](#_5-the-worker-entry) — drop it and the worker's own `import` statements fail at runtime.

## 7. Wire it into iced

The worker is plain JS, so reach it from iced through a subscription. The idiomatic shape is `once`-style bootstrapping into a channel.

`crates/app/src/lib.rs`:

```rust
use iced::futures::{channel::mpsc, SinkExt};
use iced::{Element, Subscription, Task};
use serde::Deserialize;
use wasm_bindgen::JsValue;

#[derive(Debug, Clone)]
enum Message {
    ResultsReceived(String),
    ComputeFailed(String),
}

#[derive(Default)]
struct App {
    engine: Option<EngineHandle>,
    status: String,
}

#[derive(Debug, Clone, Deserialize)]
struct Row {
    id: u32,
    total: f64,
}

fn subscription(state: &App) -> Subscription<Message> {
    let Some(engine) = state.engine.as_ref() else {
        return Subscription::none();
    };

    iced::subscription::channel("engine", 100, |mut output| async move {
        loop {
            match engine.recv().await {
                Ok(RawMessage::Results(json)) => {
                    let rows: Vec<Row> = serde_json::from_str(&json)
                        .unwrap_or_default();
                    let text = rows
                        .iter()
                        .map(|r| format!("{}: {:.2}", r.id, r.total))
                        .collect::<Vec<_>>()
                        .join("\n");

                    output.send(Message::ResultsReceived(text)).await.ok();
                }
                Ok(RawMessage::Error(e)) => {
                    output.send(Message::ComputeFailed(e)).await.ok();
                }
                Err(e) => {
                    output.send(Message::ComputeFailed(e.to_string())).await.ok();
                    break;
                }
            }
        }
    })
}
```

Three things to note about that channel:

- **`channel(state, capacity, f)`** gives you a `mpsc::Sender` you push into, and the returned future runs for the subscription's lifetime.
- **`SinkExt::send`** is async and must be awaited. Dropping it without awaiting silently discards the message.
- The loop runs for as long as the subscription is alive, which is what makes it a long-lived pipe rather than a one-shot task.

## Shipping it

```bash
wasm-pack build crates/app   --target web --out-dir web/src/wasm
wasm-pack build crates/engine --target web --out-dir web/src/wasm/engine
```

```json
{
  "scripts": {
    "wasm": "bun run wasm:app && bun run wasm:engine",
    "wasm:app": "cargo +nightly build -p app --target wasm32-unknown-unknown --release",
    "wasm:engine": "cargo +nightly build -p engine --target wasm32-unknown-unknown --release",
    "dev": "bun run wasm && vite"
  }
}
```

## Common issues

### `SharedArrayBuffer construction requires a cross-origin isolated context`

`self.crossOriginIsolated` is `false`. The COOP/COEP headers are missing or one of the two is wrong — both are required, and `Cross-Origin-Embedder-Policy` must be `require-corp` or `credentialless`.

### `Failed to fetch dynamically imported module`

`wasm-bindgen-rayon` generates `workerHelpers.js`, which resolves its own entry via `import('../../..')`. That only resolves correctly through a bundler. Serving a raw `pkg/` directory from a static server breaks every worker — which is another reason to keep this in Vite.

### The pool reports 1 thread

Almost always a measurement mistake, not a setup failure. Confirm by calling `num_threads_from_pool()` from inside a parallel iterator rather than from the main thread. If it is genuinely 1, check that `build-std` actually recompiled `std` and that the `wasm-opt` flags include `--enable-threads`.

### Workers hang and never respond

`worker.onerror` is not set, so failures are silent. Always attach it during development:

```js
worker.onerror = (e) => console.error("[worker]", e.message, e.filename, e.lineno);
worker.onmessageerror = (e) => console.error("[worker] undeserialisable message", e);
```

A `postMessage` payload containing a class instance, a function, or a `Proxy` throws here rather than in your Rust code.

## See also

- [Renderers & Threads](/web/threads) — the atomics and COOP/COEP details in isolation
- [Build with Vite](/web/build) — bundler setup
- [Tasks & Subscriptions](/async) — the runtime-agnostic mechanism behind `channel`
