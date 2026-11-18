package com.local.notesauth;

import java.io.Closeable;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Native implementation detail. No renderer commands. The entire lifetime owns the lock. */
final class SecureVault implements Closeable {
    interface Keys { SecretKey existing() throws Exception; SecretKey create() throws Exception; }
    interface SyncDirectory { void sync(Path directory) throws Exception; }
    private static final java.util.Set<Path> OWNERS = new java.util.HashSet<>();
    private boolean reserved;
    private static final int MAX = 8 * 1024 * 1024;
    private final Path root;
    private final SyncDirectory sync;
    private FileChannel channel;
    private FileLock lock;
    private SecretKey key;
    private boolean fresh;
    private boolean failed;
    private byte[] current = new byte[32], pending = new byte[32];

    private SecureVault(Path root, SyncDirectory sync) { this.root = root; this.sync = sync; }
    static SecureVault open(Path root, boolean first, Keys keys, SyncDirectory sync) {
        SecureVault vault = new SecureVault(root, sync);
        try {
            synchronized (OWNERS) {
                if (!OWNERS.add(root)) throw new IllegalStateException("conflict");
                vault.reserved = true;
            }
            if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(root)) throw new IOException();
            privatePath(root);
            Path lockPath = root.resolve("owner.lock");
            if (Files.exists(lockPath, LinkOption.NOFOLLOW_LINKS)) privateFile(lockPath);
            vault.channel = FileChannel.open(lockPath, new java.util.HashSet<>(Arrays.asList(StandardOpenOption.CREATE, StandardOpenOption.WRITE,
                LinkOption.NOFOLLOW_LINKS)), PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            privateFile(lockPath);
            try { vault.lock = vault.channel.tryLock(); }
            catch (OverlappingFileLockException e) { throw new IllegalStateException("conflict"); }
            if (vault.lock == null) throw new IllegalStateException("conflict");
            boolean marker = Files.exists(root.resolve("install"), LinkOption.NOFOLLOW_LINKS);
            boolean blob = Files.exists(root.resolve("vault"), LinkOption.NOFOLLOW_LINKS);
            vault.key = keys.existing();
            if (first) {
                // Existing key alone is installation evidence, including a crash before the marker.
                if (marker || blob || vault.key != null || Files.exists(root.resolve("install.tmp"), LinkOption.NOFOLLOW_LINKS)
                    || Files.exists(root.resolve("vault.tmp"), LinkOption.NOFOLLOW_LINKS)) throw new IOException();
                vault.key = keys.create();
                if (vault.key == null) throw new IOException();
                vault.writeMarker();
                vault.fresh = true; // Only this exclusive owner may observe an empty initial record.
            } else {
                if (!marker || !blob || vault.key == null) throw new IOException();
                vault.readMarker();
                byte[] check = vault.load();
                Arrays.fill(check, (byte) 0);
            }
            return vault;
        } catch (Exception e) {
            vault.close();
            if (e instanceof IllegalStateException && "conflict".equals(e.getMessage())) throw (IllegalStateException)e;
            throw storage();
        }
    }
    private static IllegalStateException storage() { return new IllegalStateException("storage"); }
    private static void privatePath(Path path) throws IOException {
        if (!Files.getPosixFilePermissions(path, LinkOption.NOFOLLOW_LINKS).stream().allMatch(p -> p.name().startsWith("OWNER_"))) throw new IOException();
    }
    private static void privateFile(Path path) throws IOException {
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(path)
            || ((Number)Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS)).intValue() != 1) throw new IOException();
        privatePath(path);
    }
    private void active() {
        if (failed || lock == null || !lock.isValid()) throw storage();
    }
    private byte[] read(String name) throws Exception {
        Path path = root.resolve(name);
        privateFile(path);
        long size = Files.size(path);
        if (size < 1 || size > MAX + 128) throw new IOException();
        try (FileChannel input = FileChannel.open(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            ByteBuffer data = ByteBuffer.allocate((int)size);
            while (data.hasRemaining()) if (input.read(data) < 0) throw new IOException();
            if (input.read(ByteBuffer.allocate(1)) != -1) throw new IOException();
            return data.array();
        }
    }
    private byte[] crypt(int mode, String purpose, byte[] input) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        if (mode == Cipher.ENCRYPT_MODE) cipher.init(mode, key); // Keystore generates a fresh random IV.
        else {
            if (input.length < 29 || input[0] != 1) throw new IOException();
            cipher.init(mode, key, new GCMParameterSpec(128, input, 1, 12));
        }
        cipher.updateAAD(("CyberNote/CyberBus/v1/" + root + "/" + purpose).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        if (mode == Cipher.DECRYPT_MODE) return cipher.doFinal(input, 13, input.length - 13);
        byte[] iv = cipher.getIV();
        if (iv.length != 12) throw new IOException();
        byte[] encrypted = cipher.doFinal(input);
        return ByteBuffer.allocate(13 + encrypted.length).put((byte)1).put(iv).put(encrypted).array();
    }
    private void atomic(String name, byte[] bytes) throws Exception {
        Path target = root.resolve(name), temp = root.resolve(name + ".tmp");
        if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) privateFile(target);
        if (Files.exists(temp, LinkOption.NOFOLLOW_LINKS)) { privateFile(temp); Files.delete(temp); }
        try (FileChannel output = FileChannel.open(temp, new java.util.HashSet<>(Arrays.asList(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE,
            LinkOption.NOFOLLOW_LINKS)), PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")))) {
            ByteBuffer data = ByteBuffer.wrap(bytes);
            while (data.hasRemaining()) output.write(data);
            output.force(true);
        }
        Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        sync.sync(root); // Never degrade to a non-atomic or non-durable write.
    }
    private void readMarker() throws Exception {
        byte[] marker = crypt(Cipher.DECRYPT_MODE, "install", read("install"));
        try {
            if (marker.length != 64) throw new IOException();
            current = Arrays.copyOfRange(marker, 0, 32); pending = Arrays.copyOfRange(marker, 32, 64);
        } finally { Arrays.fill(marker, (byte)0); }
    }
    private void writeMarker() throws Exception {
        byte[] marker = ByteBuffer.allocate(64).put(current).put(pending).array();
        try { atomic("install", crypt(Cipher.ENCRYPT_MODE, "install", marker)); }
        finally { Arrays.fill(marker, (byte)0); }
    }
    synchronized byte[] load() {
        active();
        try {
            readMarker();
            if (fresh && !Files.exists(root.resolve("vault"), LinkOption.NOFOLLOW_LINKS)
                && Arrays.equals(current, new byte[32]) && Arrays.equals(pending, new byte[32])) return null;
            byte[] encrypted = read("vault"), hash = MessageDigest.getInstance("SHA-256").digest(encrypted);
            byte[] clear = crypt(Cipher.DECRYPT_MODE, "vault", encrypted);
            try {
                if (Arrays.equals(hash, pending)) { current = hash; pending = new byte[32]; writeMarker(); }
                else if (Arrays.equals(hash, current)) {
                    if (!Arrays.equals(pending, new byte[32])) { pending = new byte[32]; writeMarker(); }
                } else throw new IOException();
                fresh = false;
                return clear;
            } catch (Exception e) { Arrays.fill(clear, (byte)0); throw e; }
        } catch (Exception e) { failed = true; throw storage(); }
    }
    synchronized void save(byte[] value) {
        active();
        try {
            if (value == null || value.length < 1 || value.length > MAX) throw new IOException();
            byte[] old = load(); if (old != null) Arrays.fill(old, (byte)0);
            byte[] encrypted = crypt(Cipher.ENCRYPT_MODE, "vault", value);
            pending = MessageDigest.getInstance("SHA-256").digest(encrypted);
            writeMarker(); // Recovery accepts only old committed or new pending ciphertext.
            atomic("vault", encrypted);
            current = pending; pending = new byte[32]; writeMarker(); fresh = false;
        } catch (Exception e) { failed = true; throw storage(); }
    }
    @Override public synchronized void close() {
        failed = true; key = null;
        try { if (lock != null) lock.release(); } catch (IOException ignored) { }
        try { if (channel != null) channel.close(); } catch (IOException ignored) { }
        lock = null; channel = null;
        synchronized (OWNERS) { if (reserved) OWNERS.remove(root); reserved = false; }
    }
}
