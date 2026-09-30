import { defineConfig } from "vite";
import wasmPack from "vite-plugin-wasm-pack";

export default defineConfig({
  plugins: [wasmPack({ cargo: { profile: "wasm-release" } })],
});
