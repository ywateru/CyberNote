import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
const baseline = "ab728ad487c0c9b397fca3f67e57460bbe520e22";
const sha = value => createHash("sha256").update(value).digest("hex");
const paths = ["src/RecordingPanel.tsx", "src/RecordingPanel.css", "src/recording-session.ts", "src/recording-clock.ts", "src/audio-playback.ts", "src/Editor.tsx", "src/bridge.ts", "src/attachment-submission.ts", "src/attachment-target.ts", "src/access-client.ts", "src/trusted-synchronization.ts", "src/save-queue.ts", "src/save-revisions.ts", "src/native-toolbar-controller.ts", "src/native-toolbar-state.ts", "src/style.css", "src-tauri/src/lib.rs", "src-tauri/src/store.rs", "src-tauri/src/session.rs", "package.json", "pnpm-lock.yaml"];
const files = [];
for (const path of paths) {
  const current = await readFile(path), original = execFileSync("git", ["show", `${baseline}:${path}`]);
  assert(current.equals(original), `${path} remains unchanged`);
  files.push({ path, bytes: current.length, sha256: sha(current), unchanged: true });
}
const current = await readFile("src/App.tsx", "utf8"), original = execFileSync("git", ["show", `${baseline}:src/App.tsx`], {encoding:"utf8"});
function items(source) {
  const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX), nodes = [];
  const walk = node => { nodes.push(node); ts.forEachChild(node, walk); }; walk(ast);
  return { ast, nodes };
}
const before = items(original), after = items(current), fragments = [];
for (const name of ["saveDoc", "flush", "hydrate", "refresh", "listed", "noteId", "nativeAssert.current"]) {
  const match = ({ast,nodes}) => {
    const matches = nodes.filter(n => name.includes(".")
      ? ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && n.left.getText(ast) === name
      : ts.isVariableDeclaration(n) && n.name.getText(ast) === name);
    assert.equal(matches.length, 1, `one whole AST entry ${name}`);
    return matches[0].getText(ast);
  };
  const a = match(before), b = match(after);
  assert.equal(b, a, `${name} full declaration/assignment unchanged`);
  fragments.push({ name, bytes: Buffer.byteLength(b), sha256: sha(b), unchanged: true });
}
const rustPluginDiff = execFileSync("git", ["diff", baseline, "HEAD", "--", "src-tauri", "plugins"], {encoding:"utf8"});
assert.equal(rustPluginDiff, "");
const manifest = JSON.parse(await readFile("docs/verification/app-002-recording-submit/source-candidate-01/source-manifest.json", "utf8"));
for (const entry of manifest.entries) {
  const bytes = await readFile(entry.path);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha(bytes), entry.sha256);
}
const authorEvidence = JSON.parse(await readFile("docs/verification/app-002-recording-submit/source-candidate-01/evidence-manifest.json", "utf8"));
const history = [];
for (const entry of authorEvidence.entries) {
  const bytes = await readFile(`docs/verification/app-002-recording-submit/source-candidate-01/${entry.path}`);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha(bytes), entry.sha256);
  history.push({ path: entry.path, bytes: bytes.length, sha256: sha(bytes) });
}
console.log(JSON.stringify({ baseline, files, fragments, rustPluginDiffEmpty: true, sourceManifestVerified: manifest.entries, authorEvidenceVerified: history }, null, 2));
