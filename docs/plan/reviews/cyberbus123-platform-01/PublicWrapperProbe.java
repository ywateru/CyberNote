package com.local.notesauth;

import android.content.Context;
import android.system.Os;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.*;
import java.security.cert.Certificate;
import java.security.spec.AlgorithmParameterSpec;
import java.util.*;
import javax.crypto.*;

/** Independent HOST control-flow probe. Synthetic provider, never Android Keystore evidence. */
public final class PublicWrapperProbe {
    static final Map<String, Key> keys = new HashMap<>();
    static int creates;
    static boolean locked;
    static final byte[] RECORD = "synthetic installation record; no user data".getBytes();
    public static final class Store extends KeyStoreSpi {
        public Key engineGetKey(String a, char[] p) throws UnrecoverableKeyException {
            if (locked) throw new UnrecoverableKeyException("DO-NOT-LEAK-synthetic-lock");
            return keys.get(a);
        }
        public void engineLoad(java.io.InputStream i, char[] p) {}
        public void engineStore(java.io.OutputStream o, char[] p) { throw new UnsupportedOperationException(); }
        public boolean engineContainsAlias(String a) { return keys.containsKey(a); }
        public Enumeration<String> engineAliases() { return Collections.enumeration(keys.keySet()); }
        public int engineSize() { return keys.size(); }
        public boolean engineIsKeyEntry(String a) { return keys.containsKey(a); }
        public boolean engineIsCertificateEntry(String a) { return false; }
        public Certificate engineGetCertificate(String a) { return null; }
        public Certificate[] engineGetCertificateChain(String a) { return null; }
        public String engineGetCertificateAlias(Certificate c) { return null; }
        public Date engineGetCreationDate(String a) { return null; }
        public void engineDeleteEntry(String a) { throw new UnsupportedOperationException(); }
        public void engineSetCertificateEntry(String a, Certificate c) { throw new UnsupportedOperationException(); }
        public void engineSetKeyEntry(String a, Key k, char[] p, Certificate[] c) { throw new UnsupportedOperationException(); }
        public void engineSetKeyEntry(String a, byte[] b, Certificate[] c) { throw new UnsupportedOperationException(); }
    }
    public static final class Generator extends KeyGeneratorSpi {
        String alias;
        protected void engineInit(SecureRandom r) { throw new UnsupportedOperationException(); }
        protected void engineInit(int n, SecureRandom r) { throw new UnsupportedOperationException(); }
        protected void engineInit(AlgorithmParameterSpec p, SecureRandom r) {
            alias = ((android.security.keystore.KeyGenParameterSpec)p).alias;
        }
        protected SecretKey engineGenerateKey() {
            try {
                KeyGenerator g = KeyGenerator.getInstance("AES", "SunJCE"); g.init(256);
                SecretKey k = g.generateKey(); keys.put(alias, k); creates++; return k;
            } catch (Exception e) { throw new AssertionError(e); }
        }
    }
    static Path base() throws Exception {
        return Files.createTempDirectory("independent-public-vault-", PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------"))).toRealPath();
    }
    static void check(boolean b, String label) { if (!b) throw new AssertionError(label); }
    static void rejected(Runnable r, String expected) {
        try { r.run(); throw new AssertionError("accepted: " + expected); }
        catch (IllegalStateException e) { check(expected.equals(e.getMessage()) && e.getCause() == null, "safe exception"); }
    }
    static CyberBusSecureStore open(Context c, boolean first) {
        return CyberBusSecureStore.lock(c, c.getNoBackupFilesDir() + "/cyberbus", first);
    }
    static void provision(Context c) {
        try (CyberBusSecureStore v = open(c, true)) { check(v.load() == null, "fresh empty"); v.save(RECORD); }
    }
    static Context context() throws Exception {
        keys.clear(); locked = false; return new Context(base().toFile(), "independent.synthetic.app");
    }
    public static void main(String[] args) throws Exception {
        Provider p = new Provider("AndroidKeyStore", "1.0", "HOST SYNTHETIC ONLY") {};
        p.put("KeyStore.AndroidKeyStore", Store.class.getName());
        p.put("KeyGenerator.AES", Generator.class.getName()); Security.addProvider(p);
        Context c = context(); String root = c.getNoBackupFilesDir() + "/cyberbus";
        for (String wrong : new String[]{root + "/", root + "/../cyberbus", c.getNoBackupFilesDir() + "/other"})
            rejected(() -> CyberBusSecureStore.lock(c, wrong, true), "storage");
        rejected(() -> open(c, false), "storage");
        check(!Files.exists(Paths.get(root)), "existing cannot mkdir");
        provision(c);
        try (CyberBusSecureStore v = open(c, false)) {
            check(Arrays.equals(v.load(), RECORD), "restart");
            int before = creates;
            rejected(() -> open(c, true), "conflict"); rejected(() -> open(c, false), "conflict");
            check(creates == before, "contender never creates key");
        }
        int before = creates;
        locked = true;
        rejected(() -> open(c, false), "storage"); rejected(() -> open(c, true), "storage");
        locked = false;
        check(creates == before, "locked keystore never reset");
        try (CyberBusSecureStore v = open(c, false)) { check(Arrays.equals(v.load(), RECORD), "unlock retains identity"); }
        keys.clear();
        rejected(() -> open(c, false), "storage"); rejected(() -> open(c, true), "storage");
        check(creates == before, "missing key never reset");
        for (String name : new String[]{"install", "vault"}) {
            Context d = context(); provision(d); int count = creates;
            Path path = d.getNoBackupFilesDir().toPath().resolve("cyberbus").resolve(name);
            byte[] bytes = Files.readAllBytes(path); bytes[bytes.length-1] ^= 1; Files.write(path, bytes);
            rejected(() -> open(d, false), "storage"); rejected(() -> open(d, true), "storage");
            check(creates == count, "corrupt marker/blob never reset");
        }
        Context source = context(); provision(source);
        Context target = new Context(base().toFile(), source.getPackageName());
        Path sourceRoot = source.getNoBackupFilesDir().toPath().resolve("cyberbus");
        Path targetRoot = target.getNoBackupFilesDir().toPath().resolve("cyberbus");
        Files.createDirectory(targetRoot, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        for (String name : new String[]{"install", "vault"}) Files.copy(sourceRoot.resolve(name), targetRoot.resolve(name));
        rejected(() -> open(target, false), "storage"); rejected(() -> open(target, true), "storage");
        Context link = new Context(base().toFile(), source.getPackageName());
        Files.createSymbolicLink(link.getNoBackupFilesDir().toPath().resolve("cyberbus"), sourceRoot);
        rejected(() -> open(link, false), "storage"); rejected(() -> open(link, true), "storage");
        System.out.println("PASS public-wrapper HOST: root validation, locked/missing key, corruption, no-reset, contention, restart, root AAD; synthetic provider only");

        Context retry = context(); Os.events.clear();
        Os.failPath = retry.getNoBackupFilesDir().toString();
        rejected(() -> open(retry, true), "storage");
        check(keys.isEmpty(), "failed parent fsync occurs before key creation");
        check(Files.isDirectory(retry.getNoBackupFilesDir().toPath().resolve("cyberbus")), "failed fsync leaves root");
        Os.events.clear(); Os.failPath = null;
        try (CyberBusSecureStore v = open(retry, true)) { v.save(RECORD); check(Arrays.equals(v.load(), RECORD), "retry reports success"); }
        long parentSyncs = Os.events.stream().filter(e -> e.equals(retry.getNoBackupFilesDir().toString())).count();
        System.out.println("F1 observed retry parent fsync count=" + parentSyncs + ", successful child-directory fsync count=" + Os.events.size());
        // Assert the durability contract, deliberately RED on b74eeb637.
        check(parentSyncs >= 1, "F1: successful retry skipped the previously failed parent directory fsync");
    }
}
