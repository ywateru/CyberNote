//! Measurement host adapter around mechanically extracted production Provider.
//! Decoding, busy worker, deadline and alpha conversion stay in that exact body.
use crate::{attachment_media::provider::ThumbnailProvider, store::{attachment_media::VerifiedFile, AppError, Result}};
use image::RgbaImage;
use std::sync::Arc;
#[path = "native-provider.rs"]
mod native;
pub(crate) fn provider() -> Arc<dyn ThumbnailProvider> { Arc::new(MacProvider(native::measurement_provider())) }
struct MacProvider(native::Provider);
impl ThumbnailProvider for MacProvider {
    fn render(&self, input: &VerifiedFile, mime: &str, pixels: u32, input_pixels: u64,
        authorize: &(dyn Fn() -> Result<()> + Sync)) -> Result<RgbaImage> {
        authorize()?;
        let frame = self.0.thumbnail(&input.file, input.stamp.bytes, mime, pixels, input_pixels,
            || authorize().is_err()).map_err(|code| AppError {code, message: "Production Mac thumbnail provider failed".into(), commit:None})?;
        authorize()?;
        RgbaImage::from_raw(frame.width, frame.height, frame.rgba).ok_or_else(|| AppError {
            code:"invalid".into(), message:"Invalid production Mac frame".into(), commit:None})
    }
}
