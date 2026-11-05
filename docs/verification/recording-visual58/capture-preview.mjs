// Evidence only: reuse the frozen check and its existing controlled mount API.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const source = await readFile("scripts/check-recording-visual58.mjs", "utf8");
const before = "await mount(false, { canToggle: false, previewPending: true });";
if (source.split(before).length !== 2) throw Error("Frozen fixture no longer matches");
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const generated = resolve(output, "generated-check.mjs");
await writeFile(generated, source.replace(before, "await mount(false, { canToggle: false, playing: true });"));
execFileSync(process.execPath, [generated, output], { stdio: "inherit" });
