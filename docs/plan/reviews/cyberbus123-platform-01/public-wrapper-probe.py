#!/usr/bin/env python3
"""Run exact committed Java with HOST Android shims. Expected exit 1 reproduces F1.
Not an Android API/Keystore test. All state lives in a TemporaryDirectory.
"""
import os
from pathlib import Path
import subprocess
import tempfile

here = Path(__file__).resolve().parent
repo = here.parents[3]
revision = 'b74eeb637a68370d2b4faae26647be349fa31c50'
stubs = {
 'android/content/Context.java': '''package android.content;
public final class Context {
 private final java.io.File base; private final String pkg;
 public Context(java.io.File base, String pkg) {this.base=base;this.pkg=pkg;}
 public java.io.File getNoBackupFilesDir(){return base;}
 public String getPackageName(){return pkg;}
}''',
 'android/security/keystore/KeyProperties.java': '''package android.security.keystore;
public final class KeyProperties { public static final String KEY_ALGORITHM_AES="AES",BLOCK_MODE_GCM="GCM",ENCRYPTION_PADDING_NONE="NoPadding";
public static final int PURPOSE_ENCRYPT=1,PURPOSE_DECRYPT=2;}''',
 'android/security/keystore/KeyGenParameterSpec.java': '''package android.security.keystore;
public final class KeyGenParameterSpec implements java.security.spec.AlgorithmParameterSpec {
 public final String alias; private KeyGenParameterSpec(String a){alias=a;}
 public static final class Builder {
  final String alias; public Builder(String a,int p){alias=a;}
  public Builder setKeySize(int n){return this;} public Builder setBlockModes(String... s){return this;}
  public Builder setEncryptionPaddings(String... s){return this;} public Builder setRandomizedEncryptionRequired(boolean b){return this;}
  public KeyGenParameterSpec build(){return new KeyGenParameterSpec(alias);}
 }
}''',
 'android/system/OsConstants.java': '''package android.system;
public final class OsConstants { public static final int O_RDONLY=0,O_NOFOLLOW=1; public static boolean S_ISDIR(int m){return m==1;} }''',
 'android/system/StructStat.java': '''package android.system;
public final class StructStat { public int st_mode=1; }''',
 'android/system/Os.java': '''package android.system;
import java.io.*; import java.nio.channels.*; import java.nio.file.*; import java.util.*;
public final class Os {
 public static final List<String> events=new ArrayList<>(); public static String failPath;
 static final Map<FileDescriptor,String> paths=new IdentityHashMap<>();
 public static FileDescriptor open(String p,int f,int m){FileDescriptor fd=new FileDescriptor();paths.put(fd,p);return fd;}
 public static StructStat fstat(FileDescriptor f){return new StructStat();}
 public static void fsync(FileDescriptor f) throws Exception {
  String p=paths.get(f);events.add(p);if(p.equals(failPath))throw new IOException("synthetic fsync failure");
  try(FileChannel ch=FileChannel.open(Paths.get(p),StandardOpenOption.READ)){ch.force(true);}
 }
 public static void close(FileDescriptor f){paths.remove(f);}
}''',
}
with tempfile.TemporaryDirectory(prefix='independent-platform-probe-') as tmp:
    tmp = Path(tmp)
    sources = []
    for name, text in stubs.items():
        path = tmp / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        sources.append(str(path))
    for name in ['SecureVault.java', 'CyberBusSecureStore.java']:
        path = tmp / 'com/local/notesauth' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(subprocess.check_output(['git', 'show', f'{revision}:plugins/tauri-plugin-notes-auth/android/src/main/java/com/local/notesauth/{name}'], cwd=repo))
        sources.append(str(path))
    sources.append(str(here / 'PublicWrapperProbe.java'))
    java_home = os.environ.get('JAVA_HOME', '/opt/zerobrew/opt/openjdk@17')
    subprocess.run([java_home+'/bin/javac', '-d', str(tmp/'classes'), *sources], check=True)
    # Java temp directories are nested under this owned disposable fixture root.
    result = subprocess.run([java_home+'/bin/java', '-Djava.io.tmpdir='+str(tmp), '-cp', str(tmp/'classes'), 'com.local.notesauth.PublicWrapperProbe'])
    raise SystemExit(result.returncode)
