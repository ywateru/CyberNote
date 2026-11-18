//! Optional encrypted-file store for host integrations. macOS production should normally use
//! the re-exported SDK KeyringStore. Android production protection is supplied by the host's
//! Keystore SecureStore/CallbackStore; this module does not implement Android Keystore.
use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use cyberbus_auth::{Error, Result, SecretBytes, SecureStore, StoreMode};
use fs2::FileExt;
use rand::RngCore;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use zeroize::Zeroizing;

const MARKER: &[u8; 8] = b"NCBUS001";
const MAX_BLOB: usize = 4 * 1024 * 1024;
/// Host key retrieval. Existing MUST NOT create a replacement for a missing platform key.
/// Non-exportable Android Keystore keys should use BlobCipher callbacks instead.
pub trait KeyProvider: Send {
    fn key(&mut self, mode: StoreMode) -> Result<Zeroizing<[u8; 32]>>;
}
/// Synchronous authenticated-encryption callbacks; errors must fail closed. Implementations
/// must authenticate both AAD and ciphertext and use fresh nonces for each seal.
pub trait BlobCipher: Send {
    fn seal(&mut self, aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>>;
    fn open(&mut self, aad: &[u8], ciphertext: &[u8]) -> Result<SecretBytes>;
}
pub struct AesGcmCipher {
    key: Zeroizing<[u8; 32]>,
}
impl AesGcmCipher {
    pub fn from_provider(provider: &mut dyn KeyProvider, mode: StoreMode) -> Result<Self> {
        Ok(Self {
            key: provider.key(mode)?,
        })
    }
    /// Explicit test injection, unavailable in normal production builds.
    #[cfg(any(test, feature = "test-key"))]
    pub fn injected_for_tests(key: [u8; 32]) -> Self {
        Self {
            key: Zeroizing::new(key),
        }
    }
}
impl BlobCipher for AesGcmCipher {
    fn seal(&mut self, aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
        let mut nonce = [0u8; 12];
        rand::rngs::OsRng
            .try_fill_bytes(&mut nonce)
            .map_err(|_| Error::Storage)?;
        let cipher = Aes256Gcm::new_from_slice(self.key.as_ref()).map_err(|_| Error::Storage)?;
        let encrypted = cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: plaintext,
                    aad,
                },
            )
            .map_err(|_| Error::Storage)?;
        let mut output = nonce.to_vec();
        output.extend(encrypted);
        Ok(output)
    }
    fn open(&mut self, aad: &[u8], ciphertext: &[u8]) -> Result<SecretBytes> {
        if ciphertext.len() < 28 {
            return Err(Error::Storage);
        }
        let cipher = Aes256Gcm::new_from_slice(self.key.as_ref()).map_err(|_| Error::Storage)?;
        let plain = cipher
            .decrypt(
                Nonce::from_slice(&ciphertext[..12]),
                Payload {
                    msg: &ciphertext[12..],
                    aad,
                },
            )
            .map_err(|_| Error::Storage)?;
        Ok(SecretBytes::new(plain))
    }
}

/// Holds the process-exclusive lock for its complete lifetime. Marker creation precedes the
/// first vault write: interrupted provisioning cannot silently become a fresh identity.
pub struct EncryptedFileStore {
    directory: PathBuf,
    _lock: File,
    cipher: Box<dyn BlobCipher>,
    marker: Vec<u8>,
    initialized: bool,
    poisoned: bool,
    #[cfg(unix)]
    directory_id: (u64, u64),
}
impl EncryptedFileStore {
    pub fn open(
        directory: impl AsRef<Path>,
        cipher: Box<dyn BlobCipher>,
        mode: StoreMode,
    ) -> Result<Self> {
        let directory = directory.as_ref().to_path_buf();
        if !directory.exists() && matches!(mode, StoreMode::CreateNew) {
            let mut builder = fs::DirBuilder::new();
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&directory).map_err(|_| Error::Storage)?;
            File::open(directory.parent().ok_or(Error::Storage)?)
                .and_then(|f| f.sync_all())
                .map_err(|_| Error::Storage)?;
        }
        let metadata = fs::symlink_metadata(&directory).map_err(|_| Error::Storage)?;
        if !metadata.is_dir() {
            return Err(Error::Storage);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.mode() & 0o077 != 0 || metadata.uid() != unsafe { libc::geteuid() } {
                return Err(Error::Storage);
            }
        }
        let lock = private_open(&directory.join("exclusive.lock"), true, false)?;
        lock.try_lock_exclusive().map_err(|_| Error::Conflict)?;
        #[cfg(unix)]
        check_lock_identity(&lock, &directory.join("exclusive.lock"))?;
        let marker_path = directory.join("marker");
        let blob_path = directory.join("vault.aesgcm");
        // symlinks, including dangling symlinks, count as existing and must not be overwritten.
        let marker_exists = fs::symlink_metadata(&marker_path).is_ok();
        let blob_exists = fs::symlink_metadata(&blob_path).is_ok();
        if fs::symlink_metadata(directory.join("vault.tmp")).is_ok() {
            return Err(Error::Storage);
        }
        let initialized = match mode {
            StoreMode::Existing if marker_exists && blob_exists => true,
            StoreMode::CreateNew if !marker_exists && !blob_exists => false,
            _ => return Err(Error::Storage),
        };
        let marker = if initialized {
            let value = read_private(&marker_path, 24)?;
            if value.len() != 24 || &value[..8] != MARKER {
                return Err(Error::Storage);
            }
            value
        } else {
            let mut value = MARKER.to_vec();
            let mut id = [0u8; 16];
            rand::rngs::OsRng
                .try_fill_bytes(&mut id)
                .map_err(|_| Error::Storage)?;
            value.extend(id);
            let mut file = private_open(&marker_path, true, true)?;
            file.write_all(&value)
                .and_then(|_| file.sync_all())
                .map_err(|_| Error::Storage)?;
            sync_directory(&directory)?;
            value
        };
        Ok(Self {
            directory,
            _lock: lock,
            cipher,
            marker,
            initialized,
            poisoned: false,
            #[cfg(unix)]
            directory_id: {
                use std::os::unix::fs::MetadataExt;
                (metadata.dev(), metadata.ino())
            },
        })
    }
    fn check(&mut self) -> Result<()> {
        let result = self.check_identity();
        if result.is_err() {
            // Do not resurrect an owner if a removed/replaced path is later restored.
            self.poisoned = true;
        }
        result
    }
    fn check_identity(&self) -> Result<()> {
        if self.poisoned {
            return Err(Error::Storage);
        }
        let metadata = fs::symlink_metadata(&self.directory).map_err(|_| Error::Storage)?;
        if !metadata.is_dir() {
            return Err(Error::Storage);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if (metadata.dev(), metadata.ino()) != self.directory_id
                || metadata.mode() & 0o077 != 0
                || metadata.uid() != unsafe { libc::geteuid() }
            {
                return Err(Error::Storage);
            }
        }
        #[cfg(unix)]
        check_lock_identity(&self._lock, &self.directory.join("exclusive.lock"))?;
        if read_private(&self.directory.join("marker"), 24)? != self.marker {
            return Err(Error::Storage);
        }
        Ok(())
    }
    fn write_blob(&mut self, value: &[u8]) -> Result<()> {
        self.check()?;
        if value.len() > MAX_BLOB {
            return Err(Error::Storage);
        }
        // Existing ciphertext must still authenticate before replacement; never heal corruption.
        if self.initialized {
            let _ = self.read_blob()?;
        } else if fs::symlink_metadata(self.directory.join("vault.aesgcm")).is_ok() {
            return Err(Error::Storage);
        }
        let data = self.cipher.seal(&self.marker, value)?;
        if data.len() > MAX_BLOB + 1024 {
            return Err(Error::Storage);
        }
        let temporary = self.directory.join("vault.tmp");
        let mut file = private_open(&temporary, true, true)?;
        file.write_all(&data)
            .and_then(|_| file.sync_all())
            .map_err(|_| Error::Storage)?;
        fs::rename(&temporary, self.directory.join("vault.aesgcm")).map_err(|_| Error::Storage)?;
        sync_directory(&self.directory)?;
        self.initialized = true;
        Ok(())
    }
    fn read_blob(&mut self) -> Result<SecretBytes> {
        let data = read_private(&self.directory.join("vault.aesgcm"), MAX_BLOB + 1024)?;
        self.cipher.open(&self.marker, &data)
    }
}
impl SecureStore for EncryptedFileStore {
    fn load(&mut self) -> Result<Option<SecretBytes>> {
        self.check()?;
        if !self.initialized {
            return Ok(None);
        }
        match self.read_blob() {
            Ok(value) => Ok(Some(value)),
            Err(e) => {
                self.poisoned = true;
                Err(e)
            }
        }
    }
    fn replace(&mut self, value: &[u8]) -> Result<()> {
        let result = self.write_blob(value);
        if result.is_err() {
            self.poisoned = true
        }
        result
    }
    fn durable(&self) -> bool {
        true
    }
}
#[cfg(unix)]
fn check_lock_identity(lock: &File, path: &Path) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    let held = lock.metadata().map_err(|_| Error::Storage)?;
    let current = fs::symlink_metadata(path).map_err(|_| Error::Storage)?;
    if (held.dev(), held.ino()) != (current.dev(), current.ino())
        || !held.is_file()
        || !current.is_file()
        || held.nlink() != 1
        || current.nlink() != 1
        || current.mode() & 0o077 != 0
        || current.uid() != unsafe { libc::geteuid() }
    {
        return Err(Error::Storage);
    }
    Ok(())
}
fn sync_directory(path: &Path) -> Result<()> {
    File::open(path)
        .and_then(|f| f.sync_all())
        .map_err(|_| Error::Storage)
}
fn private_open(path: &Path, write: bool, new: bool) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(write);
    if new {
        options.create_new(true);
    } else if write {
        options.create(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    let file = options.open(path).map_err(|_| Error::Storage)?;
    let metadata = file.metadata().map_err(|_| Error::Storage)?;
    if !metadata.is_file() {
        return Err(Error::Storage);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.uid() != unsafe { libc::geteuid() }
            || metadata.mode() & 0o077 != 0
            || metadata.nlink() != 1
        {
            return Err(Error::Storage);
        }
    }
    Ok(file)
}
fn read_private(path: &Path, max: usize) -> Result<Vec<u8>> {
    let file = private_open(path, false, false)?;
    if file.metadata().map_err(|_| Error::Storage)?.len() > max as u64 {
        return Err(Error::Storage);
    }
    let mut value = Vec::new();
    file.take(max as u64 + 1)
        .read_to_end(&mut value)
        .map_err(|_| Error::Storage)?;
    if value.len() > max {
        return Err(Error::Storage);
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cipher(key: u8) -> Box<dyn BlobCipher> {
        Box::new(AesGcmCipher::injected_for_tests([key; 32]))
    }
    fn root(temp: &tempfile::TempDir) -> PathBuf {
        temp.path().join("secure")
    }
    #[test]
    fn encrypted_restart_and_exclusive_owner() {
        if let Some(path) = std::env::var_os("NOTES_CYBERBUS_TEST_LOCK_PATH") {
            assert!(matches!(
                EncryptedFileStore::open(path, cipher(7), StoreMode::Existing),
                Err(Error::Conflict)
            ));
            return;
        }
        let temp = tempfile::tempdir().unwrap();
        let path = root(&temp);
        let mut store = EncryptedFileStore::open(&path, cipher(7), StoreMode::CreateNew).unwrap();
        assert!(store.load().unwrap().is_none());
        store.replace(b"private identity and grant").unwrap();
        assert!(!fs::read(path.join("vault.aesgcm"))
            .unwrap()
            .windows(8)
            .any(|b| b == b"identity"));
        assert!(matches!(
            EncryptedFileStore::open(&path, cipher(7), StoreMode::Existing),
            Err(Error::Conflict)
        ));
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "store::tests::encrypted_restart_and_exclusive_owner",
            ])
            .env("NOTES_CYBERBUS_TEST_LOCK_PATH", &path)
            .status()
            .unwrap();
        assert!(status.success());
        drop(store);
        let mut restored = EncryptedFileStore::open(&path, cipher(7), StoreMode::Existing).unwrap();
        assert_eq!(
            restored.load().unwrap().unwrap().expose(),
            b"private identity and grant"
        );
        restored.replace(b"new blob").unwrap();
        drop(restored);
        assert_eq!(
            EncryptedFileStore::open(&path, cipher(7), StoreMode::Existing)
                .unwrap()
                .load()
                .unwrap()
                .unwrap()
                .expose(),
            b"new blob"
        );
        assert!(EncryptedFileStore::open(&path, cipher(7), StoreMode::CreateNew).is_err());
    }
    #[test]
    fn tamper_and_wrong_key_fail_closed_without_repair() {
        for tamper in [true, false] {
            let temp = tempfile::tempdir().unwrap();
            let path = root(&temp);
            let mut store =
                EncryptedFileStore::open(&path, cipher(7), StoreMode::CreateNew).unwrap();
            store.replace(b"secret").unwrap();
            drop(store);
            if tamper {
                let mut b = fs::read(path.join("vault.aesgcm")).unwrap();
                b[15] ^= 1;
                fs::write(path.join("vault.aesgcm"), b).unwrap();
            }
            let before = fs::read(path.join("vault.aesgcm")).unwrap();
            let mut store = EncryptedFileStore::open(
                &path,
                cipher(if tamper { 7 } else { 8 }),
                StoreMode::Existing,
            )
            .unwrap();
            assert!(store.load().is_err());
            assert!(store.replace(b"replacement").is_err());
            drop(store);
            assert_eq!(before, fs::read(path.join("vault.aesgcm")).unwrap());
            assert!(EncryptedFileStore::open(&path, cipher(7), StoreMode::CreateNew).is_err());
        }
    }
    #[test]
    fn missing_marker_blob_or_interrupted_provisioning_never_recreates() {
        let temp = tempfile::tempdir().unwrap();
        assert!(EncryptedFileStore::open(root(&temp), cipher(1), StoreMode::Existing).is_err());
        for missing in ["marker", "vault.aesgcm"] {
            let temp = tempfile::tempdir().unwrap();
            let path = root(&temp);
            let mut s = EncryptedFileStore::open(&path, cipher(1), StoreMode::CreateNew).unwrap();
            s.replace(b"secret").unwrap();
            drop(s);
            fs::remove_file(path.join(missing)).unwrap();
            assert!(EncryptedFileStore::open(&path, cipher(1), StoreMode::Existing).is_err());
            assert!(EncryptedFileStore::open(&path, cipher(1), StoreMode::CreateNew).is_err());
        }
        let path = root(&temp);
        drop(EncryptedFileStore::open(&path, cipher(1), StoreMode::CreateNew).unwrap());
        assert!(EncryptedFileStore::open(&path, cipher(1), StoreMode::CreateNew).is_err());
        assert!(EncryptedFileStore::open(&path, cipher(1), StoreMode::Existing).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn symlink_and_public_directory_refused() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let temp = tempfile::tempdir().unwrap();
        let path = root(&temp);
        let mut s = EncryptedFileStore::open(&path, cipher(1), StoreMode::CreateNew).unwrap();
        s.replace(b"secret").unwrap();
        drop(s);
        fs::rename(path.join("vault.aesgcm"), path.join("real")).unwrap();
        symlink(path.join("real"), path.join("vault.aesgcm")).unwrap();
        assert!(
            EncryptedFileStore::open(&path, cipher(1), StoreMode::Existing)
                .unwrap()
                .load()
                .is_err()
        );
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(EncryptedFileStore::open(&path, cipher(1), StoreMode::Existing).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn replaced_lock_file_and_marker_fail_closed() {
        for target in ["exclusive.lock", "marker"] {
            let temp = tempfile::tempdir().unwrap();
            let path = root(&temp);
            let mut s = EncryptedFileStore::open(&path, cipher(7), StoreMode::CreateNew).unwrap();
            s.replace(b"secret").unwrap();
            fs::rename(path.join(target), path.join("old")).unwrap();
            let mut replacement = private_open(&path.join(target), true, true).unwrap();
            replacement.write_all(b"replacement").unwrap();
            assert!(s.load().is_err());
            assert!(s.replace(b"repair").is_err());
        }
    }
    #[cfg(unix)]
    #[test]
    fn unlinked_or_replaced_lock_reopen_cannot_keep_old_owner_usable() {
        if let Some(path) = std::env::var_os("NOTES_CYBERBUS_REOPEN_LOCK_PATH") {
            let mut reopened =
                EncryptedFileStore::open(path, cipher(7), StoreMode::Existing).unwrap();
            assert_eq!(reopened.load().unwrap().unwrap().expose(), b"original");
            reopened.replace(b"new owner").unwrap();
            return;
        }
        for unlink in [true, false] {
            let temp = tempfile::tempdir().unwrap();
            let path = root(&temp);
            let lock = path.join("exclusive.lock");
            let mut first =
                EncryptedFileStore::open(&path, cipher(7), StoreMode::CreateNew).unwrap();
            first.replace(b"original").unwrap();
            if unlink {
                fs::remove_file(&lock).unwrap();
            } else {
                // Atomic replacement leaves the held inode alive at another pathname.
                fs::rename(&lock, path.join("previous.lock")).unwrap();
                drop(private_open(&path.join("replacement.lock"), true, true).unwrap());
                fs::rename(path.join("replacement.lock"), &lock).unwrap();
            }
            // The original owner must fail even before another process opens the new path.
            assert!(matches!(first.load(), Err(Error::Storage)));
            let status = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "store::tests::unlinked_or_replaced_lock_reopen_cannot_keep_old_owner_usable",
                ])
                .env("NOTES_CYBERBUS_REOPEN_LOCK_PATH", &path)
                .status()
                .unwrap();
            assert!(status.success());
            assert!(matches!(first.load(), Err(Error::Storage)));
            let before = fs::read(path.join("vault.aesgcm")).unwrap();
            assert!(matches!(
                first.replace(b"stale overwrite"),
                Err(Error::Storage)
            ));
            assert_eq!(fs::read(path.join("vault.aesgcm")).unwrap(), before);
            drop(first);
            let mut reopened =
                EncryptedFileStore::open(&path, cipher(7), StoreMode::Existing).unwrap();
            assert_eq!(reopened.load().unwrap().unwrap().expose(), b"new owner");
        }
    }
    #[cfg(unix)]
    #[test]
    fn lock_identity_failure_stays_closed_after_path_restoration() {
        let temp = tempfile::tempdir().unwrap();
        let path = root(&temp);
        let mut store = EncryptedFileStore::open(&path, cipher(7), StoreMode::CreateNew).unwrap();
        store.replace(b"original").unwrap();
        fs::rename(path.join("exclusive.lock"), path.join("held.lock")).unwrap();
        assert!(matches!(store.load(), Err(Error::Storage)));
        fs::rename(path.join("held.lock"), path.join("exclusive.lock")).unwrap();
        assert!(matches!(store.load(), Err(Error::Storage)));
        assert!(matches!(store.replace(b"resurrected"), Err(Error::Storage)));
        drop(store);
        let mut reopened = EncryptedFileStore::open(&path, cipher(7), StoreMode::Existing).unwrap();
        assert_eq!(reopened.load().unwrap().unwrap().expose(), b"original");
    }
}
