//! Desktop entry point. Build with `cargo run --features native`; the default
//! `wasm` feature has no windowing backend, so this binary does not compile
//! without it.
#[cfg(feature = "native")]
fn main() -> iced::Result {
    app::run()
}

#[cfg(not(feature = "native"))]
fn main() {
    eprintln!("The `native` feature must be enabled to run this binary");
    std::process::exit(1);
}
