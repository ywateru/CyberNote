//! Production secure installation storage. CyberBus is the sole grant owner.
use super::{
    private,
    types::{CredentialStorage, Error, Result},
};
use notes_cyberbus::{
    store::{AesGcmCipher, EncryptedFileStore, LocalFileKeyProvider},
    SecureStore, StoreMode,
};
use std::path::Path;

const STORAGE_PREFERENCE: &str = "cyberbus-storage-v1";
const FILE_MARKER: &str = "cyberbus-file-installation-v1";
const FILE_MARKER_BYTES: &[u8] = b"cyberbus-file-installation-v1\n";
const FILE_KEY: &str = "cyberbus-file-key-v1";
const FILE_VAULT: &str = "cyberbus-file-vault-v1";

pub(super) fn available_storage() -> Option<CredentialStorage> {
    #[cfg(target_os = "macos")]
    return Some(CredentialStorage::Keychain);
    #[cfg(not(target_os = "macos"))]
    None
}

pub(super) fn selected_storage(root: &Path) -> Result<Option<CredentialStorage>> {
    #[cfg(target_os = "android")]
    {
        let _ = root;
        // Android uses the platform-backed CyberBusSecureStore. Keep the
        // status model populated so account startup does not fail before the
        // Android store is opened.
        return Ok(Some(CredentialStorage::EncryptedFile));
    }
    #[cfg(target_os = "macos")]
    {
        private::directory(root)?;
        return match private::read_bytes(&root.join(STORAGE_PREFERENCE), 32)? {
            // Existing installations keep the storage they already used.
            // New installations use the encrypted local file so Keychain
            // remains an explicit, optional choice.
            None if private::read_bytes(&root.join("cyberbus-installation-v1"), 64)?.is_some() => {
                Ok(Some(CredentialStorage::Keychain))
            }
            None if private::read_bytes(&root.join(FILE_MARKER), 64)?.is_some() => {
                Ok(Some(CredentialStorage::EncryptedFile))
            }
            None => Ok(Some(CredentialStorage::EncryptedFile)),
            Some(bytes) if bytes == b"keychain\n" => Ok(Some(CredentialStorage::Keychain)),
            Some(bytes) if bytes == b"encrypted-file\n" => {
                Ok(Some(CredentialStorage::EncryptedFile))
            }
            Some(_) => Err(Error::Storage),
        };
    }
    #[cfg(not(any(target_os = "macos", target_os = "android")))]
    {
        let _ = root;
        Ok(None)
    }
}

pub(super) fn set_selected_storage(root: &Path, storage: CredentialStorage) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let bytes = match storage {
            CredentialStorage::Keychain => b"keychain\n".as_slice(),
            CredentialStorage::EncryptedFile => b"encrypted-file\n".as_slice(),
        };
        return private::atomic_write(&root.join(STORAGE_PREFERENCE), bytes);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (root, storage);
        Err(Error::Unsupported)
    }
}

/// The nonsecret provision marker is written BEFORE the SDK creates its vault.
/// Interruption after this point requires recovery; a missing grant/installation
/// blob on subsequent launch can never silently create a replacement identity.
pub(super) fn store(
    app: &tauri::AppHandle,
    root: &Path,
    storage: CredentialStorage,
) -> Result<(Box<dyn SecureStore>, StoreMode)> {
    #[cfg(target_os = "android")]
    {
        let _ = storage;
        return android::open();
    }
    #[cfg(not(target_os = "android"))]
    let _ = app;
    private::directory(root)?;
    #[cfg(target_os = "macos")]
    if storage == CredentialStorage::EncryptedFile {
        return encrypted_file_store(root);
    }
    let marker = root.join("cyberbus-installation-v1");
    let mode = match private::read_bytes(&marker, 64)? {
        Some(bytes) if bytes == b"cyberbus-installation-v1\n" => StoreMode::Existing,
        Some(_) => return Err(Error::Storage),
        None => StoreMode::CreateNew,
    };
    #[cfg(target_os = "macos")]
    let mut store: Box<dyn SecureStore> = {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        use sha2::{Digest, Sha256};
        let canonical = std::fs::canonicalize(root).map_err(|_| Error::Storage)?;
        let account =
            URL_SAFE_NO_PAD.encode(Sha256::digest(canonical.as_os_str().as_encoded_bytes()));
        Box::new(
            notes_cyberbus::KeyringStore::open(
                "com.local.notesclone.cyberbus.v1",
                &account,
                &root.join("cyberbus.lock"),
            )
            .map_err(|_| Error::Storage)?,
        )
    };

    #[cfg(not(any(target_os = "macos", target_os = "android")))]
    return Err(Error::Unsupported);
    #[cfg(target_os = "macos")]
    {
        if matches!(mode, StoreMode::CreateNew) {
            if store.load().map_err(|_| Error::Storage)?.is_some() {
                return Err(Error::Storage);
            }
            private::atomic_write(&marker, b"cyberbus-installation-v1\n")?;
        }
        Ok((store, mode))
    }
}

#[cfg(target_os = "macos")]
fn encrypted_file_store(root: &Path) -> Result<(Box<dyn SecureStore>, StoreMode)> {
    let marker = root.join(FILE_MARKER);
    let mode = match private::read_bytes(&marker, 64)? {
        Some(bytes) if bytes == FILE_MARKER_BYTES => StoreMode::Existing,
        Some(_) => return Err(Error::Storage),
        None => StoreMode::CreateNew,
    };
    if matches!(mode, StoreMode::CreateNew) {
        // Publish the nonsecret marker before either the local key or the SDK
        // vault. An interruption from this point onward must fail closed.
        private::atomic_create(&marker, FILE_MARKER_BYTES)?;
    }
    let mut provider = LocalFileKeyProvider::new(root.join(FILE_KEY));
    let cipher = AesGcmCipher::from_provider(&mut provider, mode).map_err(|_| Error::Storage)?;
    let store = EncryptedFileStore::open(root.join(FILE_VAULT), Box::new(cipher), mode)
        .map_err(|_| Error::Storage)?;
    Ok((Box::new(store), mode))
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::fs;

    fn root() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn marker(path: &Path, bytes: &[u8]) {
        private::atomic_write(path, bytes).unwrap();
    }

    #[test]
    fn new_install_defaults_to_encrypted_file() {
        let dir = root();
        assert_eq!(
            selected_storage(dir.path()).unwrap(),
            Some(CredentialStorage::EncryptedFile)
        );
    }

    #[test]
    fn legacy_keychain_marker_preserves_existing_installation() {
        let dir = root();
        marker(
            &dir.path().join("cyberbus-installation-v1"),
            b"cyberbus-installation-v1\n",
        );
        assert_eq!(
            selected_storage(dir.path()).unwrap(),
            Some(CredentialStorage::Keychain)
        );
    }

    #[test]
    fn encrypted_file_marker_restores_interrupted_selection() {
        let dir = root();
        marker(&dir.path().join(FILE_MARKER), FILE_MARKER_BYTES);
        assert_eq!(
            selected_storage(dir.path()).unwrap(),
            Some(CredentialStorage::EncryptedFile)
        );
    }

    #[test]
    fn explicit_storage_preference_wins_over_installation_markers() {
        let dir = root();
        marker(
            &dir.path().join("cyberbus-installation-v1"),
            b"cyberbus-installation-v1\n",
        );
        marker(&dir.path().join(FILE_MARKER), FILE_MARKER_BYTES);
        marker(&dir.path().join(STORAGE_PREFERENCE), b"encrypted-file\n");
        assert_eq!(
            selected_storage(dir.path()).unwrap(),
            Some(CredentialStorage::EncryptedFile)
        );
        set_selected_storage(dir.path(), CredentialStorage::Keychain).unwrap();
        assert_eq!(
            selected_storage(dir.path()).unwrap(),
            Some(CredentialStorage::Keychain)
        );
    }

    #[test]
    fn invalid_preference_fails_closed_and_markers_remain_presence_signals() {
        let dir = root();
        marker(&dir.path().join(STORAGE_PREFERENCE), b"unknown\n");
        assert_eq!(selected_storage(dir.path()), Err(Error::Storage));
        fs::remove_file(dir.path().join(STORAGE_PREFERENCE)).unwrap();
        marker(
            &dir.path().join("cyberbus-installation-v1"),
            b"unexpected\n",
        );
        // The legacy marker's bytes are validated when opening that store.
        assert_eq!(
            selected_storage(dir.path()).unwrap(),
            Some(CredentialStorage::Keychain)
        );
        marker(&dir.path().join(FILE_MARKER), b"unexpected\n");
        fs::remove_file(dir.path().join("cyberbus-installation-v1")).unwrap();
        // Likewise, a malformed file marker is a valid presence signal here;
        // encrypted_file_store rejects it before opening credentials.
        assert_eq!(
            selected_storage(dir.path()).unwrap(),
            Some(CredentialStorage::EncryptedFile)
        );
    }
}
#[cfg(target_os = "android")]
mod android {
    use super::*;
    use cyberbus_auth::{Error as S, Result as SR, SecretBytes};
    use jni::{
        objects::{GlobalRef, JByteArray, JClass, JObject, JString, JValue},
        JNIEnv, JavaVM,
    };
    struct Store {
        vm: JavaVM,
        object: GlobalRef,
    }
    fn exception(env: &mut JNIEnv<'_>) -> S {
        let thrown = env.exception_occurred().ok();
        let _ = env.exception_clear();
        let conflict = thrown.as_ref().is_some_and(|e| {
            env.is_instance_of(e, "java/lang/IllegalStateException")
                .unwrap_or(false)
                && env
                    .call_method(e, "getMessage", "()Ljava/lang/String;", &[])
                    .ok()
                    .and_then(|v| v.l().ok())
                    .and_then(|v| env.get_string(&JString::from(v)).ok().map(String::from))
                    .is_some_and(|s| s == "conflict")
        });
        let _ = env.exception_clear();
        if conflict {
            S::Conflict
        } else {
            S::Storage
        }
    }
    pub fn open() -> Result<(Box<dyn SecureStore>, StoreMode)> {
        let context = ndk_context::android_context();
        let vm = unsafe { JavaVM::from_raw(context.vm().cast()) }.map_err(|_| Error::Storage)?;
        let (object, mode) = {
            let mut env = vm.attach_current_thread().map_err(|_| Error::Storage)?;
            let result=env.with_local_frame(32,|env| {
                let context=unsafe {JObject::from_raw(context.context().cast())};
                let app=env.call_method(&context,"getApplicationContext","()Landroid/content/Context;",&[])?.l()?;
                let directory=env.call_method(&app,"getNoBackupFilesDir","()Ljava/io/File;",&[])?.l()?;
                let path=JString::from(env.call_method(&directory,"getCanonicalPath","()Ljava/lang/String;",&[])?.l()?);
                let base:String=env.get_string(&path)?.into();
                let root=Path::new(&base).join("cyberbus");
                let first=match std::fs::symlink_metadata(&root) {Err(e) if e.kind()==std::io::ErrorKind::NotFound=>true,_=>false};
                let loader=env.call_method(&app,"getClassLoader","()Ljava/lang/ClassLoader;",&[])?.l()?;
                let class_name=env.new_string("com.local.notesauth.CyberBusSecureStore")?;
                let class=JClass::from(env.call_method(&loader,"loadClass","(Ljava/lang/String;)Ljava/lang/Class;",&[JValue::Object(class_name.as_ref())])?.l()?);
                let root=env.new_string(root.to_string_lossy())?;
                let object=env.call_static_method(&class,"lock","(Landroid/content/Context;Ljava/lang/String;Z)Lcom/local/notesauth/CyberBusSecureStore;",&[JValue::Object(&app),JValue::Object(root.as_ref()),JValue::Bool(u8::from(first))])?.l()?;
                Ok::<_,jni::errors::Error>((env.new_global_ref(object)?,if first {StoreMode::CreateNew}else{StoreMode::Existing}))
            });
            result.map_err(|_| match exception(&mut env) {
                S::Conflict => Error::Busy,
                _ => Error::Storage,
            })?
        };
        Ok((Box::new(Store { vm, object }), mode))
    }
    impl SecureStore for Store {
        fn load(&mut self) -> SR<Option<SecretBytes>> {
            let mut env = self.vm.attach_current_thread().map_err(|_| S::Storage)?;
            let result = env.with_local_frame(16, |env| {
                let bytes = env
                    .call_method(self.object.as_obj(), "load", "()[B", &[])?
                    .l()?;
                if bytes.is_null() {
                    return Ok(None);
                }
                let bytes = JByteArray::from(bytes);
                Ok::<_, jni::errors::Error>(Some(SecretBytes::new(env.convert_byte_array(&bytes)?)))
            });
            result.map_err(|_| exception(&mut env))
        }
        fn replace(&mut self, value: &[u8]) -> SR<()> {
            if value.is_empty() || value.len() > 8 * 1024 * 1024 {
                return Err(S::Storage);
            }
            let mut env = self.vm.attach_current_thread().map_err(|_| S::Storage)?;
            let result = env.with_local_frame(16, |env| {
                let bytes = env.byte_array_from_slice(value)?;
                let result = env.call_method(
                    self.object.as_obj(),
                    "save",
                    "([B)V",
                    &[JValue::Object(bytes.as_ref())],
                );
                // Clear pending exceptions before zeroing the temporary Java copy;
                // retain only the finite conflict/storage classification.
                let failure = result.as_ref().err().map(|_| exception(env));
                let zeros = vec![0i8; value.len()];
                env.set_byte_array_region(&bytes, 0, &zeros)?;
                Ok::<_, jni::errors::Error>(failure)
            });
            match result {
                Ok(None) => Ok(()),
                Ok(Some(e)) => Err(e),
                Err(_) => Err(exception(&mut env)),
            }
        }
        fn durable(&self) -> bool {
            true
        }
    }
    impl Drop for Store {
        fn drop(&mut self) {
            if let Ok(mut env) = self.vm.attach_current_thread() {
                let _ = env.call_method(self.object.as_obj(), "close", "()V", &[]);
                let _ = env.exception_clear();
            }
        }
    }
}
