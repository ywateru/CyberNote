#!/usr/bin/env python3
"""Compile the actual provider against Android/Tauri SDKs; no Gradle/native build."""
import os, pathlib, subprocess, tempfile
root=pathlib.Path(__file__).resolve().parents[1]
cache=pathlib.Path(os.environ.get('GRADLE_USER_HOME',str(pathlib.Path.home()/'.gradle')))/'caches/modules-2/files-2.1'
def jar(group,name,version):return str(next((cache/group/name/version).glob('*/*.jar')))
stdlib=jar('org.jetbrains.kotlin','kotlin-stdlib','2.2.10')
compiler=[jar('org.jetbrains.kotlin','kotlin-compiler-embeddable','2.2.10'),stdlib,jar('org.jetbrains.kotlin','kotlin-script-runtime','2.2.10'),jar('org.jetbrains.kotlin','kotlin-reflect','1.6.10'),jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm','1.8.0'),jar('org.jetbrains','annotations','13.0')]
ta=pathlib.Path(os.environ['NOTES_MEDIA_TAURI_ANDROID'])/'build/intermediates/runtime_library_classes_jar/release/bundleLibRuntimeToJarRelease/classes.jar'
android=pathlib.Path(os.environ.get('ANDROID_HOME',str(pathlib.Path.home()/'Library/Android/sdk')))/'platforms/android-36/android.jar'
java=str(pathlib.Path(os.environ['JAVA_HOME'])/'bin/java')
with tempfile.TemporaryDirectory(prefix='notes-media-kotlin-') as out:
 sources=sorted((root/'android/src/main/java/com/local/notesmedia').glob('*.kt'))+[root/'scripts/VideoBudgetCheck.kt']
 subprocess.run([java,'-cp',':'.join(compiler),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',':'.join([str(android),str(ta),stdlib,compiler[-1]]),'-jvm-target','1.8','-d',out]+[str(p)for p in sources],check=True)
 subprocess.run([java,'-cp',out+':'+stdlib,'com.local.notesmedia.VideoBudgetCheckKt'],check=True)
