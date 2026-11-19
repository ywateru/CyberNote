use super::storage::err;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};
/// Validate ZIP central AND local names before invoking the system extractor.
/// No ZIP64, encrypted entries, links, devices, duplicate paths, or traversal.
/// Release apps currently contain ordinary files only; fail closed on a new shape.
pub fn validate_zip(path: &Path) -> Result<(), String> {
    let mut f = File::open(path).map_err(err)?;
    let size = f.metadata().map_err(err)?.len();
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
    let central_size = u32le(&tail, end + 12) as usize;
    let offset = u32le(&tail, end + 16) as u64;
    if count == 0
        || count > 20000
        || central_size > 16 * 1024 * 1024
        || offset + central_size as u64 != size - tail_len as u64 + end as u64
    {
        return Err("archive_limit".into());
    }
    f.seek(SeekFrom::Start(offset)).map_err(err)?;
    let mut bytes = vec![0; central_size];
    f.read_exact(&mut bytes).map_err(err)?;
    let mut pos = 0;
    let mut total = 0u64;
    let mut names = std::collections::HashSet::new();
    let mut ranges = Vec::new();
    for _ in 0..count {
        if pos + 46 > bytes.len() || &bytes[pos..pos + 4] != b"PK\x01\x02" {
            return Err("invalid_archive".into());
        }
        let n = u16le(&bytes, pos + 28) as usize;
        let extra = u16le(&bytes, pos + 30) as usize;
        let comment = u16le(&bytes, pos + 32) as usize;
        let stop = pos + 46 + n + extra + comment;
        if stop > bytes.len() {
            return Err("invalid_archive".into());
        }
        let name = std::str::from_utf8(&bytes[pos + 46..pos + 46 + n])
            .map_err(|_| "invalid_archive_path")?;
        if name.len() > 1024
            || name.contains(['\\', '\0', ':'])
            || !(name.starts_with("CyberNote.app/") || name.starts_with("__MACOSX/"))
            || name
                .trim_end_matches('/')
                .split('/')
                .any(|p| p.is_empty() || p == "." || p == "..")
        {
            return Err("unsafe_archive_path".into());
        }
        // macOS's default FS is case insensitive; reject case aliases as well.
        if !names.insert(name.trim_end_matches('/').to_lowercase()) {
            return Err("duplicate_archive_path".into());
        }
        let mode = u32le(&bytes, pos + 38) >> 16;
        let kind = mode & 0o170000;
        if kind != 0 && kind != 0o100000 && kind != 0o040000 {
            return Err("archive_link_or_device".into());
        }
        let flags = u16le(&bytes, pos + 8);
        let method = u16le(&bytes, pos + 10);
        if flags & 1 != 0 || ![0, 8].contains(&method) || u16le(&bytes, pos + 34) != 0 {
            return Err("unsupported_archive".into());
        }
        total = total
            .checked_add(u32le(&bytes, pos + 24) as u64)
            .ok_or("archive_limit")?;
        if total > 2 * 1024 * 1024 * 1024 {
            return Err("archive_limit".into());
        }
        let local = u32le(&bytes, pos + 42) as u64;
        f.seek(SeekFrom::Start(local)).map_err(err)?;
        let mut header = [0; 30];
        f.read_exact(&mut header).map_err(err)?;
        if &header[..4] != b"PK\x03\x04"
            || u16le(&header, 6) != flags
            || u16le(&header, 8) != method
            || u16le(&header, 26) as usize != n
        {
            return Err("archive_local_mismatch".into());
        }
        let mut local_name = vec![0; n];
        f.read_exact(&mut local_name).map_err(err)?;
        if local_name != name.as_bytes() {
            return Err("archive_local_mismatch".into());
        }
        let data_end =
            local + 30 + n as u64 + u16le(&header, 28) as u64 + u32le(&bytes, pos + 20) as u64;
        if data_end > offset {
            return Err("archive_overlap".into());
        }
        ranges.push((local, data_end));
        pos = stop;
    }
    ranges.sort_unstable();
    if pos != bytes.len() || ranges.windows(2).any(|r| r[0].1 > r[1].0) {
        return Err("archive_overlap".into());
    }
    Ok(())
}
fn u16le(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}
fn u32le(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}
