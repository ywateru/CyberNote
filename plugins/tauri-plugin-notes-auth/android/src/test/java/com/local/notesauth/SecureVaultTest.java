package com.local.notesauth;

import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** Device-free contract tests. Keys are injected ONLY into package-private core. */
public final class SecureVaultTest {
    static final byte[] FIRST = "synthetic SDK record one".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    static final byte[] SECOND = "synthetic SDK record two".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    static class Keys implements SecureVault.Keys {
        SecretKey key;
        public SecretKey existing() { return key; }
        public SecretKey create() throws Exception {
            if (key != null) throw new Exception();
            KeyGenerator gen = KeyGenerator.getInstance("AES"); gen.init(256); return key = gen.generateKey();
        }
    }
    static class Sync implements SecureVault.SyncDirectory {
        int calls, failAt;
        public void sync(Path path) throws Exception {
            calls++;
            if (calls == failAt) throw new java.io.IOException();
            try (java.nio.channels.FileChannel dir = java.nio.channels.FileChannel.open(path, StandardOpenOption.READ)) { dir.force(true); }
        }
    }
    static Path root() throws Exception {
        return Files.createTempDirectory("cyberbus-store-test-", PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
    }
    static void check(boolean value) { if (!value) throw new AssertionError(); }
    static void failure(Runnable fn, String message) {
        try { fn.run(); throw new AssertionError("expected failure"); }
        catch (IllegalStateException e) { check(e.getMessage().equals(message)); check(e.getCause() == null); }
    }
    static SecureVault existing(Path root, Keys keys) { return SecureVault.open(root, false, keys, new Sync()); }
    static void provision(Path root, Keys keys) {
        try (SecureVault v = SecureVault.open(root, true, keys, new Sync())) { check(v.load() == null); v.save(FIRST); }
    }
    public static void main(String[] args) throws Exception {
        if (args.length > 0) {
            // Real second JVM: tests the OS lock independently of overlapping JVM lock detection.
            failure(() -> SecureVault.open(Paths.get(args[0]), true, new Keys(), new Sync()), "conflict"); return;
        }
        int cases = 0;
        Path r = root(); Keys k = new Keys();
        failure(() -> existing(r, k), "storage"); cases++;
        try (SecureVault v = SecureVault.open(r, true, k, new Sync())) {
            check(v.load() == null);
            failure(() -> SecureVault.open(r, true, k, new Sync()), "conflict"); cases++;
            Process child = new ProcessBuilder(Paths.get(System.getProperty("java.home"), "bin/java").toString(), "-cp", System.getProperty("java.class.path"), SecureVaultTest.class.getName(), r.toString()).inheritIO().start();
            check(child.waitFor() == 0); cases++;
            v.save(FIRST); check(Arrays.equals(v.load(), FIRST));
            byte[] one = Files.readAllBytes(r.resolve("vault"));
            check(!new String(one, java.nio.charset.StandardCharsets.ISO_8859_1).contains(new String(FIRST)));
            v.save(FIRST); check(!Arrays.equals(one, Files.readAllBytes(r.resolve("vault")))); cases++;
        }
        try (SecureVault v = existing(r, k)) { check(Arrays.equals(v.load(), FIRST)); v.save(SECOND); } cases++;
        failure(() -> SecureVault.open(r, true, k, new Sync()), "storage"); cases++;
        Keys wrong = new Keys(); wrong.create(); failure(() -> existing(r, wrong), "storage"); cases++;
        failure(() -> existing(r, new Keys()), "storage"); cases++;
        byte[] saved = Files.readAllBytes(r.resolve("vault"));
        saved[20] ^= 1; Files.write(r.resolve("vault"), saved); failure(() -> existing(r, k), "storage"); cases++;
        for (String missing : new String[]{"vault", "install"}) {
            Path p = root(); Keys keys = new Keys(); provision(p, keys); Files.delete(p.resolve(missing));
            failure(() -> existing(p, keys), "storage"); failure(() -> SecureVault.open(p, true, keys, new Sync()), "storage"); cases++;
        }
        Path interrupted = root(); Keys ik = new Keys();
        SecureVault.open(interrupted, true, ik, new Sync()).close();
        failure(() -> existing(interrupted, ik), "storage"); failure(() -> SecureVault.open(interrupted, true, ik, new Sync()), "storage"); cases++;
        Path copied = root(); Keys ck = new Keys(); provision(copied, ck);
        Path target = root(); Files.copy(copied.resolve("install"), target.resolve("install")); Files.copy(copied.resolve("vault"), target.resolve("vault"));
        failure(() -> existing(target, ck), "storage"); cases++;
        for (int step = 1; step <= 3; step++) {
            Path p = root(); Keys keys = new Keys(); provision(p, keys); Sync sync = new Sync();
            try (SecureVault v = SecureVault.open(p, false, keys, sync)) {
                sync.failAt = sync.calls + step;
                failure(() -> v.save(SECOND), "storage"); failure(v::load, "storage");
            }
            try (SecureVault v = existing(p, keys)) { check(Arrays.equals(v.load(), step == 1 ? FIRST : SECOND)); }
            cases++;
        }
        Path rollback = root(); Keys rk = new Keys(); provision(rollback, rk); byte[] old = Files.readAllBytes(rollback.resolve("vault"));
        try (SecureVault v = existing(rollback, rk)) { v.save(SECOND); }
        Files.write(rollback.resolve("vault"), old); failure(() -> existing(rollback, rk), "storage"); cases++;
        Path symlink = root(); Keys sk = new Keys(); provision(symlink, sk);
        Files.delete(symlink.resolve("vault")); Files.createSymbolicLink(symlink.resolve("vault"), copied.resolve("vault"));
        failure(() -> existing(symlink, sk), "storage"); cases++;
        Path hardlink = root(); Keys hk = new Keys(); provision(hardlink, hk); Files.createLink(hardlink.resolve("extra"), hardlink.resolve("vault"));
        failure(() -> existing(hardlink, hk), "storage"); cases++;
        Path permissions = root(); Files.setPosixFilePermissions(permissions, PosixFilePermissions.fromString("rwxr-x---"));
        failure(() -> SecureVault.open(permissions, true, new Keys(), new Sync()), "storage"); cases++;
        Path invalid = root(); Keys vk = new Keys();
        try (SecureVault v = SecureVault.open(invalid, true, vk, new Sync())) {
            failure(() -> v.save(new byte[0]), "storage"); failure(v::load, "storage");
        } cases++;
        System.out.println("SecureVault: " + cases + " contract cases passed (host JVM, synthetic keys only)");
    }
}
