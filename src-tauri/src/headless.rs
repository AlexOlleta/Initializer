use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::model::Language;
use crate::store::Store;
use crate::{browsers, launcher, notify, win};

pub const RUN_FLAG: &str = "--run";

pub fn preset_id_from_args(args: &[String]) -> Option<Option<Uuid>> {
    let index = args.iter().position(|arg| arg == RUN_FLAG)?;
    Some(
        args.get(index + 1)
            .and_then(|raw| Uuid::parse_str(raw).ok()),
    )
}

pub fn run(preset_id: Option<Uuid>) -> i32 {
    match execute(preset_id) {
        Ok(0) => 0,
        Ok(_) => 1,
        Err(error) => {
            tracing::error!(%error, "headless run failed");
            notify::error("Initializer", &error.to_string());
            2
        }
    }
}

fn execute(preset_id: Option<Uuid>) -> AppResult<usize> {
    let preset_id = preset_id.ok_or_else(|| AppError::invalid("missing or invalid preset id"))?;
    let _com = win::ComGuard::new()?;
    let data = Store::default_location()?.load()?;
    let language: Language = data.settings.language;
    let preset = data
        .presets
        .iter()
        .find(|preset| preset.id == preset_id)
        .ok_or_else(|| {
            if notify::spanish(language) {
                AppError::NotFound("el preset ya no existe".into())
            } else {
                AppError::NotFound("preset no longer exists".into())
            }
        })?;
    tracing::info!(preset = %preset.id, items = preset.items.len(), "running preset");
    let report = launcher::run(preset, &browsers::detect());
    let failures = report.failures();
    if failures > 0 {
        notify::launch_failures(&preset.name, &report, language);
    }
    Ok(failures)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    #[test]
    fn parses_run_flag() {
        let id = Uuid::new_v4();
        assert_eq!(
            preset_id_from_args(&args(&["app.exe", "--run", &id.to_string()])),
            Some(Some(id))
        );
        assert_eq!(
            preset_id_from_args(&args(&["app.exe", "--run"])),
            Some(None)
        );
        assert_eq!(
            preset_id_from_args(&args(&["app.exe", "--run", "x"])),
            Some(None)
        );
        assert_eq!(preset_id_from_args(&args(&["app.exe"])), None);
    }
}
