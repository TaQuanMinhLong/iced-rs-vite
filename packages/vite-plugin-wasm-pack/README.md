# vite-plugin-wasm-pack

A Vite plugin that drives [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)
for you. It builds the crate when the dev server or build starts, watches the
Rust sources, rebuilds on change, and triggers the reload itself — so there is no
second terminal and no `cargo-watch` install.

Built for [iced](https://iced.rs) 0.14 apps, but nothing here is iced-specific:
it works with any `cdylib` crate that `wasm-pack` can build.

## Install

The plugin is currently a private workspace package, so it is consumed from source
rather than from a registry:

```json
{
  "devDependencies": {
    "vite-plugin-wasm-pack": "workspace:*"
  }
}
```

Requires `wasm-pack` on `PATH`:

```bash
cargo-binstall wasm-pack   # or: cargo install wasm-pack
```

## Usage

```ts
import { defineConfig } from "vite";
import wasmPack from "vite-plugin-wasm-pack";

export default defineConfig({
  plugins: [wasmPack()],
});
```

That is enough for the common case: the crate is the Vite root, `wasm-pack`
targets `web`, the output name falls back to the crate name, and the output lands
in `build/`. Point your entry file at it:

```ts
import init from "./build/<out-name>";
init();
```

## Options

Three keys, one per concern. Each keeps its own argument space:

```ts
wasmPack({
  crate: "crates/my_app",
  outDir: "build",

  wasmPack: {
    target: "web", // wasm-pack's own flags
    outName: "my_app",
  },

  cargo: {
    target: "wasm32-unknown-unknown", // cargo's, after `--`
    features: ["wasm"],
    args: ["-Z", "build-std=std,panic_abort"],
  },

  vite: {
    buildTarget: "esnext", // merged into Vite's build.target
    profile: "auto", // --dev while serving, --release on build
  },
});
```

| Option         | Default                           | Purpose                                             |
| -------------- | --------------------------------- | --------------------------------------------------- |
| `crate`        | `.`                               | Crate directory, relative to the Vite root          |
| `outDir`       | `build`                           | Where `wasm-pack` writes, relative to the Vite root |
| `watch`        | `[]`                              | Extra paths to watch, e.g. path dependencies        |
| `include`      | `\.(rs\|toml\|lock\|wgsl\|glsl)$` | Which changes trigger a rebuild                     |
| `bin`          | `wasm-pack`                       | Executable name                                     |
| `debounce`     | `150`                             | Milliseconds to coalesce rapid changes              |
| `buildOnStart` | `true`                            | Build once when the dev server or build starts      |
| `wasmPack`     | `{}`                              | wasm-pack flags, see below                          |
| `cargo`        | `{}`                              | cargo options, see below                            |
| `vite`         | `{}`                              | Vite-level overrides, see below                     |

## `wasmPack` — wasm-pack's own flags

Each maps to a real `wasm-pack` CLI flag:

| Option           | Flag                | Default    | Purpose                                             |
| ---------------- | ------------------- | ---------- | --------------------------------------------------- |
| `target`         | `--target`          | `web`      | `bundler`, `nodejs`, `web`, `no-modules`, `deno`    |
| `outName`        | `--out-name`        | crate name | Output file base name                               |
| `scope`          | `--scope`           | —          | npm scope for the generated `package.json`          |
| `mode`           | `--mode`            | —          | `no-install`, `normal`, `force`                     |
| `noTypescript`   | `--no-typescript`   | **`true`** | Skip the `.d.ts` beside the JS glue                 |
| `noPack`         | `--no-pack`         | **`true`** | Do not generate a `package.json`                    |
| `noOpt`          | `--no-opt`          | `false`    | Skip `wasm-opt`                                     |
| `panicUnwind`    | `--panic-unwind`    | `false`    | `panic=unwind` so panics can cross the FFI boundary |
| `weakRefs`       | `--weak-refs`       | `false`    | JS weak-references proposal                         |
| `referenceTypes` | `--reference-types` | `false`    | WebAssembly reference types                         |
| `extra`          | _(verbatim)_        | `[]`       | Appended as-is                                      |

### Why `noTypescript` and `noPack` default to `true`

A Vite app imports the glue as a local file, so the `.d.ts` and the generated
`package.json` describe an artifact nothing consumes — no `tsc` reads them, and
there is no package to publish. wasm-pack writes them by default, which leaves
four files in your build directory that are dead weight.

Set them to `false` if you do want them: `noTypescript: false` when you import
the glue from TypeScript you own, `noPack: false` when you plan to
`wasm-pack publish` the output.

`noOpt` is left off because it is already redundant while serving — `--dev`
skips `wasm-opt` regardless — and a shipping build usually wants it.

### Where did `profile` and `cargo` go?

`wasmPack.profile` was the odd one out: wasm-pack's `--profile` only forwards to
`cargo build`, so it is cargo's concern, not wasm-pack's. Same story for the old
`wasmPack.cargo` array. Both now live under the `cargo` key.

## `cargo` — arguments that reach `cargo build`

Everything here is placed **after** wasm-pack's `--` separator, where they belong:

| Option     | Default                    | Purpose                                        |
| ---------- | -------------------------- | ---------------------------------------------- |
| `target`   | `"wasm32-unknown-unknown"` | Triple to build; passed as `--target`          |
| `features` | `["wasm"]`                 | Enabled via `--no-default-features --features` |
| `profile`  | —                          | Cargo profile for `vite build` only            |
| `args`     | `[]`                       | Appended verbatim after `--`                   |

`features` pairs with `--no-default-features`: cargo's `--features` is additive
and would otherwise keep the crate's own `default` feature (typically a desktop
backend set) in the web build. Set `features: false` or `target: false` to leave
cargo's defaults alone.

`profile` is a shipping decision, so it applies to `vite build` only. The dev
server always builds `--dev`, whatever you set here: a custom profile is usually
optimised, and compiling that on every keystroke is slower for no benefit, plus
you lose the debuginfo you want when stepping through a stack.

## `vite` — what the plugin merges into Vite

| Option        | Default  | Purpose                                         |
| ------------- | -------- | ----------------------------------------------- |
| `buildTarget` | `esnext` | Vite `build.target`, only when you set no other |
| `profile`     | `auto`   | `auto` → `--dev` in serve, `--release` on build |

`buildTarget` deliberately defers to your own `build.target`; set it to `false`
to hand the decision back to Vite entirely.

## The `--` problem

wasm-pack has two argument spaces:

```text
wasm-pack build [OPTIONS] [PATH] [EXTRA_OPTIONS]...
                           ^^^^^^ ours        ^^^^^^^^^^^^^ positional, after `--`
```

Flags like `--target` and `--out-name` are wasm-pack's own. Anything cargo needs —
a second `--target`, `-Z build-std=...` — must go **after** a `--`.

This is a real failure, not a style preference. Putting a cargo option in `extra`
aborts the build:

```text
error: the argument '--target <TARGET>' cannot be used multiple times
```

So:

```ts
wasmPack({
  wasmPack: {
    target: "web", // wasm-pack's target
  },
  cargo: {
    args: ["-Z", "build-std=std,panic_abort"], // cargo's, after `--`
  },
});
```

> **You may not need `cargo.target` at all.**
> If `.cargo/config.toml` sets `build.target`, cargo picks it up on its own and
> the `wasm32-unknown-unknown` default is redundant. The plugin's default is
> still handy for repos where no such config exists.

## `build.target: "esnext"`

The plugin sets Vite's `build.target` to `esnext` when you have not set one
yourself, because the generated glue resolves the `.wasm` through `import.meta.url`:

```js
module_or_path = new URL("app_bg.wasm", import.meta.url);
```

Down-leveling that breaks the URL, so the bundle would fail to find the module at
runtime. Opt out with `vite.buildTarget = false` if you are not shipping wasm-bindgen
glue.

## How the dev loop works

1. `bun run dev` starts Vite, and the plugin runs `wasm-pack` once.
2. The plugin adds `src/`, `Cargo.toml`, `Cargo.lock`, and `build.rs` to the
   watcher, and ignores the output dir and `target/` so a build never triggers
   itself.
3. A matching file changes, changes are coalesced for `debounce` ms, then
   `wasm-pack` runs again.
4. On success the module graph is invalidated and one full reload is sent — once,
   after the last queued build, so the page never loads half-written output.

A failed build never kills the dev server. The error goes to the terminal and to
Vite's error overlay, and any client that connects later is sent the last error
too. During `vite build` a failure does fail the build.

## Options worth knowing

**Watching a path dependency.** Anything outside the crate needs adding
explicitly, otherwise edits to it are invisible:

```ts
wasmPack({ watch: ["crates/engine", "../shared"] });
```

**A crate elsewhere.** `crate` and `outDir` are both relative to the Vite root,
not to each other:

```ts
wasmPack({ crate: "crates/app", outDir: "build" });
```

## License

MIT
