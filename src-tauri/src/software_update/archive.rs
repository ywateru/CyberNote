//! ZIP32 only. Parse both headers, then inflate every stream through an actual-byte
//! budget and CRC check. Installation extracts from one private, unlinked snapshot;
//! a path replacement after download validation cannot change extraction input.
use super::storage::err;
use crc32fast::Hasher;
use flate2::{Decompress, FlushDecompress, Status};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::Path,
    time::{Duration, Instant},
};
const MAX_EXPANDED: u64 = 2 * 1024 * 1024 * 1024;
struct Entry {
    name: String,
    offset: u64,
    compressed: u64,
    size: u64,
    crc: u32,
    method: u16,
    mode: u32,
    directory: bool,
}
fn extra(bytes: &[u8]) -> Result<(), String> {
    let mut i = 0;
    while i < bytes.len() {
        if bytes.len() - i < 4 {
            return Err("invalid_archive_extra".into());
        }
        let tag = u16le(bytes, i);
        let len = u16le(bytes, i + 2) as usize;
        i += 4;
        if len > bytes.len() - i {
            return Err("invalid_archive_extra".into());
        }
        if tag == 1 {
            return Err("zip64_archive".into());
        }
        i += len;
    }
    Ok(())
}
fn entries(f: &mut File) -> Result<Vec<Entry>, String> {
    let size = f.metadata().map_err(err)?.len();
    if size > super::feed::MAX_PACKAGE {
        return Err("archive_limit".into());
    }
    let tail_len = size.min(65557) as usize;
    f.seek(SeekFrom::End(-(tail_len as i64))).map_err(err)?;
    let mut tail = vec![0; tail_len];
    f.read_exact(&mut tail).map_err(err)?;
    let end = (0..tail.len().saturating_sub(21))
        .rev()
        .find(|&i| {
            tail[i..].starts_with(b"PK\x05\x06")
                && i + 22 + u16le(&tail, i + 20) as usize == tail.len()
        })
        .ok_or("invalid_archive")?;
    if u16le(&tail, end + 4) != 0
        || u16le(&tail, end + 6) != 0
        || u16le(&tail, end + 8) != u16le(&tail, end + 10)
    {
        return Err("multipart_archive".into());
    }
    let count = u16le(&tail, end + 10) as usize;
    let length = u32le(&tail, end + 12) as usize;
    let offset = u32le(&tail, end + 16) as u64;
    if count == 0
        || count > 20000
        || length > 16 * 1024 * 1024
        || offset == u32::MAX as u64
        || offset + length as u64 != size - tail_len as u64 + end as u64
    {
        return Err("archive_limit".into());
    }
    f.seek(SeekFrom::Start(offset)).map_err(err)?;
    let mut bytes = vec![0; length];
    f.read_exact(&mut bytes).map_err(err)?;
    let (mut pos, mut advertised) = (0, 0u64);
    let mut names = HashSet::new();
    let mut ranges = vec![];
    let mut result = vec![];
    for _ in 0..count {
        if pos + 46 > bytes.len() || &bytes[pos..pos + 4] != b"PK\x01\x02" {
            return Err("invalid_archive".into());
        }
        let n = u16le(&bytes, pos + 28) as usize;
        let ex = u16le(&bytes, pos + 30) as usize;
        let comment = u16le(&bytes, pos + 32) as usize;
        let stop = pos + 46 + n + ex + comment;
        if stop > bytes.len() {
            return Err("invalid_archive".into());
        }
        extra(&bytes[pos + 46 + n..pos + 46 + n + ex])?;
        let name = std::str::from_utf8(&bytes[pos + 46..pos + 46 + n])
            .map_err(|_| "invalid_archive_path")?;
        if name.len() > 1024
            || name.contains(['\\', '\0', ':'])
            || !(name.starts_with("CyberNote.app/") || name.starts_with("__MACOSX/"))
            || name
                .trim_end_matches('/')
                .split('/')
                .any(|p| p.is_empty() || p == "." || p == "..")
            || name.split('/').count() > 64
        {
            return Err("unsafe_archive_path".into());
        }
        if !names.insert(name.trim_end_matches('/').to_lowercase()) {
            return Err("duplicate_archive_path".into());
        }
        let mode = u32le(&bytes, pos + 38) >> 16;
        let kind = mode & 0o170000;
        let directory = name.ends_with('/');
        if ![0, 0o100000, 0o040000].contains(&kind)
            || (kind == 0o040000 && !directory)
            || (kind == 0o100000 && directory)
        {
            return Err("archive_link_or_device".into());
        }
        let flags = u16le(&bytes, pos + 8);
        let method = u16le(&bytes, pos + 10);
        if flags & !(0x800 | 8 | 6) != 0
            || ![0, 8].contains(&method)
            || u16le(&bytes, pos + 34) != 0
            || u16le(&bytes, pos + 6) > 20
        {
            return Err("unsupported_archive".into());
        }
        let crc = u32le(&bytes, pos + 16);
        let compressed = u32le(&bytes, pos + 20) as u64;
        let size = u32le(&bytes, pos + 24) as u64;
        let local = u32le(&bytes, pos + 42) as u64;
        if [compressed, size, local].contains(&(u32::MAX as u64)) {
            return Err("zip64_archive".into());
        }
        advertised = advertised.checked_add(size).ok_or("archive_limit")?;
        if advertised > MAX_EXPANDED || (directory && size != 0) {
            return Err("archive_limit".into());
        }
        if local + 30 > offset {
            return Err("archive_overlap".into());
        }
        f.seek(SeekFrom::Start(local)).map_err(err)?;
        let mut h = [0; 30];
        f.read_exact(&mut h).map_err(err)?;
        if &h[..4] != b"PK\x03\x04"
            || u16le(&h, 4) > 20
            || u16le(&h, 6) != flags
            || u16le(&h, 8) != method
            || u16le(&h, 26) as usize != n
        {
            return Err("archive_local_mismatch".into());
        }
        let local_extra = u16le(&h, 28) as usize;
        let start = local + 30 + n as u64 + local_extra as u64;
        let mut data_end = start.checked_add(compressed).ok_or("archive_limit")?;
        if data_end > offset {
            return Err("archive_overlap".into());
        }
        let mut local_name = vec![0; n];
        f.read_exact(&mut local_name).map_err(err)?;
        if local_name != name.as_bytes() {
            return Err("archive_local_mismatch".into());
        }
        let mut local_extra_bytes = vec![0; local_extra];
        f.read_exact(&mut local_extra_bytes).map_err(err)?;
        extra(&local_extra_bytes)?;
        let local_fields = [u32le(&h, 14), u32le(&h, 18), u32le(&h, 22)];
        let expected = [crc, compressed as u32, size as u32];
        if flags & 8 == 0 {
            if local_fields != expected {
                return Err("archive_local_mismatch".into());
            }
        } else {
            if local_fields
                .iter()
                .zip(expected)
                .any(|(a, b)| *a != 0 && *a != b)
            {
                return Err("archive_local_mismatch".into());
            }
            if data_end + 12 > offset {
                return Err("invalid_archive_descriptor".into());
            }
            f.seek(SeekFrom::Start(data_end)).map_err(err)?;
            let mut d = [0; 16];
            f.read_exact(&mut d[..12]).map_err(err)?;
            let i = if &d[..4] == b"PK\x07\x08" {
                if data_end + 16 > offset {
                    return Err("invalid_archive_descriptor".into());
                }
                f.read_exact(&mut d[12..]).map_err(err)?;
                4
            } else {
                0
            };
            if [u32le(&d, i), u32le(&d, i + 4), u32le(&d, i + 8)] != expected {
                return Err("invalid_archive_descriptor".into());
            }
            data_end += 12 + i as u64;
        }
        ranges.push((local, data_end));
        result.push(Entry {
            name: name.into(),
            offset: start,
            compressed,
            size,
            crc,
            method,
            mode,
            directory,
        });
        pos = stop;
    }
    ranges.sort_unstable();
    if pos != bytes.len() || ranges.windows(2).any(|r| r[0].1 > r[1].0) {
        return Err("archive_overlap".into());
    }
    Ok(result)
}
fn stream(
    f: &mut File,
    entry: &Entry,
    output: &mut dyn Write,
    total: &mut u64,
    limit: u64,
    deadline: Instant,
) -> Result<(), String> {
    f.seek(SeekFrom::Start(entry.offset)).map_err(err)?;
    let mut count = 0u64;
    let mut crc = Hasher::new();
    let mut emit = |bytes: &[u8]| -> Result<(), String> {
        if Instant::now() > deadline {
            return Err("archive_timeout".into());
        }
        count = count
            .checked_add(bytes.len() as u64)
            .ok_or("archive_limit")?;
        *total = total
            .checked_add(bytes.len() as u64)
            .ok_or("archive_limit")?;
        // Validate actual bytes before allowing any of this chunk to disk.
        if count > entry.size || *total > limit {
            return Err("archive_limit".into());
        }
        crc.update(bytes);
        output.write_all(bytes).map_err(err)
    };
    let mut input = f.take(entry.compressed);
    let mut buffer = [0u8; 65536];
    if entry.method == 8 {
        let mut decoder = Decompress::new(false);
        let mut packed = [0u8; 16384];
        let (mut start, mut end) = (0, 0);
        let mut eof = false;
        loop {
            if Instant::now() > deadline {
                return Err("archive_timeout".into());
            }
            if start == end && !eof {
                end = input.read(&mut packed).map_err(err)?;
                start = 0;
                eof = end == 0;
            }
            let before_in = decoder.total_in();
            let before_out = decoder.total_out();
            let status = decoder
                .decompress(
                    &packed[start..end],
                    &mut buffer,
                    if eof {
                        FlushDecompress::Finish
                    } else {
                        FlushDecompress::None
                    },
                )
                .map_err(|_| "invalid_archive_stream")?;
            let consumed = (decoder.total_in() - before_in) as usize;
            let written = (decoder.total_out() - before_out) as usize;
            start += consumed;
            emit(&buffer[..written])?;
            if status == Status::StreamEnd {
                if decoder.total_in() != entry.compressed {
                    return Err("archive_compressed_size_mismatch".into());
                }
                break;
            }
            if consumed == 0 && written == 0 {
                return Err("invalid_archive_stream".into());
            }
        }
    } else {
        if entry.compressed != entry.size {
            return Err("archive_local_mismatch".into());
        }
        loop {
            let n = input.read(&mut buffer).map_err(err)?;
            if n == 0 {
                break;
            }
            emit(&buffer[..n])?;
        }
    }
    if count != entry.size || crc.finalize() != entry.crc {
        return Err("archive_crc_or_size_mismatch".into());
    }
    Ok(())
}
fn validate_file(f: &mut File, limit: u64) -> Result<Vec<Entry>, String> {
    let items = entries(f)?;
    let mut total = 0;
    let deadline = Instant::now() + Duration::from_secs(90);
    for entry in &items {
        stream(f, entry, &mut io::sink(), &mut total, limit, deadline)?;
    }
    Ok(items)
}
pub fn validate_zip(path: &Path) -> Result<(), String> {
    let mut f = source(path)?;
    validate_file(&mut f, MAX_EXPANDED).map(|_| ())
}
fn source(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    let f = options.open(path).map_err(err)?;
    if !f.metadata().map_err(err)?.is_file() {
        return Err("unsafe_package_file".into());
    }
    Ok(f)
}
/// Hash while copying once into a private unlinked file; parser and extraction
/// share that descriptor. No second path lookup can substitute archive bytes.
fn snapshot(path: &Path, expected: &str, work: &Path) -> Result<File, String> {
    let mut input = source(path)?;
    let temp = work.join(format!("archive-{}", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    let mut file = options.open(&temp).map_err(err)?;
    fs::remove_file(&temp).map_err(err)?;
    let mut hash = Sha256::new();
    let mut size = 0u64;
    let mut buffer = [0; 65536];
    loop {
        let n = input.read(&mut buffer).map_err(err)?;
        if n == 0 {
            break;
        }
        size += n as u64;
        if size > super::feed::MAX_PACKAGE {
            return Err("archive_limit".into());
        }
        hash.update(&buffer[..n]);
        file.write_all(&buffer[..n]).map_err(err)?;
    }
    if format!("{:x}", hash.finalize()) != expected {
        return Err("checksum_mismatch".into());
    }
    file.sync_all().map_err(err)?;
    Ok(file)
}
pub fn extract_verified(path: &Path, expected: &str, work: &Path) -> Result<(), String> {
    let mut file = snapshot(path, expected, work)?;
    let entries = validate_file(&mut file, MAX_EXPANDED)?;
    extract(&mut file, &entries, work, MAX_EXPANDED)
}
#[cfg(unix)]
fn extract(file: &mut File, items: &[Entry], work: &Path, limit: u64) -> Result<(), String> {
    use std::{
        ffi::CString,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::fs::OpenOptionsExt,
        },
    };
    let root = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(work)
        .map_err(err)?;
    let mut total = 0;
    let deadline = Instant::now() + Duration::from_secs(90);
    for entry in items {
        let parts = entry
            .name
            .trim_end_matches('/')
            .split('/')
            .collect::<Vec<_>>();
        let mut directory = root.try_clone().map_err(err)?;
        for (i, part) in parts.iter().enumerate() {
            let name = CString::new(*part).map_err(|_| "unsafe_archive_path")?;
            let is_directory = i + 1 < parts.len() || entry.directory;
            if is_directory {
                let result = unsafe { libc::mkdirat(directory.as_raw_fd(), name.as_ptr(), 0o700) };
                if result != 0 && io::Error::last_os_error().kind() != io::ErrorKind::AlreadyExists
                {
                    return Err(err(io::Error::last_os_error()));
                }
                let fd = unsafe {
                    libc::openat(
                        directory.as_raw_fd(),
                        name.as_ptr(),
                        libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                    )
                };
                if fd < 0 {
                    return Err("unsafe_extracted_package".into());
                }
                directory = unsafe { File::from_raw_fd(fd) };
            } else {
                let mode = if entry.mode & 0o111 != 0 {
                    0o755
                } else {
                    0o644
                };
                let fd = unsafe {
                    libc::openat(
                        directory.as_raw_fd(),
                        name.as_ptr(),
                        libc::O_WRONLY
                            | libc::O_CREAT
                            | libc::O_EXCL
                            | libc::O_NOFOLLOW
                            | libc::O_CLOEXEC,
                        mode,
                    )
                };
                if fd < 0 {
                    return Err("unsafe_extracted_package".into());
                }
                let mut output = unsafe { File::from_raw_fd(fd) };
                stream(file, entry, &mut output, &mut total, limit, deadline)?;
                output.sync_all().map_err(err)?;
            }
        }
        if entry.directory {
            stream(file, entry, &mut io::sink(), &mut total, limit, deadline)?;
        }
    }
    root.sync_all().map_err(err)?;
    Ok(())
}
#[cfg(not(unix))]
fn extract(_: &mut File, _: &[Entry], _: &Path, _: u64) -> Result<(), String> {
    Err("automatic_install_unsupported".into())
}
fn u16le(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}
fn u32le(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}
#[cfg(test)]
#[path = "archive_tests.rs"]
mod tests;
