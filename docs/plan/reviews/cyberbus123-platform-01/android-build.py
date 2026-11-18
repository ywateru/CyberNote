#!/usr/bin/env python3
"""Compile exact reviewed inputs, isolated release AAR + DEX, no app/device use."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

here = Path(__file__).resolve().parent
repo = here.parents[3]
rev = 'b74eeb637a68370d2b4faae26647be349fa31c50'
sdk = Path('/Users/water/Library/Android/sdk')
java = Path('/opt/zerobrew/opt/openjdk@17')
tauri = next(Path('/Users/water/.cargo/registry/src').glob('*/tauri-2.12.5/mobile/android'))
gradle = next(Path('/Users/water/.gradle/wrapper/dists/gradle-9.6.1-bin').glob('*/gradle-9.6.1/bin/gradle'))
env = dict(os.environ, JAVA_HOME=str(java), ANDROID_HOME=str(sdk))

with tempfile.TemporaryDirectory(prefix='independent-platform-android-') as tmp:
    tmp = Path(tmp)
    shutil.copytree(tauri, tmp/'tauri-android')
    prefix = 'plugins/tauri-plugin-notes-auth/android/'
    paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', rev, '--', prefix], cwd=repo).decode().splitlines()
    for path in paths:
        dest = tmp/'notes-auth'/path.removeprefix(prefix)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(subprocess.check_output(['git', 'show', f'{rev}:{path}'], cwd=repo))
    (tmp/'settings.gradle.kts').write_text('''pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "independent-platform-verification"
include(":notes-auth", ":tauri-android")
''')
    (tmp/'build.gradle.kts').write_text('''buildscript {
 repositories { google(); mavenCentral() }
 dependencies {
  classpath("com.android.tools.build:gradle:9.3.1")
  classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
 }
}
''')
    (tmp/'gradle.properties').write_text('android.useAndroidX=true\nandroid.builtInKotlin=false\nandroid.newDsl=false\norg.gradle.jvmargs=-Xmx2048m\n')
    (tmp/'local.properties').write_text('sdk.dir='+str(sdk)+'\n')
    classes = tmp/'classes'
    classes.mkdir()
    sources = list((tmp/'notes-auth/src/main/java/com/local/notesauth').glob('*.java'))
    subprocess.run([str(java/'bin/javac'), '-source', '8', '-target', '8', '-cp', str(sdk/'platforms/android-36/android.jar'), '-d', str(classes), *map(str, sources)], check=True, env=env)
    subprocess.run([str(java/'bin/javap'), '-s', '-private', '-classpath', str(classes), 'com.local.notesauth.CyberBusSecureStore'], check=True, env=env)
    dex = tmp/'dex'
    dex.mkdir()
    subprocess.run([str(sdk/'build-tools/36.0.0/d8'), '--min-api', '26', '--lib', str(sdk/'platforms/android-36/android.jar'), '--output', str(dex), *map(str, classes.rglob('*.class'))], check=True, env=env)
    subprocess.run([str(gradle), '--offline', '--no-daemon', '--console=plain', ':notes-auth:assembleRelease', ':notes-auth:lintRelease'], cwd=tmp, check=True, env=env)
    aar = tmp/'notes-auth/build/outputs/aar/notes-auth-release.aar'
    with zipfile.ZipFile(aar) as archive:
        assert b'CyberBusSecureStore' in archive.read('proguard.txt')
        nested = tmp/'aar-classes.jar'
        nested.write_bytes(archive.read('classes.jar'))
        with zipfile.ZipFile(nested) as jar:
            assert 'com/local/notesauth/CyberBusSecureStore.class' in jar.namelist()
            assert 'com/local/notesauth/SecureVault.class' in jar.namelist()
            assert 'com/local/notesauth/NotesAuthPlugin.class' in jar.namelist()
    for path in [aar, dex/'classes.dex']:
        print(path.name, 'SHA256', hashlib.sha256(path.read_bytes()).hexdigest(), flush=True)
    print('PASS: release library AAR/lint + API36 javac + min26 D8 + JNI descriptors; no APK, Rust JNI, Keystore or device runtime tested', flush=True)
