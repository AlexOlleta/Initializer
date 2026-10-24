use std::path::{Path, PathBuf};

use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, CoCreateInstance, IPersistFile, STGM_READ,
};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
use windows::core::{HSTRING, Interface};

use crate::error::{AppError, AppResult};
use crate::model::ResolvedShortcut;

const MAX_WIDE_PATH: usize = 32_768;
const RESERVED_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

pub struct ShortcutSpec<'a> {
    pub link_path: &'a Path,
    pub target: &'a Path,
    pub arguments: &'a str,
    pub icon: Option<&'a Path>,
    pub description: &'a str,
}

pub fn create(spec: &ShortcutSpec) -> AppResult<()> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&HSTRING::from(spec.target))?;
        link.SetArguments(&HSTRING::from(spec.arguments))?;
        if let Some(dir) = spec.target.parent() {
            link.SetWorkingDirectory(&HSTRING::from(dir))?;
        }
        if let Some(icon) = spec.icon {
            link.SetIconLocation(&HSTRING::from(icon), 0)?;
        }
        link.SetDescription(&HSTRING::from(spec.description))?;
        let file: IPersistFile = link.cast()?;
        file.Save(&HSTRING::from(spec.link_path), true)?;
    }
    Ok(())
}

pub fn resolve(link_path: &Path) -> AppResult<ResolvedShortcut> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        let file: IPersistFile = link.cast()?;
        file.Load(&HSTRING::from(link_path), STGM_READ)?;
        let mut path = vec![0u16; MAX_WIDE_PATH];
        link.GetPath(&mut path, std::ptr::null_mut(), 0)?;
        let mut args = vec![0u16; MAX_WIDE_PATH];
        link.GetArguments(&mut args)?;
        let mut dir = vec![0u16; MAX_WIDE_PATH];
        link.GetWorkingDirectory(&mut dir)?;
        let path = wide_to_string(&path);
        if path.is_empty() {
            return Err(AppError::invalid("shortcut has no file target"));
        }
        let working_dir = Some(wide_to_string(&dir)).filter(|d| !d.is_empty());
        Ok(ResolvedShortcut {
            path,
            args: split_arguments(&wide_to_string(&args)),
            working_dir,
        })
    }
}

pub fn is_owned(link_path: &Path, exe: &Path, preset_id: &str) -> bool {
    resolve(link_path).is_ok_and(|resolved| {
        resolved.path.eq_ignore_ascii_case(&exe.to_string_lossy())
            && resolved.args.iter().any(|arg| arg == preset_id)
    })
}

pub fn file_name_for(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    let base = if trimmed.is_empty() {
        "Preset".to_string()
    } else if RESERVED_NAMES.contains(&trimmed.to_ascii_lowercase().as_str()) {
        format!("_{trimmed}")
    } else {
        trimmed
    };
    let limited: String = base.chars().take(100).collect();
    format!("{limited}.lnk")
}

pub fn available_path(dir: &Path, file_name: &str, reusable: impl Fn(&Path) -> bool) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() || reusable(&candidate) {
        return candidate;
    }
    let stem = file_name.trim_end_matches(".lnk");
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}).lnk")))
        .find(|path| !path.exists() || reusable(path))
        .unwrap_or(candidate)
}

pub fn split_arguments(command_line: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_token = false;
    let mut backslashes = 0usize;
    for c in command_line.chars() {
        match c {
            '\\' => {
                backslashes += 1;
                has_token = true;
            }
            '"' => {
                current.extend(std::iter::repeat_n('\\', backslashes / 2));
                if backslashes % 2 == 1 {
                    current.push('"');
                } else {
                    in_quotes = !in_quotes;
                }
                backslashes = 0;
                has_token = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                current.extend(std::iter::repeat_n('\\', backslashes));
                backslashes = 0;
                if has_token {
                    args.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            c => {
                current.extend(std::iter::repeat_n('\\', backslashes));
                backslashes = 0;
                current.push(c);
                has_token = true;
            }
        }
    }
    current.extend(std::iter::repeat_n('\\', backslashes));
    if has_token {
        args.push(current);
    }
    args
}

fn wide_to_string(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_file_names() {
        assert_eq!(file_name_for("Morning: work/day"), "Morning_ work_day.lnk");
        assert_eq!(file_name_for("CON"), "_CON.lnk");
        assert_eq!(file_name_for("  ...  "), "Preset.lnk");
        assert_eq!(file_name_for("ok."), "ok.lnk");
    }

    #[test]
    fn splits_windows_command_lines() {
        assert_eq!(
            split_arguments(r#"--a "b c" d\"e "f\\" g"#),
            ["--a", "b c", "d\"e", "f\\", "g"]
        );
        assert!(split_arguments("   ").is_empty());
        assert_eq!(split_arguments(r#""""#), [""]);
    }

    #[test]
    fn picks_free_path_when_name_taken() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("A.lnk"), b"x").unwrap();
        let path = available_path(dir.path(), "A.lnk", |_| false);
        assert_eq!(path, dir.path().join("A (2).lnk"));
        let reused = available_path(dir.path(), "A.lnk", |_| true);
        assert_eq!(reused, dir.path().join("A.lnk"));
    }
}
