#!/usr/bin/env python3
"""Re-run the retained independent F1 probe against working product Java.
Host Android shims and synthetic keys only; never a device/Keystore acceptance test.
The original frozen regression fixture and its baseline behavior are unchanged.
"""
import os
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[2]
host = Path(__file__).resolve().parent / 'host-tests'
# Host shim definitions retained from Carson's independent F1 fixture.
stubs = {'android/content/Context.java': 'package android.content;\n'
                                 'public final class Context {\n'
                                 ' private final java.io.File base; private final String pkg;\n'
                                 ' public Context(java.io.File base, String pkg) '
                                 '{this.base=base;this.pkg=pkg;}\n'
                                 ' public java.io.File getNoBackupFilesDir(){return base;}\n'
                                 ' public String getPackageName(){return pkg;}\n'
                                 '}',
 'android/security/keystore/KeyProperties.java': 'package android.security.keystore;\n'
                                                 'public final class KeyProperties { public static '
                                                 'final String '
                                                 'KEY_ALGORITHM_AES="AES",BLOCK_MODE_GCM="GCM",ENCRYPTION_PADDING_NONE="NoPadding";\n'
                                                 'public static final int '
                                                 'PURPOSE_ENCRYPT=1,PURPOSE_DECRYPT=2;}',
 'android/security/keystore/KeyGenParameterSpec.java': 'package android.security.keystore;\n'
                                                       'public final class KeyGenParameterSpec '
                                                       'implements '
                                                       'java.security.spec.AlgorithmParameterSpec '
                                                       '{\n'
                                                       ' public final String alias; private '
                                                       'KeyGenParameterSpec(String a){alias=a;}\n'
                                                       ' public static final class Builder {\n'
                                                       '  final String alias; public '
                                                       'Builder(String a,int p){alias=a;}\n'
                                                       '  public Builder setKeySize(int n){return '
                                                       'this;} public Builder '
                                                       'setBlockModes(String... s){return this;}\n'
                                                       '  public Builder '
                                                       'setEncryptionPaddings(String... s){return '
                                                       'this;} public Builder '
                                                       'setRandomizedEncryptionRequired(boolean '
                                                       'b){return this;}\n'
                                                       '  public KeyGenParameterSpec '
                                                       'build(){return new '
                                                       'KeyGenParameterSpec(alias);}\n'
                                                       ' }\n'
                                                       '}',
 'android/system/OsConstants.java': 'package android.system;\n'
                                    'public final class OsConstants { public static final int '
                                    'O_RDONLY=0,O_NOFOLLOW=1; public static boolean S_ISDIR(int '
                                    'm){return m==1;} }',
 'android/system/StructStat.java': 'package android.system;\n'
                                   'public final class StructStat { public int st_mode=1; }',
 'android/system/Os.java': 'package android.system;\n'
                           'import java.io.*; import java.nio.channels.*; import java.nio.file.*; '
                           'import java.util.*;\n'
                           'public final class Os {\n'
                           ' public static final List<String> events=new ArrayList<>(); public '
                           'static String failPath;\n'
                           ' static final Map<FileDescriptor,String> paths=new '
                           'IdentityHashMap<>();\n'
                           ' public static FileDescriptor open(String p,int f,int '
                           'm){FileDescriptor fd=new FileDescriptor();paths.put(fd,p);return fd;}\n'
                           ' public static StructStat fstat(FileDescriptor f){return new '
                           'StructStat();}\n'
                           ' public static void fsync(FileDescriptor f) throws Exception {\n'
                           '  String p=paths.get(f);events.add(p);if(p.equals(failPath))throw new '
                           'IOException("synthetic fsync failure");\n'
                           '  try(FileChannel '
                           'ch=FileChannel.open(Paths.get(p),StandardOpenOption.READ)){ch.force(true);}\n'
                           ' }\n'
                           ' public static void close(FileDescriptor f){paths.remove(f);}\n'
                           '}'}
java_home = os.environ.get('JAVA_HOME')
def tool(name):
    return str(Path(java_home) / 'bin' / name) if java_home else name

with tempfile.TemporaryDirectory(prefix='cyberbus-parent-fsync-retest-') as output:
    output = Path(output)
    sources = []
    for name, text in stubs.items():
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        sources.append(str(path))
    for name in ['SecureVault.java', 'CyberBusSecureStore.java']:
        sources.append(str(repo / 'plugins/tauri-plugin-notes-auth/android/src/main/java/com/local/notesauth' / name))
    sources.append(str(host / 'PublicWrapperProbe.java'))
    sources.append(str(host / 'ProvisionRetryProbe.java'))
    subprocess.run([tool('javac'), '-d', str(output), *sources], check=True, timeout=60)
    subprocess.run([tool('java'), '-Djava.io.tmpdir=' + str(output), '-cp', str(output),
                    'com.local.notesauth.ProvisionRetryProbe'], check=True, timeout=60)
