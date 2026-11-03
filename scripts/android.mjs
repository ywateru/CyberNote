import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
const sdk =
  process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
const java =
  process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)
    ? process.env.JAVA_HOME
    : "/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  NDK_HOME:
    process.env.NDK_HOME && existsSync(process.env.NDK_HOME)
      ? process.env.NDK_HOME
      : `${sdk}/ndk/27.2.12479018`,
  JAVA_HOME: java,
};
if (!existsSync(env.NDK_HOME))
  throw new Error(`Android NDK missing: ${env.NDK_HOME}`);
const args = ["tauri", "android", ...process.argv.slice(2)];
if (args.includes("build") && !args.includes("--target"))
  args.push("--target", "aarch64", "--apk");
const p = spawnSync("pnpm", args, { stdio: "inherit", env });
process.exit(p.status ?? 1);
