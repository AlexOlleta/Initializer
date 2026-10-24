use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{Builder, Rotation};

use crate::store::APP_DIR_NAME;

pub fn init() -> Option<WorkerGuard> {
    let dir = dirs::data_local_dir()?.join(APP_DIR_NAME).join("logs");
    let appender = Builder::new()
        .rotation(Rotation::DAILY)
        .filename_prefix("initializer")
        .filename_suffix("log")
        .max_log_files(7)
        .build(dir)
        .ok()?;
    let (writer, guard) = tracing_appender::non_blocking(appender);
    tracing_subscriber::fmt()
        .with_writer(writer)
        .with_ansi(false)
        .with_max_level(tracing::Level::INFO)
        .init();
    Some(guard)
}
