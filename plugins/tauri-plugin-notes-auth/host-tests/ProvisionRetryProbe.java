package com.local.notesauth;

import android.content.Context;
import android.system.Os;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Arrays;

/** Host-only regression extension; the retained independent probe runs unmodified first. */
public final class ProvisionRetryProbe {
    public static void main(String[] args) throws Exception {
        PublicWrapperProbe.main(args);
        Context c = PublicWrapperProbe.context();
        String parent = c.getNoBackupFilesDir().toString();
        int before = PublicWrapperProbe.creates;
        Os.failPath = parent;
        for (int attempt = 0; attempt < 3; attempt++) {
            Os.events.clear();
            PublicWrapperProbe.rejected(() -> PublicWrapperProbe.open(c, true), "storage");
            PublicWrapperProbe.check(Os.events.size() == 1 && Os.events.get(0).equals(parent), "every failed attempt retries parent barrier");
            PublicWrapperProbe.check(PublicWrapperProbe.keys.isEmpty() && PublicWrapperProbe.creates == before, "persistent parent failure never generates key");
            PublicWrapperProbe.check(!Files.exists(c.getNoBackupFilesDir().toPath().resolve("cyberbus/install")), "no marker before parent barrier");
        }
        Os.failPath = null; Os.events.clear();
        PublicWrapperProbe.provision(c);
        PublicWrapperProbe.check(Os.events.get(0).equals(parent), "parent barrier precedes successful provisioning");
        PublicWrapperProbe.check(PublicWrapperProbe.creates == before + 1, "retry provisions only once");
        try (CyberBusSecureStore v = PublicWrapperProbe.open(c, false)) {
            PublicWrapperProbe.check(Arrays.equals(v.load(), PublicWrapperProbe.RECORD), "Existing reopens successful retry");
        }
        Context empty = PublicWrapperProbe.context();
        Path root = empty.getNoBackupFilesDir().toPath().resolve("cyberbus");
        Files.createDirectory(root, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        Os.events.clear(); PublicWrapperProbe.provision(empty);
        PublicWrapperProbe.check(Os.events.get(0).equals(empty.getNoBackupFilesDir().toString()), "pre-existing empty directory still persists parent");
        System.out.println("PASS parent fsync retry: retained F1 probe; persistent failure; empty directory; restart; no key/marker before barrier (HOST ONLY)");
    }
}
