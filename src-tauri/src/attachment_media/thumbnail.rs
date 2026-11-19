//! Rebuildable cache, never a registered attachment or a sync/archive input.
//! Raster formats decode one bounded first frame. Restricted vector SVG never
//! resolves files/network/data images or silently omits unsupported constructs.
use super::{error, MediaMetrics};
use crate::store::{
    attachment_media::{open_regular, FileStamp, ManagedAttachment, VerifiedFile},
    Result,
};
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageFormat, ImageReader};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{BufReader, Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::{atomic::Ordering, Arc, Mutex},
};
use tokio::sync::Semaphore;
use uuid::Uuid;

const VERSION: &str = "media-thumbnail-v3-svg-text";
const SVG_MAX_BYTES: u64 = 2 * 1024 * 1024;
// Cache validation consumes only the derived PNG. These are independent hard
// bounds, not source-decoder best-effort limits or a whole-original buffer.
const MAX_CACHE_ENCODED_BYTES: u64 = 8 * 1024 * 1024;
const CACHE_DECODER_BYTES: usize = 16 * 1024 * 1024;
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CacheUsage {
    pub bytes: u64,
    pub files: usize,
    pub quota: u64,
}
#[derive(Clone)]
pub(crate) struct ThumbnailLimits {
    pub quota: u64,
    pub output_bytes: u64,
    pub max_pixels: u32,
    pub input_pixels: u64,
    pub decode_bytes: u64,
}
impl Default for ThumbnailLimits {
    fn default() -> Self {
        Self {
            quota: 256 * 1024 * 1024,
            output_bytes: 8 * 1024 * 1024,
            max_pixels: 1024,
            input_pixels: 24_000_000,
            decode_bytes: 128 * 1024 * 1024,
        }
    }
}
#[derive(Clone)]
pub(super) struct CachedThumbnail {
    root: PathBuf,
    name: String,
    pub stamp: FileStamp,
    pub width: u32,
    pub height: u32,
    max: u64,
}
impl CachedThumbnail {
    pub fn open(&self) -> Result<VerifiedFile> {
        open_regular(&self.root, &self.name, Some(self.stamp.bytes), self.max)
    }
}
struct Entry {
    bytes: u64,
    used: u64,
}
#[derive(Default)]
struct State {
    files: HashMap<String, Entry>,
    clock: u64,
}
pub(crate) struct ThumbnailCache {
    root: PathBuf,
    directory: Arc<File>,
    limits: ThumbnailLimits,
    provider: Option<Arc<dyn super::provider::ThumbnailProvider>>,
    state: Mutex<State>,
    pub(super) queue: Arc<Semaphore>,
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn id_prefix(id: &str) -> String {
    format!("{}-", hash(id.as_bytes()))
}
fn cache_name(name: &str) -> bool {
    let parts: Vec<_> = name.trim_end_matches(".png").split('-').collect();
    name.ends_with(".png")
        && parts.len() == 3
        && parts[0].len() == 64
        && parts[1].len() == 64
        && parts[0..2]
            .iter()
            .all(|p| p.bytes().all(|b| b.is_ascii_hexdigit()))
        && parts[2].parse::<u32>().is_ok_and(|p| p > 0 && p <= 1024)
}
impl ThumbnailCache {
    pub(crate) fn new(root: PathBuf, limits: ThumbnailLimits) -> Result<Self> {
        if limits.quota == 0
            || limits.output_bytes == 0
            || limits.output_bytes > MAX_CACHE_ENCODED_BYTES
            || limits.max_pixels == 0
            || limits.max_pixels > 1024
            || limits.input_pixels == 0
            || limits.decode_bytes == 0
        {
            return Err(error("invalid", "缩略图缓存限制无效"));
        }
        // Caller supplies an app-owned cache directory, never a renderer path.
        if !root.exists() {
            fs::create_dir_all(&root)?;
        }
        let metadata = fs::symlink_metadata(&root)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(error("invalid", "缩略图缓存目录无效"));
        }
        let root = root.canonicalize()?;
        #[cfg(unix)]
        let directory = {
            use std::os::unix::fs::OpenOptionsExt;
            OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
                .open(&root)?
        };
        #[cfg(not(unix))]
        let directory = File::open(&root)?;
        let directory = Arc::new(directory);
        let mut state = State::default();
        let mut files = Vec::new();
        for item in fs::read_dir(&root)? {
            let item = item?;
            let name = item.file_name().to_string_lossy().into_owned();
            let metadata = fs::symlink_metadata(item.path())?;
            if metadata.file_type().is_symlink() {
                return Err(error("invalid", "缓存中不允许符号链接"));
            }
            if name.starts_with(".media-tmp-") && metadata.is_file() {
                unlink_at(&directory, &name)?;
            } else if cache_name(&name) && metadata.is_file() {
                if metadata.len() > limits.output_bytes {
                    unlink_at(&directory, &name)?;
                } else {
                    files.push((metadata.modified().ok(), name, metadata.len()));
                }
            }
        }
        files.sort_by_key(|(time, _, _)| *time);
        for (_, name, bytes) in files {
            state.clock += 1;
            state.files.insert(
                name,
                Entry {
                    bytes,
                    used: state.clock,
                },
            );
        }
        let cache = Self {
            root,
            directory,
            limits,
            provider: None,
            state: Mutex::new(state),
            queue: Arc::new(Semaphore::new(1)),
        };
        {
            let mut state = cache
                .state
                .lock()
                .map_err(|_| error("media_io", "缓存不可用"))?;
            cache.evict(&mut state, None)?;
        }
        Ok(cache)
    }
    fn verify_directory(&self) -> Result<()> {
        let current = fs::symlink_metadata(&self.root)?;
        if !current.is_dir() || current.file_type().is_symlink() {
            return Err(error("invalid", "缓存目录已替换"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let expected = self.directory.metadata()?;
            if current.dev() != expected.dev() || current.ino() != expected.ino() {
                return Err(error("invalid", "缓存目录已替换"));
            }
        }
        Ok(())
    }
    pub(crate) fn with_provider(
        mut self,
        provider: Arc<dyn super::provider::ThumbnailProvider>,
    ) -> Self {
        self.provider = Some(provider);
        self
    }
    fn cached(&self, name: &str, pixels: u32) -> Result<CachedThumbnail> {
        self.verify_directory()?;
        let opened = open_regular(&self.root, name, None, self.limits.output_bytes)?;
        // A valid IHDR is not proof that the IDAT/body can be displayed. Check
        // the entire small derived frame and finish through IEND/CRCs on every
        // hit, including a reconstructed restart index. No source byte/decode
        // is involved; get() removes a failed cache entry and regenerates it.
        let mut decoder = png::Decoder::new_with_limits(
            BufReader::new(&opened.file),
            png::Limits {
                bytes: CACHE_DECODER_BYTES,
            },
        );
        decoder.set_ignore_text_chunk(true);
        decoder.set_ignore_iccp_chunk(true);
        decoder.ignore_checksums(false);
        let info = decoder
            .read_header_info()
            .map_err(|_| error("invalid", "缩略图缓存头损坏"))?;
        let (width, height) = (info.width, info.height);
        if width == 0
            || height == 0
            || width > pixels
            || height > pixels
            || info.color_type != png::ColorType::Rgba
            || info.bit_depth != png::BitDepth::Eight
            || info.interlaced
        {
            return Err(error("invalid", "缩略图缓存尺寸或编码无效"));
        }
        let mut reader = decoder
            .read_info()
            .map_err(|_| error("invalid", "缩略图缓存元数据损坏"))?;
        if reader.info().animation_control.is_some() || reader.info().frame_control.is_some() {
            return Err(error("invalid", "缩略图缓存不能包含动画"));
        }
        // Our encoder emits one RGBA8 frame. At 1024px this explicit buffer is
        // <=4MiB; png's separate internal allocation budget is <=16MiB.
        let decoded_bytes = (width as usize)
            .checked_mul(height as usize)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or_else(|| error("invalid", "缩略图缓存像素数无效"))?;
        if reader.output_buffer_size() != Some(decoded_bytes) {
            return Err(error("invalid", "缩略图缓存解码大小无效"));
        }
        let mut decoded = vec![0; decoded_bytes];
        reader
            .next_frame(&mut decoded)
            .map_err(|_| error("invalid", "缩略图缓存图像损坏"))?;
        reader
            .finish()
            .map_err(|_| error("invalid", "缩略图缓存尾部损坏"))?;
        if FileStamp::of(&opened.file.metadata()?) != opened.stamp {
            return Err(error("invalid", "缩略图校验期间已改变"));
        }
        Ok(CachedThumbnail {
            root: self.root.clone(),
            name: name.into(),
            stamp: opened.stamp,
            width,
            height,
            max: self.limits.output_bytes,
        })
    }
    pub(super) fn get(
        &self,
        original: &ManagedAttachment,
        stamp: &FileStamp,
        pixels: u32,
        metrics: &MediaMetrics,
        authorize: impl Fn() -> Result<()> + Sync,
    ) -> Result<CachedThumbnail> {
        self.verify_directory()?;
        if pixels == 0 || pixels > self.limits.max_pixels {
            return Err(error("invalid", "缩略图目标尺寸无效"));
        }
        let prefix = id_prefix(&original.attachment.id);
        let version = hash(&serde_json::to_vec(&(
            VERSION,
            super::svg_text::FONT_SHA256,
            &original.attachment,
            stamp,
        ))?);
        let current_prefix = format!("{prefix}{version}-");
        let name = format!("{current_prefix}{pixels}.png");
        let mut state = self
            .state
            .lock()
            .map_err(|_| error("media_io", "缓存不可用"))?;
        // Serialize generation and invalidation. A reset cannot be undone by a
        // late atomic rename; authorization is rechecked before every publish.
        authorize()?;
        let obsolete: Vec<_> = state
            .files
            .keys()
            .filter(|n| n.starts_with(&prefix) && !n.starts_with(&current_prefix))
            .cloned()
            .collect();
        for n in obsolete {
            self.remove(&mut state, &n)?;
        }
        if state.files.contains_key(&name) {
            match self.cached(&name, pixels) {
                Ok(cached) => {
                    authorize()?;
                    state.clock += 1;
                    let clock = state.clock;
                    state.files.get_mut(&name).unwrap().used = clock;
                    metrics.thumbnail_hits.fetch_add(1, Ordering::Relaxed);
                    return Ok(cached);
                }
                Err(_) => self.remove(&mut state, &name)?,
            }
        }
        let mut input = original.open()?;
        if &input.stamp != stamp {
            return Err(error("metadata_stale", "附件已改变"));
        }
        let mime = sniff_mime(&input.file, &original.attachment.mime)?;
        metrics
            .thumbnail_generation_attempts
            .fetch_add(1, Ordering::Relaxed);
        metrics
            .thumbnail_source_logical_bytes
            .fetch_add(stamp.bytes, Ordering::Relaxed);
        let image = if mime == "image/svg+xml" {
            if stamp.bytes > SVG_MAX_BYTES {
                return Err(error("unsupported_media", "SVG 超出复杂度限制"));
            }
            let mut bytes = Vec::with_capacity(stamp.bytes as usize);
            Read::by_ref(&mut input.file)
                .take(SVG_MAX_BYTES + 1)
                .read_to_end(&mut bytes)?;
            if bytes.len() as u64 != stamp.bytes {
                return Err(error("invalid", "SVG 读取不完整"));
            }
            super::svg_text::render(&bytes, pixels)?
        } else if let Some(provider) = &self.provider {
            let image = match provider.render(
                &input,
                &mime,
                pixels,
                self.limits.input_pixels,
                &authorize,
            ) {
                Ok(image) => image,
                Err(e)
                    if e.code == "unsupported_media"
                        && matches!(
                            mime.as_str(),
                            "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/bmp"
                        ) =>
                {
                    authorize()?;
                    decode_raster(&mut input.file, pixels, &self.limits)?
                }
                Err(e) => return Err(e),
            };
            if image.width() == 0
                || image.height() == 0
                || image.width() > pixels
                || image.height() > pixels
            {
                return Err(error("invalid", "平台缩略图尺寸无效"));
            }
            image
        } else {
            decode_raster(&mut input.file, pixels, &self.limits)?
        };
        authorize()?;
        let temp_name = format!(".media-tmp-{}", Uuid::new_v4().simple());
        self.verify_directory()?;
        let pending = PendingFile {
            directory: self.directory.clone(),
            name: temp_name.clone(),
        };
        let file = create_at(&self.directory, &temp_name)?;
        let mut output = CappedWriter {
            file,
            bytes: 0,
            max: self.limits.output_bytes.min(self.limits.quota),
        };
        image::codecs::png::PngEncoder::new(&mut output)
            .write_image(
                image.as_raw(),
                image.width(),
                image.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|_| error("media_io", "缩略图编码失败或超出大小限制"))?;
        output.file.sync_all()?;
        authorize()?;
        self.verify_directory()?;
        rename_at(&self.directory, &temp_name, &name)?;
        drop(pending);
        state.clock += 1;
        let clock = state.clock;
        state.files.insert(
            name.clone(),
            Entry {
                bytes: output.bytes,
                used: clock,
            },
        );
        self.evict(&mut state, Some(&name))?;
        metrics
            .thumbnail_generations
            .fetch_add(1, Ordering::Relaxed);
        metrics
            .thumbnail_output_bytes
            .fetch_add(output.bytes, Ordering::Relaxed);
        let cached = self.cached(&name, pixels)?;
        if let Err(e) = authorize() {
            self.remove(&mut state, &name)?;
            return Err(e);
        }
        Ok(cached)
    }
    fn remove(&self, state: &mut State, name: &str) -> Result<()> {
        self.verify_directory()?;
        match unlink_at(&self.directory, name) {
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.into()),
        }
        state.files.remove(name);
        Ok(())
    }
    fn evict(&self, state: &mut State, keep: Option<&str>) -> Result<()> {
        while state.files.values().map(|v| v.bytes).sum::<u64>() > self.limits.quota {
            let name = state
                .files
                .iter()
                .filter(|(n, _)| Some(n.as_str()) != keep)
                .min_by_key(|(_, e)| e.used)
                .map(|(n, _)| n.clone());
            if let Some(name) = name {
                self.remove(state, &name)?;
            } else {
                return Err(error("media_io", "缩略图超出缓存配额"));
            }
        }
        Ok(())
    }
    pub(crate) fn usage(&self) -> Result<CacheUsage> {
        self.verify_directory()?;
        let state = self
            .state
            .lock()
            .map_err(|_| error("media_io", "缓存不可用"))?;
        Ok(CacheUsage {
            bytes: state.files.values().map(|entry| entry.bytes).sum(),
            files: state.files.len(),
            quota: self.limits.quota,
        })
    }
    pub(crate) fn invalidate(&self, id: &str) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| error("media_io", "缓存不可用"))?;
        let prefix = id_prefix(id);
        let names: Vec<_> = state
            .files
            .keys()
            .filter(|n| n.starts_with(&prefix))
            .cloned()
            .collect();
        for name in names {
            self.remove(&mut state, &name)?;
        }
        Ok(())
    }
    pub(crate) fn clear(&self) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| error("media_io", "缓存不可用"))?;
        let names: Vec<_> = state.files.keys().cloned().collect();
        for name in names {
            self.remove(&mut state, &name)?;
        }
        Ok(())
    }
}
// All cache mutations are anchored to its original directory FD. A late
// directory/symlink swap cannot redirect a create, rename or cleanup elsewhere.
struct PendingFile {
    directory: Arc<File>,
    name: String,
}
impl Drop for PendingFile {
    fn drop(&mut self) {
        let _ = unlink_at(&self.directory, &self.name);
    }
}
#[cfg(unix)]
fn create_at(directory: &File, name: &str) -> std::io::Result<File> {
    use std::os::fd::{AsRawFd, FromRawFd};
    let name = std::ffi::CString::new(name)?;
    let fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            name.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            0o600,
        )
    };
    if fd < 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}
#[cfg(unix)]
fn rename_at(directory: &File, from: &str, to: &str) -> std::io::Result<()> {
    use std::os::fd::AsRawFd;
    let from = std::ffi::CString::new(from)?;
    let to = std::ffi::CString::new(to)?;
    let result = unsafe {
        libc::renameat(
            directory.as_raw_fd(),
            from.as_ptr(),
            directory.as_raw_fd(),
            to.as_ptr(),
        )
    };
    if result < 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}
#[cfg(unix)]
fn unlink_at(directory: &File, name: &str) -> std::io::Result<()> {
    use std::os::fd::AsRawFd;
    let name = std::ffi::CString::new(name)?;
    let result = unsafe { libc::unlinkat(directory.as_raw_fd(), name.as_ptr(), 0) };
    if result < 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}
#[cfg(not(unix))]
fn create_at(_: &File, _: &str) -> std::io::Result<File> {
    Err(std::io::Error::other("unsupported media platform"))
}
#[cfg(not(unix))]
fn rename_at(_: &File, _: &str, _: &str) -> std::io::Result<()> {
    Err(std::io::Error::other("unsupported media platform"))
}
#[cfg(not(unix))]
fn unlink_at(_: &File, _: &str) -> std::io::Result<()> {
    Err(std::io::Error::other("unsupported media platform"))
}
struct CappedWriter {
    file: File,
    bytes: u64,
    max: u64,
}
impl Write for CappedWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() as u64 > self.max.saturating_sub(self.bytes) {
            return Err(std::io::Error::other("thumbnail byte limit"));
        }
        let written = self.file.write(bytes)?;
        self.bytes += written as u64;
        Ok(written)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.file.flush()
    }
}
fn decode_raster(
    file: &mut File,
    pixels: u32,
    limits: &ThumbnailLimits,
) -> Result<image::RgbaImage> {
    file.seek(SeekFrom::Start(0))?;
    let mut reader = ImageReader::new(BufReader::new(file))
        .with_guessed_format()
        .map_err(|_| error("unsupported_media", "无法识别图像"))?;
    if !matches!(
        reader.format(),
        Some(
            ImageFormat::Png
                | ImageFormat::Jpeg
                | ImageFormat::Gif
                | ImageFormat::WebP
                | ImageFormat::Bmp
        )
    ) {
        return Err(error(
            "unsupported_media",
            "当前缩略图解码器不支持此图片格式",
        ));
    }
    let mut bounded = image::Limits::default();
    bounded.max_image_width = Some(12000);
    bounded.max_image_height = Some(12000);
    bounded.max_alloc = Some(limits.decode_bytes);
    reader.limits(bounded);
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| error("invalid", "图片损坏或超出解码限制"))?;
    let (w, h) = decoder.dimensions();
    if w == 0 || h == 0 || u64::from(w) * u64::from(h) > limits.input_pixels {
        return Err(error("invalid", "图片像素数超出限制"));
    }
    let orientation = decoder
        .orientation()
        .map_err(|_| error("invalid", "图片方向元数据损坏"))?;
    let mut decoded =
        DynamicImage::from_decoder(decoder).map_err(|_| error("invalid", "图片首帧解码失败"))?;
    decoded.apply_orientation(orientation);
    Ok(decoded.thumbnail(pixels, pixels).into_rgba8())
}
/// At most 16KiB; never Base64 or whole-original MIME probing.
pub(super) fn sniff_mime(file: &File, declared: &str) -> Result<String> {
    #[cfg(unix)]
    use std::os::unix::fs::FileExt;
    let mut head = [0u8; 16384];
    #[cfg(unix)]
    let count = file.read_at(&mut head, 0)?;
    #[cfg(not(unix))]
    let count = 0;
    let head = &head[..count];
    if let Ok(format) = image::guess_format(head) {
        let mime = match format {
            ImageFormat::Png => "image/png",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Gif => "image/gif",
            ImageFormat::WebP => "image/webp",
            ImageFormat::Bmp => "image/bmp",
            _ => "",
        };
        if !mime.is_empty() {
            return Ok(mime.into());
        }
    }
    let text = String::from_utf8_lossy(head);
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    if trimmed.starts_with("<svg")
        || (trimmed.starts_with("<?xml") || trimmed.starts_with("<!--")) && trimmed.contains("<svg")
    {
        return Ok("image/svg+xml".into());
    }
    let declared = declared
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if declared.contains('/')
        && declared.len() <= 128
        && declared
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/!#$&^_.+-".contains(&b))
    {
        Ok(declared)
    } else {
        Ok("application/octet-stream".into())
    }
}
