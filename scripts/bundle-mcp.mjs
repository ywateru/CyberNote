// macOS Tauri hook: build the adapter from the same checkout and stage a sidecar.
import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = /^host: (.+)$/m.exec(execFileSync("rustc", ["-vV"], { encoding: "utf8" }))[1];
const arch = process.env.TAURI_ENV_ARCH || host.split("-")[0];
if (!["aarch64", "x86_64"].includes(arch) || process.platform !== "darwin") throw Error("Bundled MCP requires a supported macOS target");
const target = `${arch}-apple-darwin`;
const targetDir = resolve(root, "src-tauri/target");
execFileSync("cargo", ["build", "--locked", "--release", "--manifest-path", resolve(root, "crates/notes-mcp/Cargo.toml"), ...(host === target ? [] : ["--target", target])], {
  cwd: root, stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: targetDir, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || "2" },
});
const binary = resolve(targetDir, ...(host === target ? [] : [target]), "release/cybernote-mcp");
const staged = resolve(root, `artifacts/bundled-mcp/cybernote-mcp-${target}`);
mkdirSync(dirname(staged), { recursive: true }); copyFileSync(binary, staged); chmodSync(staged, 0o755);
// tauri dev runs an unbundled executable; keep its adapter beside it too.
if (process.argv.includes("--dev")) {
  const dev = resolve(targetDir, ...(host === target ? [] : [target]), "debug/cybernote-mcp");
  mkdirSync(dirname(dev), { recursive: true }); copyFileSync(binary, dev); chmodSync(dev, 0o755);
}
console.log(`Bundled MCP prepared: ${target}`);
