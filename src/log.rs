use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(msg: String);

    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log(msg: String);

    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error_js(value: &JsValue);

    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    fn console_warn(msg: String);

    type Error;

    #[wasm_bindgen(constructor)]
    fn new() -> Error;

    #[wasm_bindgen(structural, method, getter)]
    fn stack(error: &Error) -> String;
}

fn hook(info: &std::panic::PanicHookInfo) {
    let e = Error::new();
    let mut msg = info.to_string();
    msg.push_str("\n\nStack:\n\n");
    msg.push_str(&e.stack());
    msg.push_str("\n\n");

    error(msg)
}

#[inline]
pub fn init() {
    use std::sync::Once;
    static SET_HOOK: Once = Once::new();
    SET_HOOK.call_once(|| {
        std::panic::set_hook(Box::new(hook));
    });
}

#[inline]
pub fn info(msg: impl Into<String>) {
    console_log(msg.into())
}

// #[inline]
// pub fn warn(msg: impl Into<String>) {
//     console_warn(msg.into())
// }

#[inline]
pub fn error(msg: impl Into<String>) {
    console_error(msg.into())
}

// #[inline]
// pub fn error_js(value: &JsValue) {
//     console_error_js(value)
// }
