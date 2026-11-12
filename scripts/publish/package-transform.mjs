// Public commands are intentional, not a copy of historical device/debug scripts.
export const publicScripts = Object.freeze({
  dev: 'vite --host 0.0.0.0', build: 'tsc -b && vite build', typecheck: 'tsc --noEmit',
  preview: 'vite preview --host 0.0.0.0', tauri: 'tauri',
  'mac:dev': 'tauri dev', 'mac:build': 'tauri build --bundles app',
  'android:init': 'node scripts/android.mjs init', 'android:build': 'node scripts/android.mjs build',
  'android:dev': 'node scripts/android.mjs dev', 'test:rust': 'cargo test --manifest-path src-tauri/Cargo.toml',
  'version:check': 'node scripts/versions.mjs --check', 'version:sync': 'node scripts/versions.mjs',
  'test:publish': 'node --test scripts/publish/*.test.mjs',
});
export function transformPackage(bytes) {
  const pkg = JSON.parse(bytes.toString());
  if (pkg.packageManager !== 'pnpm@10.15.0' || pkg.engines?.node !== '22.x') throw Error('Expected pinned pnpm 10.15.0 / Node 22');
  for (const [name, command] of Object.entries(publicScripts)) {
    if (name !== 'test:publish' && pkg.scripts?.[name] !== command) throw Error(`Review changed public command: ${name}`);
  }
  const removed = Object.keys(pkg.scripts).filter(name => !(name in publicScripts));
  return { bytes: Buffer.from(JSON.stringify({ ...pkg, private: true, scripts: publicScripts }, null, 2) + '\n'), removed };
}
