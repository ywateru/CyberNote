//! Production secure installation storage. CyberBus is the sole grant owner.
use super::{
    private,
    types::{Error, Result},
};
use notes_cyberbus::{
    store::{AesGcmCipher, EncryptedFileStore, LocalFileKeyProvider},
    SecureStore, StoreMode,
};
use std::{
    fs::{self, File},
    path::Path,
};

const LEGACY_KEYCHAIN_MARKER: &str = "cyberbus-installation-v1";
const LEGACY_STORAGE_PREFERENCE: &str = "cyberbus-storage-v1";
const FILE_MARKER: &str = "cyberbus-file-installation-v1";
const FILE_MARKER_BYTES: &[u8] = b"cyberbus-file-installation-v1\n";
const FILE_KEY: &str = "cyberbus-file-key-v1";
const FILE_VAULT: &str = "cyberbus-file-vault-v1";

/// One-way local migration for installations that still point at the retired
/// macOS Keychain backend. The old Keychain item is never read or removed.
/// Its current binding is archived so a fresh local-file login can reuse the
/// same verified device identity without silently restoring an old grant.
pub(super) fn migrate_legacy_keychain(root: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        private::directory(root)?;
        let preference = private::read_bytes(&root.join(LEGACY_STORAGE_PREFERENCE), 32)?;
        let marker = private::read_bytes(&root.join(LEGACY_KEYCHAIN_MARKER), 64)?.is_some();
        let legacy = match preference.as_deref() {
            None => marker,
            Some(b"keychain\n") => true,
            Some(b"encrypted-file\n") => false,
            Some(_) => return Err(Error::Storage),
        };
        if !legacy {
            return Ok(());
        }
        private::clear_session(root)?;
        remove_private_file(&root.join(LEGACY_KEYCHAIN_MARKER))?;
        remove_private_file(&root.join(LEGACY_STORAGE_PREFERENCE))?;
        File::open(root)?.sync_all()?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "android")))]
    {
        let _ = root;
        Ok(())
    }
    #[cfg(target_os = "android")]
    {
        let _ = root;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn remove_private_file(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            fs::remove_file(path)?;
            Ok(())
        }
        _ => Err(Error::Storage),
    }
}

/// The nonsecret provision marker is written BEFORE the SDK creates its vault.
/// Interruption after this point requires recovery; a missing grant/installation
/// blob on subsequent launch can never silently create a replacement identity.
pub(super) fn store(root: &Path) -> Result<(Box<dyn SecureStore>, StoreMode)> {
    #[cfg(target_os = "android")]
    {
        let _ = root;
        return android::open();
    }
    #[cfg(target_os = "macos")]
    return encrypted_file_store(root);
    #[cfg(not(any(target_os = "macos", target_os = "android")))]
    {
        let _ = root;
        Err(Error::Unsupported)
    }
}

#[cfg(target_os = "macos")]
fn encrypted_file_store(root: &Path) -> Result<(Box<dyn SecureStore>, StoreMode)> {
    private::directory(root)?;
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

    fn binding() -> private::Binding {
        private::Binding {
            issuer: super::super::config::ISSUER.into(),
            subject: "test-subject".into(),
            product_id: super::super::config::PRODUCT_ID.into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: uuid::Uuid::new_v4().to_string(),
            noise_public_key: "test-noise-key".into(),
            enabled: true,
        }
    }

    #[test]
    fn new_install_uses_local_encrypted_file_without_keychain_marker() {
        let dir = root();
        let (_store, mode) = store(dir.path()).unwrap();
        assert!(matches!(mode, StoreMode::CreateNew));
        assert_eq!(
            fs::read(dir.path().join(FILE_MARKER)).unwrap(),
            FILE_MARKER_BYTES
        );
        assert!(!dir.path().join(LEGACY_KEYCHAIN_MARKER).exists());
    }

    #[test]
    fn legacy_keychain_migration_archives_binding_and_removes_markers() {
        let dir = root();
        let binding = binding();
        private::write(&dir.path().join("binding.json"), &binding).unwrap();
        marker(
            &dir.path().join(LEGACY_KEYCHAIN_MARKER),
            b"cyberbus-installation-v1\n",
        );
        migrate_legacy_keychain(dir.path()).unwrap();
        assert!(!dir.path().join("binding.json").exists());
        assert_eq!(
            private::remembered_session(dir.path(), &binding.device_id)
                .unwrap()
                .unwrap()
                .enabled,
            false
        );
        assert!(!dir.path().join(LEGACY_KEYCHAIN_MARKER).exists());
    }

    #[test]
    fn explicit_local_file_preference_keeps_current_binding() {
        let dir = root();
        let binding = binding();
        private::write(&dir.path().join("binding.json"), &binding).unwrap();
        marker(
            &dir.path().join(LEGACY_KEYCHAIN_MARKER),
            b"cyberbus-installation-v1\n",
        );
        marker(
            &dir.path().join(LEGACY_STORAGE_PREFERENCE),
            b"encrypted-file\n",
        );
        migrate_legacy_keychain(dir.path()).unwrap();
        assert!(dir.path().join("binding.json").exists());
    }

    #[test]
    fn keychain_preference_migrates_even_when_both_markers_exist() {
        let dir = root();
        marker(
            &dir.path().join(LEGACY_KEYCHAIN_MARKER),
            b"cyberbus-installation-v1\n",
        );
        marker(&dir.path().join(FILE_MARKER), FILE_MARKER_BYTES);
        marker(&dir.path().join(LEGACY_STORAGE_PREFERENCE), b"keychain\n");
        migrate_legacy_keychain(dir.path()).unwrap();
        assert!(!dir.path().join(LEGACY_KEYCHAIN_MARKER).exists());
        assert!(!dir.path().join(LEGACY_STORAGE_PREFERENCE).exists());
        assert!(dir.path().join(FILE_MARKER).exists());
    }

    #[test]
    fn invalid_preference_fails_closed() {
        let dir = root();
        marker(&dir.path().join(LEGACY_STORAGE_PREFERENCE), b"unknown\n");
        assert_eq!(migrate_legacy_keychain(dir.path()), Err(Error::Storage));
    }

    #[test]
    fn malformed_file_marker_fails_before_creating_credentials() {
        let dir = root();
        marker(&dir.path().join(FILE_MARKER), b"unexpected\n");
        assert_eq!(store(dir.path()).err(), Some(Error::Storage));
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
