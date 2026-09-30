# Build with Vite

iced ships as a WebAssembly module, so any bundler that can load a `.wasm` file works. Vite is the usual choice when the app sits inside a larger JS/TS codebase; Trunk is simpler when Rust is the only thing you touch.

This page is a complete, verified walkthrough for iced **0.14**.

## Prerequisites

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

## Project layout

The Rust crate lives _inside_ the Vite project, and `wasm-pack` writes its output into `build/`:

```text
my-app/
├── index.html
├── vite.config.js
├── package.json
├── crate/
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
└── build/               ← generated, do not edit
    ├── my_iced_app.js
    └── my_iced_app_bg.wasm
```

`build/` is the plugin's default `outDir`, and it does not collide with Vite's own `dist/` bundle. `wasm-pack` writes a `.gitignore` containing `*` into its output directory, so `build/` is already excluded. Add it to your own `.gitignore` too if you would rather not depend on that.

Scaffold the front end with `bun`:

```bash
bun create vite my-app --template vanilla
cd my-app
bun install

# `crate` is a Rust keyword, so the package name must be set explicitly
cargo new --lib crate --name my_iced_app
```

::: warning `cargo new --lib crate` fails on its own
`crate` is a reserved Rust keyword, so Cargo rejects it as a package name:

```text
error: invalid package name `crate`: it is a Rust keyword
```

The **directory** can still be called `crate` — only the package name matters, so pass `--name my_iced_app`. Naming the directory `iced-app` or `wasm-crate` works too if you prefer.

:::

## The Cargo manifest

`crate/Cargo.toml`:

```toml
[package]
name = "my_iced_app"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
iced = { version = "0.14", features = ["webgl"] }
wasm-bindgen = "0.2"
console_error_panic_hook = "0.1"
```

`crate-type = ["cdylib", "rlib"]` is required: `cdylib` is what `wasm-pack` links, and `rlib` keeps the crate usable as a normal library.

## The app

A `cdylib` never runs `fn main`, so startup is driven by `#[wasm_bindgen(start)]`. This runs during module instantiation, i.e. from inside `init()`.

`crate/src/lib.rs`:

```rust
use iced::widget::{button, column, text};
use iced::Element;
use wasm_bindgen::prelude::*;

#[derive(Default)]
struct Counter {
    value: i32,
}

#[derive(Debug, Clone)]
enum Message {
    Increment,
    Decrement,
}

impl Counter {
    fn update(&mut self, message: Message) {
        match message {
            Message::Increment => self.value += 1,
            Message::Decrement => self.value -= 1,
        }
    }

    fn view(&self) -> Element<'_, Message> {
        column![
            button("+").on_press(Message::Increment),
            text(self.value).size(40),
            button("-").on_press(Message::Decrement),
        ]
        .padding(20)
        .into()
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();

    iced::run(Counter::update, Counter::view).unwrap();
}
```

::: warning `run` no longer takes a title
The three-argument `iced::run(update, view)` signature is current for 0.14. Older examples such as `iced::run("Title", update, view)` are from 0.13 and **will not compile** — the title moved to a builder method.

If you want a window title, use `application`:

```rust
iced::application(Counter::default, Counter::update, Counter::view)
    .title(|_: &Counter| "Counter".to_owned())
    .run()
    .unwrap();
```

Note the first argument is the **initial state**, not a name, and the title closure must return an owned `String`.

:::

## The HTML shell

iced injects its canvas into the page, so the shell stays minimal. `html, body` must have a real height or the canvas ends up zero-sized.

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>iced + Vite</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

## Loading the module

`src/main.js`:

```js
import init from "./wasm/my_iced_app.js";

// `start()` runs automatically once the module initializes
init();
```

The default export is `async init(module_or_path?)`. Without arguments it fetches the `.wasm` next to the JS file, which Vite resolves correctly because it rewrites the reference to the hashed asset.

Vite emits the module as a separate asset rather than inlining it, so the production layout is:

```text
dist/
├── index.html
└── assets/
    ├── index-<hash>.js
    └── my_iced_app_bg-<hash>.wasm     ← ~5.8 MB unoptimized
```

## Vite config

`vite.config.js`:

```js
import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "esnext" },
});
```

`target: 'esnext'` keeps optional chaining and friends intact; Vite would otherwise down-level them for older browsers.

## Scripts

`package.json`:

```json
{
  "scripts": {
    "wasm": "wasm-pack build crate --target web --out-dir ../build --dev",
    "wasm:release": "wasm-pack build crate --target web --out-dir ../build --release",
    "dev": "bun run wasm && vite",
    "build": "bun run wasm:release && vite build",
    "preview": "vite preview"
  }
}
```

```bash
bun run dev      # debug wasm build + dev server
bun run build    # optimized wasm + production bundle
bun run preview
```

::: warning Always use `--release` for anything you ship
A debug iced WASM binary is roughly **5.8 MB** unoptimized. `wasm-pack` runs `wasm-opt` in release, and the size drop is dramatic. Do not deploy the dev build.

:::

To cut the binary further:

```toml
# workspace Cargo.toml
[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
```

## The dev loop

iced has no hot state swapping, so a Rust change means a full rebuild and reload. The simplest option needs a second terminal:

```bash
cargo install cargo-watch
cargo watch -w crate/src -s "bun run wasm"
```

Run it alongside `bun run dev`. When `build` changes, the page reloads.

### Doing it in one process with a plugin

A Vite plugin can own the whole loop — build on startup, watch the Rust sources, rebuild, and trigger the reload itself — so no second terminal and no `cargo-watch` install. This template ships one, `vite-plugin-wasm-pack` (see its README under `packages/` for options), which does all of that.

`vite.config.js`:

```js
import { defineConfig } from "vite";
import wasmPack from "vite-plugin-wasm-pack";

export default defineConfig({
  plugins: [
    wasmPack({
      crate: "crate",
      // Defaults worth knowing: `outDir` is `build`, `wasmPack.target` is
      // `web`, and `outName` falls back to the crate name.
      wasmPack: {
        outName: "my_iced_app",
      },
    }),
  ],
  build: { target: "esnext" },
});
```

Then the scripts collapse to plain Vite commands, because the plugin runs `wasm-pack` itself:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

The plugin picks `--dev` while serving and `--release` for `vite build` automatically.

#### Two argument spaces, not one

This is the part worth getting right. `wasm-pack build` has **two** separate argument spaces:

```text
wasm-pack build [OPTIONS] [PATH] [EXTRA_OPTIONS]...
                            ^^^^^^ wasm-pack's own flags
                                          ^^^^^^^^^^^^^ cargo's, only valid after `--`
```

A second `--target` and `-Z build-std=...` are **cargo** options. Passing them as ordinary flags aborts the build:

```text
error: the argument '--target <TARGET>' cannot be used multiple times
```

So the plugin keeps them apart. Everything under `cargo` reaches past `--`; everything under `wasmPack` stays in wasm-pack's own argument space:

```js
wasmPack({
  crate: "crate",
  wasmPack: {
    target: "web",      // wasm-pack's own flags
    scope: "@scope",
    noTypescript: false,
  },
  cargo: {
    // forwarded to `cargo build`, placed after `--`
    args: ["-Z", "build-std=std,panic_abort"],
  },
});
```

::: tip You need this for threaded builds
The `-Z build-std=std,panic_abort` above is what recompiles `std` so the atomics inside it become real. Without it, the [rayon and shared-memory setup](/web/threads#real-threads-rayon-and-shared-memory) silently degrades to single-threaded.

:::

#### What it does about reload safety

Two details that a naive setup gets wrong, both of which cause intermittent "it half-loaded" failures:

- **The output directory is excluded from Vite's watcher.** Otherwise Vite can fire a reload while `wasm-pack` is still writing the `.js` and `.wasm`, and the page loads a truncated module.
- **Reloads are coalesced.** Rapid edits collapse into a single queued build, and the reload is sent only after the last one finishes, so the page never loads half-written output.

On a build failure the dev server **stays alive** and reports the compiler error in the Vite overlay, rather than exiting. That matters when a typo means you would otherwise lose the server.

::: tip Debug builds are slow to iterate on
Each `wasm-pack` build in dev mode takes tens of seconds with iced in the dependency graph — expect 3–10s once dependencies are warm. Keep the crate small and watch only `crate/src`.

:::

## Mounting the canvas somewhere specific

By default iced appends its canvas to `document.body`. You can choose a different host element instead of moving the canvas after startup:

`crate/src/lib.rs`:

```rust
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();

    iced::application(Counter::default, Counter::update, Counter::view)
        .window({
            let mut settings = iced::window::Settings::default();
            settings.platform_specific.target = Some(String::from("iced-root"));
            settings
        })
        .run()
        .unwrap();
}
```

`index.html`:

```html
<body>
  <div id="iced-root"></div>
  <script type="module" src="/src/main.js"></script>
</body>
```

The default target is the id `iced`. **The matching element is replaced** by the canvas, so it should be an empty container with the height you want.

::: warning The value is a CSS id selector, without `#`
It is interpolated as `#{target}`, so pass `"iced-root"`, not `"#iced-root"`. A leading `#` silently fails to match and the canvas falls back to `document.body`.

:::

## Common issues

### Blank canvas with no error

Usually the renderer, not the app. Check what you actually got, because Cargo's resolver is the only authority:

```bash
cargo tree -e features -i wgpu | grep 'wgpu feature'
```

If `webgl` is missing, your build is WebGPU-only and shows nothing on Safari or any blocklisted GPU. See [Renderers & Threads](/web/threads).

The second cause is sizing: confirm the canvas has non-zero dimensions, since `height: 100%` on `html, body` is mandatory.

### `getrandom` compile error

A dependency pulls in `rand`, which needs an entropy backend. For 0.14-era crates this is usually getrandom 0.3, which is configured by `cfg` rather than a feature:

```toml
# .cargo/config.toml
[target.wasm32-unknown-unknown]
rustflags = ["--cfg", "getrandom_backend=\"wasm_js\""]
```

Older getrandom 0.2 uses a feature instead:

```toml
getrandom = { version = "0.2", features = ["js"] }
```

### Too many concurrent wasm modules

SharedArrayBuffer is a scarce global resource. If the browser refuses to instantiate, another tab or worker is holding it. See [Renderers & Threads](/web/threads).

## See also

- [Web Target](/web/) — overview and inert features
- [Renderers & Threads](/web/threads) — WebGL2, atomics, rayon
- [Browser Gotchas](/web/gotchas) — input, clipboard, files
