use std::fs;
use std::io::Cursor;
use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use image::codecs::ico::{IcoEncoder, IcoFrame};
use image::imageops::FilterType;
use image::{DynamicImage, ExtendedColorType, ImageFormat, ImageReader};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::store::{Store, read_limited, write_atomic};

const CANVAS: u32 = 256;
const ICO_SIZES: &[u32] = &[16, 24, 32, 48, 64, 128, 256];
const MAX_SOURCE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_SOURCE_DIMENSION: u32 = 4096;
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "bmp", "webp", "ico"];

pub fn save_png(store: &Store, preset_id: Uuid, bytes: &[u8]) -> AppResult<()> {
    if bytes.len() as u64 > MAX_SOURCE_BYTES {
        return Err(AppError::invalid("image is too large"));
    }
    let image = decode(bytes)?;
    persist(store, preset_id, &image)
}

pub fn import_file(store: &Store, preset_id: Uuid, source: &Path) -> AppResult<()> {
    let extension = source
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(AppError::invalid("unsupported image type"));
    }
    let bytes = read_limited(source, MAX_SOURCE_BYTES)?;
    save_png(store, preset_id, &bytes)
}

pub fn data_url(store: &Store, preset_id: Uuid) -> Option<String> {
    fs::read(store.icon_png_path(preset_id))
        .ok()
        .map(|bytes| png_data_url(&bytes))
}

pub fn png_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(bytes))
}

pub fn write_ico(store: &Store, preset_id: Uuid) -> AppResult<std::path::PathBuf> {
    let bytes = read_limited(&store.icon_png_path(preset_id), MAX_SOURCE_BYTES)?;
    let image = decode(&bytes)?;
    let mut frames = Vec::new();
    for size in ICO_SIZES {
        let resized = image
            .resize_exact(*size, *size, FilterType::Lanczos3)
            .to_rgba8();
        frames.push(IcoFrame::as_png(
            resized.as_raw(),
            *size,
            *size,
            ExtendedColorType::Rgba8,
        )?);
    }
    let mut ico = Vec::new();
    IcoEncoder::new(&mut ico).encode_images(&frames)?;
    let path = store.icon_ico_path(preset_id);
    write_atomic(&path, &ico)?;
    Ok(path)
}

fn decode(bytes: &[u8]) -> AppResult<DynamicImage> {
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let (width, height) = reader.into_dimensions()?;
    if width == 0 || height == 0 || width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION {
        return Err(AppError::invalid("image dimensions are not supported"));
    }
    let image = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()?
        .decode()?;
    Ok(fit_square(image))
}

fn fit_square(image: DynamicImage) -> DynamicImage {
    let scaled = image
        .resize(CANVAS, CANVAS, FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas = image::RgbaImage::new(CANVAS, CANVAS);
    let x = (CANVAS - scaled.width()) / 2;
    let y = (CANVAS - scaled.height()) / 2;
    image::imageops::overlay(&mut canvas, &scaled, x as i64, y as i64);
    DynamicImage::ImageRgba8(canvas)
}

fn persist(store: &Store, preset_id: Uuid, image: &DynamicImage) -> AppResult<()> {
    let mut png = Vec::new();
    image.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)?;
    write_atomic(&store.icon_png_path(preset_id), &png)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_bytes(width: u32, height: u32) -> Vec<u8> {
        let image = DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            width,
            height,
            image::Rgba([99, 102, 241, 255]),
        ));
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        bytes
    }

    #[test]
    fn stores_square_png_and_builds_ico() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let id = Uuid::new_v4();
        save_png(&store, id, &png_bytes(400, 200)).unwrap();
        let stored = image::open(store.icon_png_path(id)).unwrap();
        assert_eq!((stored.width(), stored.height()), (CANVAS, CANVAS));
        let ico = write_ico(&store, id).unwrap();
        assert!(fs::metadata(ico).unwrap().len() > 0);
        assert!(
            data_url(&store, id)
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
    }

    #[test]
    fn rejects_non_images_and_bad_extensions() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        assert!(save_png(&store, Uuid::new_v4(), b"not an image").is_err());
        let script = dir.path().join("icon.bat");
        fs::write(&script, png_bytes(8, 8)).unwrap();
        assert!(import_file(&store, Uuid::new_v4(), &script).is_err());
    }
}
