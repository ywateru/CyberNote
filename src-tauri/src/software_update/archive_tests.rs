use super::*;
use flate2::{write::DeflateEncoder, Compression};
fn zip(name: &str, body: &[u8], deflate: bool, descriptor: bool) -> Vec<u8> {
    let crc = crc32fast::hash(body);
    let packed = if deflate {
        let mut enc = DeflateEncoder::new(vec![], Compression::best());
        enc.write_all(body).unwrap();
        enc.finish().unwrap()
    } else {
        body.to_vec()
    };
    let method = if deflate { 8u16 } else { 0 };
    let flags = if descriptor { 8u16 } else { 0 };
    let mut b = vec![];
    b.extend(b"PK\x03\x04");
    for v in [20, flags, method, 0, 0] {
        b.extend(v.to_le_bytes());
    }
    for v in if descriptor {
        [0, 0, 0]
    } else {
        [crc, packed.len() as u32, body.len() as u32]
    } {
        b.extend(v.to_le_bytes());
    }
    b.extend((name.len() as u16).to_le_bytes());
    b.extend(0u16.to_le_bytes());
    b.extend(name.as_bytes());
    b.extend(&packed);
    if descriptor {
        b.extend(b"PK\x07\x08");
        for v in [crc, packed.len() as u32, body.len() as u32] {
            b.extend(v.to_le_bytes());
        }
    }
    let offset = b.len() as u32;
    b.extend(b"PK\x01\x02");
    for v in [0x314u16, 20, flags, method, 0, 0] {
        b.extend(v.to_le_bytes());
    }
    for v in [crc, packed.len() as u32, body.len() as u32] {
        b.extend(v.to_le_bytes());
    }
    b.extend((name.len() as u16).to_le_bytes());
    for _ in 0..4 {
        b.extend(0u16.to_le_bytes());
    }
    b.extend((0o100755u32 << 16).to_le_bytes());
    b.extend(0u32.to_le_bytes());
    b.extend(name.as_bytes());
    let length = b.len() as u32 - offset;
    b.extend(b"PK\x05\x06");
    for v in [0u16, 0, 1, 1] {
        b.extend(v.to_le_bytes());
    }
    b.extend(length.to_le_bytes());
    b.extend(offset.to_le_bytes());
    b.extend(0u16.to_le_bytes());
    b
}
fn central(b: &[u8]) -> usize {
    b.windows(4).position(|p| p == b"PK\x01\x02").unwrap()
}
fn checked(bytes: &[u8]) -> Result<(), String> {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("a.zip");
    fs::write(&p, bytes).unwrap();
    validate_zip(&p)
}
#[test]
fn understated_deflate_actual_budget_crc_and_truncated_streams() {
    let original = zip(
        "CyberNote.app/Contents/MacOS/fixture",
        &vec![0; 8 * 1024 * 1024],
        true,
        false,
    );
    assert!(original.len() < 10000);
    checked(&original).unwrap();
    // Exact independent-review negative: central size lies, local does not.
    let mut central_only = original.clone();
    let c = central(&central_only);
    central_only[c + 24..c + 28].copy_from_slice(&1u32.to_le_bytes());
    assert!(checked(&central_only).is_err());
    // Both headers lie consistently: only actual inflate accounting can catch it.
    let mut both = central_only;
    both[22..26].copy_from_slice(&1u32.to_le_bytes());
    assert_eq!(checked(&both).unwrap_err(), "archive_limit");
    let mut bad_crc = original.clone();
    let c = central(&bad_crc);
    bad_crc[c + 16..c + 20].copy_from_slice(&0u32.to_le_bytes());
    bad_crc[14..18].copy_from_slice(&0u32.to_le_bytes());
    assert_eq!(
        checked(&bad_crc).unwrap_err(),
        "archive_crc_or_size_mismatch"
    );
    // Remove the final byte of the compressed stream and make both sizes agree.
    let mut truncated = original.clone();
    let size = u32le(&truncated, 18);
    let end = 30 + u16le(&truncated, 26) as usize + size as usize;
    truncated.remove(end - 1);
    let c = central(&truncated);
    truncated[18..22].copy_from_slice(&(size - 1).to_le_bytes());
    truncated[c + 20..c + 24].copy_from_slice(&(size - 1).to_le_bytes());
    let e = truncated.len() - 22;
    truncated[e + 16..e + 20].copy_from_slice(&(c as u32).to_le_bytes());
    assert!(checked(&truncated).is_err());
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("budget.zip");
    fs::write(&p, &original).unwrap();
    let mut f = source(&p).unwrap();
    let entries = entries(&mut f).unwrap();
    let mut disk = vec![];
    let error = stream(
        &mut f,
        &entries[0],
        &mut disk,
        &mut 0,
        128 * 1024,
        Instant::now() + Duration::from_secs(2),
    )
    .unwrap_err();
    assert_eq!(error, "archive_limit");
    assert!(disk.len() <= 128 * 1024);
}
#[test]
fn descriptors_verified_and_zip64_extra_rejected() {
    let valid = zip("CyberNote.app/file", b"descriptor body", true, true);
    checked(&valid).unwrap();
    let mut invalid = valid.clone();
    let descriptor = invalid.windows(4).position(|p| p == b"PK\x07\x08").unwrap();
    invalid[descriptor + 4] ^= 1;
    assert!(checked(&invalid).is_err());
    for local in [false, true] {
        let mut b = zip("CyberNote.app/file", b"x", false, false);
        let c = central(&b);
        let at = if local {
            30 + u16le(&b, 26) as usize
        } else {
            c + 46 + u16le(&b, c + 28) as usize
        };
        b.splice(at..at, [1u8, 0, 0, 0]);
        let c = central(&b);
        let size_at = if local { 28 } else { c + 30 };
        b[size_at..size_at + 2].copy_from_slice(&4u16.to_le_bytes());
        let e = b.len() - 22;
        b[e + 12..e + 16].copy_from_slice(&((e - c) as u32).to_le_bytes());
        b[e + 16..e + 20].copy_from_slice(&(c as u32).to_le_bytes());
        assert_eq!(checked(&b).unwrap_err(), "zip64_archive");
    }
}
#[test]
fn private_snapshot_extracts_verified_bytes_despite_source_path_replacement() {
    let d = tempfile::tempdir().unwrap();
    let work = d.path().join("work");
    fs::create_dir(&work).unwrap();
    let source_path = d.path().join("source.zip");
    let bytes = zip(
        "CyberNote.app/Contents/MacOS/fixture",
        b"original executable",
        true,
        false,
    );
    fs::write(&source_path, &bytes).unwrap();
    let expected = format!("{:x}", Sha256::digest(&bytes));
    let mut pinned = snapshot(&source_path, &expected, &work).unwrap();
    let replacement = d.path().join("changed.zip");
    fs::write(
        &replacement,
        zip(
            "CyberNote.app/Contents/MacOS/fixture",
            b"changed",
            true,
            false,
        ),
    )
    .unwrap();
    fs::rename(replacement, &source_path).unwrap();
    let items = validate_file(&mut pinned, MAX_EXPANDED).unwrap();
    extract(&mut pinned, &items, &work, MAX_EXPANDED).unwrap();
    assert_eq!(
        fs::read(work.join("CyberNote.app/Contents/MacOS/fixture")).unwrap(),
        b"original executable"
    );
    assert!(snapshot(&source_path, &expected, &work).is_err());
    assert!(!fs::read_dir(&work).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("archive-")));
}
#[cfg(unix)]
#[test]
fn extraction_never_follows_preexisting_parent_link() {
    let d = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let path = d.path().join("x.zip");
    let work = d.path().join("work");
    fs::create_dir(&work).unwrap();
    std::os::unix::fs::symlink(outside.path(), work.join("CyberNote.app")).unwrap();
    let bytes = zip("CyberNote.app/escape", b"no", false, false);
    fs::write(&path, &bytes).unwrap();
    assert!(extract_verified(&path, &format!("{:x}", Sha256::digest(&bytes)), &work).is_err());
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
}
