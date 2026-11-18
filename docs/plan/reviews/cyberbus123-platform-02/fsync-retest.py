#!/usr/bin/env python3
"""Unchanged review-01 Java harness against exact fixed commit + independent retry checks.
Host Android shims / synthetic provider only. Leaves the old red fixture untouched.
"""
import ast
import os
from pathlib import Path
import subprocess
import tempfile

here = Path(__file__).resolve().parent
repo = here.parents[3]
old = here.parent / 'cyberbus123-platform-01'
rev = 'a4c85d3242a4a792b6374696a507e678b4672047'
parsed = ast.parse((old / 'public-wrapper-probe.py').read_text())
stubs = next(ast.literal_eval(n.value) for n in parsed.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'stubs' for t in n.targets))
extra = r'''package com.local.notesauth;
import android.content.Context;
import android.system.Os;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Arrays;
public final class IndependentRetry {
 public static void main(String[] args) throws Exception {
  PublicWrapperProbe.main(args);
  Context c=PublicWrapperProbe.context(); String parent=c.getNoBackupFilesDir().toString();
  int before=PublicWrapperProbe.creates; Os.failPath=parent;
  for(int i=0;i<3;i++) {
   Os.events.clear(); PublicWrapperProbe.rejected(()->PublicWrapperProbe.open(c,true),"storage");
   PublicWrapperProbe.check(Os.events.size()==1 && Os.events.get(0).equals(parent),"retry persists parent on every failed attempt");
   PublicWrapperProbe.check(PublicWrapperProbe.creates==before && PublicWrapperProbe.keys.isEmpty(),"no key created before parent barrier");
   for(String name:new String[]{"install","vault","install.tmp","vault.tmp","owner.lock"})
    PublicWrapperProbe.check(!Files.exists(c.getNoBackupFilesDir().toPath().resolve("cyberbus").resolve(name)),"no store artifact before parent barrier");
  }
  Os.failPath=null; Os.events.clear(); PublicWrapperProbe.provision(c);
  long parents=Os.events.stream().filter(parent::equals).count();
  PublicWrapperProbe.check(parents==1 && Os.events.get(0).equals(parent),"one parent barrier before child writes");
  PublicWrapperProbe.check(PublicWrapperProbe.creates==before+1,"single provisioning key");
  try(CyberBusSecureStore v=PublicWrapperProbe.open(c,false)) {
   PublicWrapperProbe.check(Arrays.equals(v.load(),PublicWrapperProbe.RECORD),"Existing retained record");
  }
  Context empty=PublicWrapperProbe.context(); Path root=empty.getNoBackupFilesDir().toPath().resolve("cyberbus");
  Files.createDirectory(root,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
  Os.events.clear(); PublicWrapperProbe.provision(empty);
  PublicWrapperProbe.check(Os.events.get(0).equals(empty.getNoBackupFilesDir().toString()),"pre-existing empty root parent barrier");
  System.out.println("PASS independent F1: original harness green; persistent failure x3; no key/marker/blob/lock before barrier; retry/reopen; pre-existing empty root");
  System.out.println("Successful provisioning: parent fsync="+parents+", child fsync="+(Os.events.size()-1)+" (HOST ONLY)");
 }
}'''
with tempfile.TemporaryDirectory(prefix='independent-f1-fixed-') as temp:
    temp = Path(temp)
    sources = []
    for name, text in stubs.items():
        path = temp / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        sources.append(str(path))
    for name in ['SecureVault.java', 'CyberBusSecureStore.java']:
        path = temp / name
        path.write_bytes(subprocess.check_output(['git', 'show', f'{rev}:plugins/tauri-plugin-notes-auth/android/src/main/java/com/local/notesauth/{name}'], cwd=repo))
        sources.append(str(path))
    path = temp / 'IndependentRetry.java'
    path.write_text(extra)
    sources += [str(old / 'PublicWrapperProbe.java'), str(path)]
    java = Path(os.environ.get('JAVA_HOME', '/opt/zerobrew/opt/openjdk@17')) / 'bin'
    subprocess.run([str(java/'javac'), '-d', str(temp/'classes'), *sources], check=True, timeout=60)
    subprocess.run([str(java/'java'), '-Djava.io.tmpdir='+str(temp), '-cp', str(temp/'classes'), 'com.local.notesauth.IndependentRetry'], check=True, timeout=60)
