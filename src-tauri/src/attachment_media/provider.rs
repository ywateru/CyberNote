//! Internal decoding extension, not an authorization source or renderer API.
use crate::store::{attachment_media::VerifiedFile, Result};
use image::RgbaImage;
pub(crate) trait ThumbnailProvider: Send + Sync {
    /// The caller owns/revalidates the registration, authorization and cache.
    /// Native code receives only this already-open File and bounded targets.
    fn render(
        &self,
        input: &VerifiedFile,
        mime: &str,
        pixels: u32,
        input_pixels: u64,
        authorize: &(dyn Fn() -> Result<()> + Sync),
    ) -> Result<RgbaImage>;
}
