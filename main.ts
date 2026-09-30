import init from "./build/app";

// `#[wasm_bindgen(start)]` runs during instantiation, so calling init()
// is all that is needed to boot the app.
init();
