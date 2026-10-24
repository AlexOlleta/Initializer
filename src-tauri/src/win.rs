use std::ffi::c_void;
use std::mem::size_of;

use windows::Win32::Foundation::{RPC_E_CHANGED_MODE, SIZE};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC,
    DeleteObject, GetDIBits, GetObjectW, HBITMAP, HGDIOBJ,
};
use windows::Win32::System::Com::{
    COINIT_APARTMENTTHREADED, CoInitializeEx, CoTaskMemFree, CoUninitialize,
};
use windows::Win32::UI::Shell::{
    IShellItem, IShellItemImageFactory, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC,
    SHCreateItemFromParsingName, SHELLEXECUTEINFOW, SIGDN, SIIGBF_ICONONLY, ShellExecuteExW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    SW_SHOWMAXIMIZED, SW_SHOWMINNOACTIVE, SW_SHOWNORMAL,
};
use windows::core::{HSTRING, PCWSTR, PWSTR};

use crate::error::AppResult;
use crate::model::WindowState;

pub struct ComGuard {
    owns_init: bool,
}

impl ComGuard {
    pub fn new() -> AppResult<Self> {
        let result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if result == RPC_E_CHANGED_MODE {
            return Ok(Self { owns_init: false });
        }
        result.ok()?;
        Ok(Self { owns_init: true })
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.owns_init {
            unsafe { CoUninitialize() };
        }
    }
}

pub fn show_command(state: WindowState) -> i32 {
    match state {
        WindowState::Normal => SW_SHOWNORMAL.0,
        WindowState::Minimized => SW_SHOWMINNOACTIVE.0,
        WindowState::Maximized => SW_SHOWMAXIMIZED.0,
    }
}

pub fn shell_open(target: &str, state: WindowState) -> AppResult<()> {
    shell_execute(target, &[], None, state)
}

pub fn shell_execute(
    target: &str,
    args: &[String],
    working_dir: Option<&str>,
    state: WindowState,
) -> AppResult<()> {
    let file = HSTRING::from(target);
    let verb = HSTRING::from("open");
    let parameters = HSTRING::from(quote_arguments(args));
    let directory = working_dir.map(HSTRING::from);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: if args.is_empty() {
            PCWSTR::null()
        } else {
            PCWSTR(parameters.as_ptr())
        },
        lpDirectory: directory
            .as_ref()
            .map_or(PCWSTR::null(), |dir| PCWSTR(dir.as_ptr())),
        nShow: show_command(state),
        ..Default::default()
    };
    unsafe { ShellExecuteExW(&mut info)? };
    Ok(())
}

pub fn quote_arguments(args: &[String]) -> String {
    args.iter()
        .map(|arg| quote_argument(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn quote_argument(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '\n', '\x0b', '"']) {
        return arg.to_string();
    }
    let mut quoted = String::from('"');
    let mut backslashes = 0usize;
    for c in arg.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                quoted.extend(std::iter::repeat_n('\\', backslashes * 2 + 1));
                quoted.push('"');
                backslashes = 0;
            }
            c => {
                quoted.extend(std::iter::repeat_n('\\', backslashes));
                quoted.push(c);
                backslashes = 0;
            }
        }
    }
    quoted.extend(std::iter::repeat_n('\\', backslashes * 2));
    quoted.push('"');
    quoted
}

pub fn take_co_string(value: PWSTR) -> String {
    if value.is_null() {
        return String::new();
    }
    let text = unsafe { value.to_string() }.unwrap_or_default();
    unsafe { CoTaskMemFree(Some(value.0 as *const c_void)) };
    text
}

pub fn display_name(item: &IShellItem, kind: SIGDN) -> AppResult<String> {
    let name = unsafe { item.GetDisplayName(kind)? };
    Ok(take_co_string(name))
}

pub fn icon_png_for_parsing_name(parsing_name: &str, size: i32) -> AppResult<Vec<u8>> {
    let factory: IShellItemImageFactory =
        unsafe { SHCreateItemFromParsingName(&HSTRING::from(parsing_name), None)? };
    icon_png_from_factory(&factory, size)
}

pub fn icon_png_from_factory(factory: &IShellItemImageFactory, size: i32) -> AppResult<Vec<u8>> {
    let bitmap = unsafe { factory.GetImage(SIZE { cx: size, cy: size }, SIIGBF_ICONONLY)? };
    let rgba = bitmap_to_rgba(bitmap);
    unsafe {
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
    }
    let (width, height, pixels) = rgba?;
    let image = image::RgbaImage::from_raw(width, height, pixels)
        .ok_or_else(|| crate::error::AppError::invalid("invalid bitmap"))?;
    let mut png = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)?;
    Ok(png)
}

fn bitmap_to_rgba(bitmap: HBITMAP) -> AppResult<(u32, u32, Vec<u8>)> {
    let mut header = BITMAP::default();
    let read = unsafe {
        GetObjectW(
            HGDIOBJ(bitmap.0),
            size_of::<BITMAP>() as i32,
            Some(&mut header as *mut BITMAP as *mut c_void),
        )
    };
    if read == 0 || header.bmWidth <= 0 || header.bmHeight <= 0 {
        return Err(crate::error::AppError::invalid("invalid bitmap"));
    }
    let width = header.bmWidth;
    let height = header.bmHeight;
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let lines = unsafe {
        let dc = CreateCompatibleDC(None);
        let lines = GetDIBits(
            dc,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut c_void),
            &mut info,
            DIB_RGB_COLORS,
        );
        let _ = DeleteDC(dc);
        lines
    };
    if lines == 0 {
        return Err(crate::error::AppError::invalid("unable to read bitmap"));
    }
    let has_alpha = pixels.as_chunks::<4>().0.iter().any(|px| px[3] != 0);
    for px in pixels.as_chunks_mut::<4>().0 {
        px.swap(0, 2);
        if !has_alpha {
            px[3] = 255;
        } else if px[3] > 0 && px[3] < 255 {
            let alpha = px[3] as u32;
            for channel in &mut px[..3] {
                *channel = ((*channel as u32 * 255 + alpha / 2) / alpha).min(255) as u8;
            }
        }
    }
    Ok((width as u32, height as u32, pixels))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shortcut::split_arguments;

    #[test]
    fn quoting_roundtrips_through_windows_parsing() {
        let args: Vec<String> = [
            "--plain",
            "with space",
            "",
            r#"quote"inside"#,
            r"trailing\",
            r#"C:\Program Files\App\"#,
            r#"back\"quote"#,
            "--profile-directory=Profile 1",
            "https://example.com/?a=1&b=2|x^y",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert_eq!(split_arguments(&quote_arguments(&args)), args);
    }
}
