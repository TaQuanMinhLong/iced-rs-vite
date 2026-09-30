import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { spawn } from "node:child_process";
import path from "node:path";
import { normalizePath } from "vite";

const PLUGIN_NAME = "vite-plugin-wasm-pack";

/** wasm-pack's own boolean flags, mapped to their CLI names. */
const WASM_PACK_FLAGS = {
  noTypescript: "--no-typescript",
  weakRefs: "--weak-refs",
  referenceTypes: "--reference-types",
  noPack: "--no-pack",
  noOpt: "--no-opt",
  panicUnwind: "--panic-unwind",
} as const satisfies Record<string, string>;

type WasmPackFlagName = keyof typeof WASM_PACK_FLAGS;

const PROFILES = ["dev", "release", "profiling"] as const;
const TARGETS = ["bundler", "nodejs", "web", "no-modules", "deno"] as const;
const MODES = ["no-install", "normal", "force"] as const;

export type BuildProfile = (typeof PROFILES)[number];
export type WasmPackTarget = (typeof TARGETS)[number];
export type WasmPackMode = (typeof MODES)[number];

/**
 * wasm-pack's own flags.
 *
 * These are deliberately separate from `cargo`, because wasm-pack has two
 * distinct argument spaces:
 *
 * ```text
 * wasm-pack build [OPTIONS] [PATH] [EXTRA_OPTIONS]...
 *                            ^^^^^^ ours        ^^^^^^^^^^^^^ positional, after `--`
 * ```
 */
export interface WasmPackFlags {
  /** Environment the output targets. `web` for a Vite + ES-module setup. */
  target?: WasmPackTarget;
  /** npm scope for the generated `package.json`, e.g. `@fidt`. */
  scope?: string;
  /** Which wasm-pack steps to run. */
  mode?: WasmPackMode;
  /** Output file base name. Defaults to the crate name. */
  outName?: string;
  /**
   * Generate the `.d.ts` beside the JS glue. Off by default: it describes an
   * artifact Vite serves to a browser, not a library anything type-checks
   * against. Set it to `false` if you import the glue from TypeScript you own.
   */
  noTypescript?: boolean;
  /** Enable the JS weak-references proposal. */
  weakRefs?: boolean;
  /** Enable WebAssembly reference types. */
  referenceTypes?: boolean;
  /**
   * Generate a `package.json` for the output. Off by default: the output is
   * consumed as local files, so the manifest and `README.md` wasm-pack writes
   * are pure noise. Set it to `false` if you intend to `wasm-pack publish`.
   */
  noPack?: boolean;
  /**
   * Skip `wasm-opt`. Not needed while serving, because `--dev` already skips
   * it; set it to cut the pass from a shipping build too.
   */
  noOpt?: boolean;
  /** Build with `panic=unwind` so panics can be caught at the FFI boundary. */
  panicUnwind?: boolean;
  /** Extra wasm-pack flags, appended verbatim. */
  extra?: string[];
}

/**
 * Arguments that reach `cargo build`, after wasm-pack's `--` separator. All of
 * these are cargo's business, which is exactly why they live together here
 * rather than pretending to be wasm-pack flags.
 */
export interface CargoOptions {
  /**
   * Target triple to build for, passed after `--`.
   *
   * Defaults to `wasm32-unknown-unknown`, so no `.cargo/config.toml`
   * `build.target` is needed — the target travels with the build instead of
   * being pinned for every cargo command in the repo. Set it to `false` to let
   * cargo decide (e.g. when a workspace already sets `build.target`).
   */
  target?: string | false;
  /**
   * Cargo features to enable for the web build.
   *
   * Default: `["wasm"]`. The build uses `--no-default-features` together with
   * this list, because `--features` is additive and would otherwise keep the
   * crate's own `default` feature — typically a desktop-backend set — in play.
   * Set it to `false` to leave cargo's defaults alone entirely.
   */
  features?: string[] | false;
  /**
   * A user-defined cargo profile, e.g. `cargo build --profile my-profile`.
   *
   * Applies to `vite build` only. The dev server keeps wasm-pack's own `--dev`
   * regardless: a custom profile is a shipping concern, and optimising a build
   * that gets thrown away on the next keystroke just makes iteration slower
   * while dropping the debuginfo you want when stepping through a stack.
   */
  profile?: string;
  /**
   * Extra arguments placed after `--`, forwarded to `cargo build` verbatim.
   *
   * A second `--target` and `-Z build-std=...` belong here (or in `target`).
   * They are positional cargo options, so putting them in wasm-pack's `extra`
   * aborts the build with `the argument '--target <TARGET>' cannot be used
   * multiple times`.
   */
  args?: string[];
}

/**
 * Vite-level overrides the plugin merges into the resolved Vite config.
 * `buildTarget` feeds straight into Vite's `build.target`; `profile` decides
 * which wasm-pack build command to run based on Vite's command (`serve` vs
 * `build`).
 */
export interface ViteOptions {
  /**
   * Vite `build.target` for projects that do not set one themselves.
   *
   * Defaults to `esnext`, which the generated glue needs: it resolves the
   * `.wasm` file through `import.meta.url`, and down-leveling that breaks the
   * URL. Set this to `false` to leave `build.target` untouched.
   */
  buildTarget?: string | false;
  /**
   * `auto` builds `--dev` while serving and `--release` for `vite build`.
   * Ignored when `cargo.profile` is set.
   */
  profile?: BuildProfile | "auto";
}

export interface WasmPackPluginOptions {
  /** Crate directory, relative to the Vite root. Defaults to the root itself. */
  crate?: string;
  /**
   * Where wasm-pack writes its output, relative to the Vite root.
   *
   * Defaults to `build`. Point the entry import at `build/<out-name>.js` to
   * match. Vite's own bundle output is `dist/`, so the two never collide.
   */
  outDir?: string;
  /** Extra files or directories to watch, e.g. path dependencies. */
  watch?: string[];
  /** Which changed files trigger a rebuild. */
  include?: RegExp;
  /** wasm-pack executable. */
  bin?: string;
  /** Milliseconds to coalesce rapid changes before rebuilding. */
  debounce?: number;
  /** Everything that reaches `cargo build`. See [`CargoOptions`]. */
  cargo?: CargoOptions;
  /** Vite-level overrides. See [`ViteOptions`]. */
  vite?: ViteOptions;
  /** Build once when the dev server or build starts. */
  buildOnStart?: boolean;
  /** wasm-pack flags. */
  wasmPack?: WasmPackFlags;
}

interface Result {
  ok: boolean;
  output: string;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI escape codes
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

const tail = (s: string, lines = 60) => stripAnsi(s).trimEnd().split("\n").slice(-lines).join("\n");

const isInside = (file: string, dir: string) => {
  const f = normalizePath(file);
  return f === dir || f.startsWith(`${dir}/`);
};

export default function wasmPack(options: WasmPackPluginOptions = {}): Plugin {
  const {
    crate = ".",
    outDir = "build",
    watch = [],
    include = /\.(rs|toml|lock|wgsl|glsl)$/,
    bin = "wasm-pack",
    cargo = {},
    vite = {},
    debounce = 150,
    buildOnStart = true,
    wasmPack: pack = {},
  } = options;

  const { target: cargoTarget = "wasm32-unknown-unknown", features: cargoFeatures = ["wasm"] } = cargo;
  const { buildTarget = "esnext", profile = "auto" } = vite;

  // A Vite app imports the glue as a local file, so the `.d.ts` and the
  // `package.json` describe an artifact nobody consumes. Both default off;
  // set `noTypescript: false` / `noPack: false` to have wasm-pack write them.
  const packFlags = { ...pack, noTypescript: pack.noTypescript ?? true, noPack: pack.noPack ?? true };

  let root = process.cwd();
  let crateDir = "";
  let outPath = "";
  let watchPaths: string[] = [];
  let command = "serve";
  // `console` is a structural subset of Vite's Logger, so a no-op stands in
  // until configResolved supplies the real one.
  let logger: Pick<ResolvedConfig["logger"], "info" | "error"> = {
    info: () => {},
    error: () => {},
  };

  let building = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let initialBuildStarted = false;
  let lastError: { message: string; stack: string; plugin: string } | null = null;

  /**
   * The wasm-pack profile flag: `--dev` while serving, `--release` on build,
   * unless `vite.profile` pins one.
   */
  const resolvedProfile = (): BuildProfile =>
    profile === "auto" ? (command === "serve" ? "dev" : "release") : profile;

  /**
   * The profile to build with, as cargo sees it.
   *
   * Dev is the one case a user profile must not reach: it is a fast, debuggable
   * build by definition. Everywhere else a user-defined profile replaces the
   * dev/release/profiling choice.
   */
  const cargoProfile = (): string | undefined => (command === "serve" ? undefined : cargo.profile);

  /**
   * Builds the argument vector, keeping wasm-pack flags and cargo passthrough
   * args in their separate spaces.
   */
  function buildArgs(): string[] {
    const target = pack.target ?? "web";
    if (!TARGETS.includes(target)) {
      throw new Error(`[${PLUGIN_NAME}] invalid target "${target}"; expected one of ${TARGETS.join(", ")}`);
    }
    if (pack.mode && !MODES.includes(pack.mode)) {
      throw new Error(`[${PLUGIN_NAME}] invalid mode "${pack.mode}"; expected one of ${MODES.join(", ")}`);
    }

    const chosen = resolvedProfile();
    if (!PROFILES.includes(chosen)) {
      throw new Error(`[${PLUGIN_NAME}] invalid profile "${chosen}"; expected one of ${PROFILES.join(", ")}`);
    }

    const outRelToCrate = normalizePath(path.relative(crateDir, outPath));
    const args = ["build", crateDir, "--target", target, "--out-dir", outRelToCrate];

    // A user-defined cargo profile replaces dev/release/profiling. It belongs
    // to cargo, so it is read from `cargo.profile`, but wasm-pack needs it as
    // its own flag (`--profile`) to forward it. `cargoProfile()` already keeps
    // it out of serve, where the plugin owns the choice.
    const userProfile = cargoProfile();
    if (userProfile) args.push("--profile", userProfile);
    else args.push(`--${chosen}`);

    if (pack.scope) args.push("--scope", pack.scope);
    if (pack.outName) args.push("--out-name", pack.outName);
    if (pack.mode) args.push("--mode", pack.mode);

    for (const name of Object.keys(WASM_PACK_FLAGS) as WasmPackFlagName[]) {
      if (packFlags[name]) args.push(WASM_PACK_FLAGS[name]);
    }

    if (pack.extra?.length) args.push(...pack.extra);

    // Everything from here on is for `cargo build`, so it must sit after `--`.
    // wasm-pack validates its own flags strictly and rejects anything it does
    // not recognise, including cargo's `--features` and `--target`.
    const passthrough = [...(cargo.args ?? [])];

    // A `--target` in `cargo.args` is the user's explicit choice, so it wins
    // and we do not append a second one — cargo rejects the duplicate outright.
    const userPickedTarget = passthrough.some((a) => a === "--target" || a.startsWith("--target="));

    if (cargoTarget && !userPickedTarget) {
      passthrough.unshift("--target", cargoTarget);
    }

    // Cargo features are additive, so `--features wasm` alone would keep the
    // crate's `default` feature on top of `wasm`. That leaks desktop backends
    // into the web build, so drop defaults and enable exactly what we need.
    if (Array.isArray(cargoFeatures) && cargoFeatures.length) {
      passthrough.push("--no-default-features", "--features", cargoFeatures.join(","));
    }

    if (passthrough.length) args.push("--", ...passthrough);

    return args;
  }

  /** Runs wasm-pack once. Never rejects. */
  function runWasmPack(): Promise<Result> {
    let args: string[];
    try {
      args = buildArgs();
    } catch (err) {
      return Promise.resolve({ ok: false, output: (err as Error).message });
    }

    return new Promise((resolve) => {
      let output = "";
      const child = spawn(bin, args, {
        cwd: root,
        shell: process.platform === "win32",
        env: { ...process.env, CARGO_TERM_COLOR: "never" },
      });

      child.stdout.on("data", (d: Buffer) => (output += d));
      child.stderr.on("data", (d: Buffer) => (output += d));
      child.on("error", (err) => {
        resolve({
          ok: false,
          output: `Failed to start "${bin}": ${err.message}\nIs wasm-pack installed? (cargo install wasm-pack)`,
        });
      });
      child.on("close", (code) => resolve({ ok: code === 0, output }));
    });
  }

  const fail = (message: string) => {
    lastError = { message, stack: "", plugin: PLUGIN_NAME };
    return lastError;
  };

  /** Dev-server rebuild. Coalesces changes that arrive while a build runs. */
  async function rebuild(server: ViteDevServer, reason: string) {
    if (building) {
      pending = true;
      return;
    }
    building = true;

    try {
      do {
        pending = false;
        const started = performance.now();
        logger.info(`[wasm] change in ${reason}, rebuilding...`, { timestamp: true });

        const result = await runWasmPack();
        const ms = Math.round(performance.now() - started);

        if (result.ok) {
          lastError = null;
          logger.info(`[wasm] rebuilt in ${ms}ms`, { timestamp: true });

          // The output dir is ignored by Vite's watcher, so drop cached
          // transforms by hand, then reload once (and only after the last
          // queued build, so the page never loads half-written output).
          server.moduleGraph.invalidateAll();
          if (!pending) server.ws.send({ type: "full-reload", path: "*" });
        } else {
          const message = tail(result.output);
          logger.error(`[wasm] build failed\n${message}`, { timestamp: true });
          server.ws.send({ type: "error", err: fail(`wasm-pack build failed\n\n${message}`) });
        }
      } while (pending);
    } finally {
      building = false;
    }
  }

  return {
    name: PLUGIN_NAME,

    config(userConfig) {
      root = path.resolve(userConfig.root ?? process.cwd());
      crateDir = normalizePath(path.resolve(root, crate));
      outPath = normalizePath(path.resolve(root, outDir));

      watchPaths = [
        path.join(crateDir, "src"),
        path.join(crateDir, "Cargo.toml"),
        path.join(crateDir, "Cargo.lock"),
        path.join(crateDir, "build.rs"),
        ...watch.map((p) => path.resolve(root, p)),
      ].map(normalizePath);

      const cargoTarget = normalizePath(path.join(crateDir, "target"));

      // Only fill in `build.target` when the project has not chosen one, since
      // a user value is more specific than our default.
      const userTarget = userConfig.build?.target;
      const target = buildTarget === false || userTarget ? undefined : buildTarget;

      return {
        build: target ? { target } : {},
        server: {
          watch: {
            // - wasm-pack output: we reload manually once the build finished,
            //   otherwise Vite may reload while .js and .wasm are half written.
            // - cargo's target dir: huge, and irrelevant to the browser.
            ignored: [(p: string) => isInside(p, outPath) || isInside(p, cargoTarget)],
          },
        },
      };
    },

    configResolved(config) {
      command = config.command;
      logger = config.logger;
    },

    async buildStart() {
      // buildStart also runs on every rebuild of `vite build --watch`; only build once.
      if (!buildOnStart || initialBuildStarted) return;
      initialBuildStarted = true;

      const started = performance.now();
      logger.info(`[wasm] building crate "${crate}" (${cargoProfile() ?? resolvedProfile()})...`, {
        timestamp: true,
      });

      const result = await runWasmPack();
      const ms = Math.round(performance.now() - started);

      if (result.ok) {
        logger.info(`[wasm] built in ${ms}ms`, { timestamp: true });
        return;
      }

      const message = tail(result.output);
      if (command === "build") {
        // Fail the production build.
        this.error(`wasm-pack build failed\n\n${message}`);
      }

      // In dev keep the server alive; the overlay shows the error once a client connects.
      logger.error(`[wasm] initial build failed\n${message}`, { timestamp: true });
      fail(`wasm-pack build failed\n\n${message}`);
    },

    configureServer(server) {
      server.watcher.add(watchPaths);

      const onFsEvent = (file: string) => {
        const f = normalizePath(file);
        if (isInside(f, outPath)) return;
        if (!watchPaths.some((p) => isInside(f, p))) return;
        if (!include.test(f)) return;

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          rebuild(server, path.relative(root, file));
        }, debounce);
      };

      server.watcher.on("change", onFsEvent);
      server.watcher.on("add", onFsEvent);
      server.watcher.on("unlink", onFsEvent);

      // Show a failed initial build to clients that connect afterwards.
      server.ws.on("connection", () => {
        if (lastError) server.ws.send({ type: "error", err: lastError });
      });
    },
  };
}
