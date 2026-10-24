#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use initializer_lib::{headless, logging, run_gui};

fn main() {
    let guard = logging::init();
    let args: Vec<String> = std::env::args().collect();
    if let Some(preset_id) = headless::preset_id_from_args(&args) {
        let code = headless::run(preset_id);
        drop(guard);
        std::process::exit(code);
    }
    run_gui();
}
