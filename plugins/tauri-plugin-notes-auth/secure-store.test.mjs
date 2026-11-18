import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const root = new URL('.', import.meta.url).pathname;
test('encrypted vault durability, corruption, first/existing and process exclusivity', () => {
  const output = mkdtempSync(join(tmpdir(), 'cyberbus-javac-'));
  const java = tool => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', tool) : tool;
  try {
    execFileSync(java('javac'), ['-d', output,
      root + 'android/src/main/java/com/local/notesauth/SecureVault.java',
      root + 'android/src/test/java/com/local/notesauth/SecureVaultTest.java']);
    const result = execFileSync(java('java'), ['-cp', output, 'com.local.notesauth.SecureVaultTest'], {encoding:'utf8'});
    assert.match(result, /contract cases passed/); console.log(result.trim());
  } finally { rmSync(output, {recursive:true, force:true}); }
});
test('JNI class is kept and absent from renderer command surface', () => {
  const source = readFileSync(root + 'android/src/main/java/com/local/notesauth/CyberBusSecureStore.java', 'utf8');
  assert.doesNotMatch(source, /@Command|JavascriptInterface|getEncoded|\.encoded\b/);
  assert.match(source, /store\.getKey\(alias, null\)/);
  assert.match(source, /getNoBackupFilesDir/);
  assert.match(readFileSync(root + 'android/consumer-rules.pro', 'utf8'), /-keep class com\.local\.notesauth\.CyberBusSecureStore/);
});
