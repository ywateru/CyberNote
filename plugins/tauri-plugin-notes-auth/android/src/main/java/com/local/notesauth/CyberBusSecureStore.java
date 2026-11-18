package com.local.notesauth;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.system.Os;
import android.system.OsConstants;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** JNI-only storage, intentionally neither a Tauri plugin command nor a JS interface. */
public final class CyberBusSecureStore implements AutoCloseable {
    private final SecureVault vault;
    private CyberBusSecureStore(SecureVault vault) { this.vault = vault; }

    public static CyberBusSecureStore lock(Context context, String root, boolean firstInstall) {
        try {
            File base = context.getNoBackupFilesDir().getCanonicalFile();
            File expected = new File(base, "cyberbus");
            if (!expected.getAbsolutePath().equals(root) || !expected.getCanonicalFile().equals(expected)) throw new Exception();
            Path directory = expected.toPath();
            if (!Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
                if (!firstInstall) throw new Exception();
                try { Files.createDirectory(directory, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------"))); }
                catch (java.nio.file.FileAlreadyExistsException concurrent) { /* lock resolves simultaneous first owners */ }
                syncDirectory(base.toPath());
            }
            // One fixed app-scoped key, never regenerated when any installation evidence exists.
            final String alias = context.getPackageName() + ".cyberbus.v1";
            final KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            SecureVault.Keys keys = new SecureVault.Keys() {
                public SecretKey existing() throws Exception { return (SecretKey)store.getKey(alias, null); }
                public SecretKey create() throws Exception {
                    if (store.containsAlias(alias)) throw new Exception();
                    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                    generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
                    return generator.generateKey();
                }
            };
            return new CyberBusSecureStore(SecureVault.open(directory, firstInstall, keys, CyberBusSecureStore::syncDirectory));
        } catch (IllegalStateException e) {
            throw new IllegalStateException("conflict".equals(e.getMessage()) ? "conflict" : "storage");
        }
        catch (Exception e) { throw new IllegalStateException("storage"); }
    }
    private static void syncDirectory(Path directory) throws Exception {
        java.io.FileDescriptor fd = Os.open(directory.toString(), OsConstants.O_RDONLY | OsConstants.O_NOFOLLOW, 0);
        try { if (!OsConstants.S_ISDIR(Os.fstat(fd).st_mode)) throw new Exception(); Os.fsync(fd); } finally { Os.close(fd); }
    }
    public byte[] load() { return vault.load(); }
    public void save(byte[] value) { vault.save(value); }
    @Override public void close() { vault.close(); }
}
