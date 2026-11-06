import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
export async function sourceFingerprint(root) {
  const files = [];
  for (const directory of [
    "src",
    "scripts/debug",
    "plugins/tauri-plugin-notes-ui/src",
    "plugins/tauri-plugin-notes-ui/macos",
    "plugins/tauri-plugin-notes-ui/guest-js",
    "plugins/tauri-plugin-notes-ui/examples",
    "scripts/native",
  ])
    for (const entry of await readdir(resolve(root, directory), {
      recursive: true,
      withFileTypes: true,
    }))
      if (entry.isFile()) files.push(resolve(entry.parentPath, entry.name));
  for (const name of [
    "plugins/tauri-plugin-notes-ui/Cargo.toml",
    "plugins/tauri-plugin-notes-ui/build.rs",
    "package.json",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "tsconfig.json",
  ]) {
    try {
      await readFile(resolve(root, name));
      files.push(resolve(root, name));
    } catch {}
  }
  files.sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.slice(root.length + 1));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  const status = execFileSync(
    "git",
    [
      "status",
      "--porcelain",
      "--",
      "src",
      "scripts/debug",
      "plugins/tauri-plugin-notes-ui",
      "scripts/native",
      "package.json",
      "pnpm-lock.yaml",
      "vite.config.ts",
      "tsconfig.json",
    ],
    { cwd: root, encoding: "utf8" },
  ).trim();
  return {
    algorithm: "sha256(path NUL bytes NUL, sorted)",
    sha256: hash.digest("hex"),
    fileCount: files.length,
    paths: [
      "src/**",
      "scripts/debug/**",
      "plugins/tauri-plugin-notes-ui/**",
      "scripts/native/**",
      "package.json",
      "pnpm-lock.yaml",
      "vite.config.ts",
      "tsconfig.json",
    ],
    gitDirty: !!status,
    gitStatus: status.split("\n").filter(Boolean),
  };
}
