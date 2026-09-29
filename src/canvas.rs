// use crate::log;
// use wasm_bindgen::JsCast;

// pub fn init() -> Option<(
//     web_sys::HtmlCanvasElement,
//     web_sys::CanvasRenderingContext2d,
// )> {
//     let canvas = web_sys::window()
//         .and_then(|w| w.document())
//         .and_then(|d| d.get_element_by_id("app"))
//         .and_then(|e| e.dyn_into::<web_sys::HtmlCanvasElement>().ok());

//     if canvas.is_none() {
//         log::warn("Could not find canvas element");
//         return None;
//     }

//     let canvas = canvas.unwrap();

//     let context = canvas
//         .get_context("2d")
//         .ok()
//         .flatten()
//         .and_then(|c| c.dyn_into::<web_sys::CanvasRenderingContext2d>().ok());

//     if context.is_none() {
//         log::warn("Could not get 2D context");
//         return None;
//     }

//     let context = context.unwrap();

//     let dpr = web_sys::window()
//         .map(|w| w.device_pixel_ratio())
//         .unwrap_or(1.0);

//     canvas.set_width((dpr * canvas.client_width() as f64) as u32);
//     canvas.set_height((dpr * canvas.client_height() as f64) as u32);

//     if let Err(e) = context.set_transform(dpr, 0.0, 0.0, dpr, 0.0, 0.0) {
//         log::error_js(&e);
//         return None;
//     }

//     return Some((canvas, context));
// }
