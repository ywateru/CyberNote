// Command/unit checks only. No browser, app, simulator or user workspace opened.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { checkTesterCallbacks } from "./mcp-tester117/callback-checks.mjs";
const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "mcp-tester117-js-"));
let checks = 0;
try {
  for (const name of ["agent-mcp-tester-client", "agent-mcp-tester-runner", "agent-client"]) {
    const source = await readFile(join(root, `src/${name}.ts`), "utf8");
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replaceAll('"@tauri-apps/api/core"', '"./invoke.mjs"').replaceAll('"./bridge"', '"./bridge.mjs"').replaceAll('"./agent-mcp-tester-client"', '"./agent-mcp-tester-client.mjs"');
    await writeFile(join(temp, `${name}.mjs`), js);
  }
  await writeFile(join(temp, "invoke.mjs"), 'export const invoke = (...args) => globalThis.testInvoke(...args);');
  await writeFile(join(temp, "bridge.mjs"), 'export const native = true; export const accessGate = { stamp: () => ({...globalThis.testStamp}), expected: () => ({sessionId:"window",epoch:1,noteEpoch:null}) };');
  const { runMcpBatch, queryMcpRecovery, recoveryState } = await import(pathToFileURL(join(temp, "agent-mcp-tester-runner.mjs")));
  const { parseConnected, parseCalled, testerTools, TesterError, testerErrorMessage, mcpTesterClient } = await import(pathToFileURL(join(temp, "agent-mcp-tester-client.mjs")));
  const tools = testerTools.map(name => ({ name, description: null, inputSchema: { type: "object" }, outputSchema: { type: "object" } }));
  const id = randomUUID();
  assert.equal(parseConnected({ connectionId: id, tools }, id).tools.length, 9);
  assert.throws(() => parseConnected({ connectionId: id, tools: [...tools.slice(1), tools[1]] }, id), TesterError);
  assert.throws(() => parseConnected({ connectionId: "other", tools }, id), TesterError);
  assert.throws(() => parseCalled({ result: { structuredContent: [], isError: false }, elapsedMs: 1 }), TesterError);
  checks += 4;
  const grant = { scopes: ["notes:read", "notes:create", "notes:update"], folderIds: ["folder"] };
  async function batch({ write = false, scopes = grant.scopes, behavior, abortAt, onDispatch } = {}) {
    const rows = [], calls = [], writes = [], receipts = new Map(), keys = new Set(), controller = new AbortController();
    let content = "", version = 0;
    const owned = "this-run-created-note";
    const result = value => ({ result: { structuredContent: value, isError: false }, elapsedMs: 2 });
    const error = code => ({ result: { structuredContent: { code, message: "private text not displayed", retryable: false }, isError: true }, elapsedMs: 1 });
    const options = { workspaceId: "workspace", grant: { ...grant, scopes }, write, signal: controller.signal, uuid: randomUUID, report: row => rows.push(row), call: async (tool, args) => {
      onDispatch?.(tool, args, rows);
      calls.push({ tool, args: structuredClone(args) });
      if (tool === abortAt) controller.abort();
      const special = behavior?.(tool, args, calls); if (special) return special;
      if (tool === "notes_get_capabilities") return result({ apiVersion: 1, workspaceId: "workspace", scopes });
      if (tool === "notes_list_folders") return result({ items: [{ id: "folder" }], nextCursor: null });
      if (tool === "notes_list") return result({ items: [{ id: "pre-existing-note" }], nextCursor: null });
      if (tool === "notes_search") return result({ items: [], nextCursor: null });
      if (tool === "notes_read") {
        if (args.noteId === "pre-existing-note") return result({ id: args.noteId, version: "existing-version", content: "USER-SECRET-CONTENT".repeat(50000), truncated: true });
        assert.equal(args.noteId, owned);
        return result({ id: owned, version: `v${version}`, content, truncated: false });
      }
      if (tool === "notes_get_operation") return result(receipts.get(args.operationId));
      assert.ok(["notes_create", "notes_append", "notes_update"].includes(tool));
      assert.match(args.idempotencyKey, /^[0-9a-f-]{36}$/); assert.ok(!keys.has(args.idempotencyKey)); keys.add(args.idempotencyKey);
      if (tool === "notes_create") { assert.equal(args.folderId, "folder"); assert.match(args.content, /^MCP 测试笔记 · [0-9a-f-]{36}$/); content = args.content; }
      else { assert.equal(args.noteId, owned); assert.equal(args.expectedVersion, `v${version}`); content = tool === "notes_append" ? content + "\n" + args.text : args.content; }
      writes.push(tool); version++;
      const receipt = { noteId: owned, operationId: randomUUID(), committedRevision: version, committedVersion: `v${version}`, committed: true, warnings: [] };
      receipts.set(receipt.operationId, receipt); return result(receipt);
    } };
    let failure;
    try { await runMcpBatch(options); } catch (e) { failure = e; }
    return { rows, calls, writes, failure, result, error };
  }
  const ro = await batch();
  assert.equal(ro.failure, undefined); assert.deepEqual(ro.writes, []);
  assert.equal(ro.rows.filter(r => r.status === "skip").length, 4);
  assert.ok(!JSON.stringify(ro.rows).includes("USER-SECRET-CONTENT"));
  assert.equal(ro.calls.find(c => c.tool === "notes_list").args.limit, 1); checks++;
  const rw = await batch({ write: true });
  assert.equal(rw.failure, undefined); assert.deepEqual(rw.writes, ["notes_create", "notes_append", "notes_update"]);
  assert.ok(rw.rows.every(r => r.status === "pass" || r.status === "pending"));
  assert.equal(rw.calls.filter(c => c.tool === "notes_get_operation").length, 3);
  assert.ok(rw.rows.some(r => r.detail.includes("留存"))); checks++;
  const limited = await batch({ write: true, scopes: ["notes:read"] });
  assert.deepEqual(limited.writes, []); assert.ok(limited.rows.some(r => r.tool === "notes_create" && r.status === "skip")); checks++;
  const createOnly = await batch({ write: true, scopes: ["notes:create"] });
  assert.deepEqual(createOnly.writes, []); assert.equal(createOnly.calls.length, 1); checks++;
  const noUpdate = await batch({ write: true, scopes: ["notes:read", "notes:create"] });
  assert.deepEqual(noUpdate.writes, ["notes_create"]); assert.ok(noUpdate.rows.some(r => r.tool === "notes_append" && r.status === "skip")); checks++;
  const denied = await batch({ write: true, behavior: tool => tool === "notes_create" ? { result: { isError: true, structuredContent: { code: "FORBIDDEN", message: "private" } }, elapsedMs: 1 } : null });
  assert.equal(denied.calls.filter(c => c.tool === "notes_create").length, 1); assert.ok(!denied.calls.some(c => c.tool === "notes_append"));
  assert.ok(denied.rows.some(r => r.tool === "notes_create" && r.status === "skip")); checks++;
  const conflict = await batch({ write: true, behavior: tool => tool === "notes_append" ? { result: { isError: true, structuredContent: { code: "REVISION_CONFLICT" } }, elapsedMs: 1 } : null });
  assert.equal(conflict.calls.filter(c => c.tool === "notes_append").length, 1); assert.ok(!conflict.calls.some(c => c.tool === "notes_update"));
  assert.ok(conflict.rows.some(r => r.tool === "notes_append" && r.status === "fail")); checks++;
  const mismatch = await batch({ write: true, behavior: tool => tool === "notes_get_operation" ? { result: { structuredContent: { noteId: "other", committed: true, operationId: "wrong", committedRevision: 100, committedVersion: "wrong" } }, elapsedMs: 1 } : null });
  assert.ok(mismatch.failure); assert.deepEqual(mismatch.writes, ["notes_create"]); checks++;
  const badRead = await batch({ write: true, behavior: (tool, args) => tool === "notes_read" && args.noteId !== "pre-existing-note" ? { result: { structuredContent: { id: args.noteId, version: "wrong", content: "other", truncated: false } }, elapsedMs: 1 } : null });
  assert.ok(badRead.failure); assert.deepEqual(badRead.writes, ["notes_create"]); checks++;
  const cancelled = await batch({ write: true, abortAt: "notes_create" });
  assert.ok(cancelled.failure); assert.equal(cancelled.rows.filter(r => r.tool === "notes_create").length, 1); assert.ok(cancelled.rows.find(r => r.tool === "notes_create").recovery.idempotencyKey); assert.equal(cancelled.rows.find(r => r.tool === "notes_create").status, "pending"); assert.ok(!cancelled.calls.some(c => c.tool === "notes_append")); checks++;
  const wrongWorkspace = await batch({ write: true, behavior: tool => tool === "notes_get_capabilities" ? { result: { structuredContent: { apiVersion: 1, workspaceId: "other", scopes: grant.scopes } }, elapsedMs: 1 } : null });
  assert.ok(wrongWorkspace.failure); assert.equal(wrongWorkspace.calls.length, 1); checks++;
  globalThis.testStamp = { generation: 1, sessionId: "window", epoch: 1 };
  const invoked = [];
  globalThis.testInvoke = async (command, args) => { invoked.push({ command, args }); if (command === "agent_tester_start") return { connectionId: args.input.connectionId, tools }; if (command === "agent_tester_call") throw "token=/private/DO-NOT-EXPOSE"; };
  await mcpTesterClient.connect({ connectionId: id, workspaceId: "workspace", grantId: "grant" });
  assert.deepEqual(Object.keys(invoked[0].args.input).sort(), ["connectionId", "grantId", "workspaceId"]); checks++;
  await assert.rejects(() => mcpTesterClient.call(id, "notes_list", {}), e => !e.message.includes("DO-NOT-EXPOSE"));
  globalThis.testStamp.generation++;
  await mcpTesterClient.stop(id);
  assert.equal(invoked.at(-1).command, "agent_tester_stop"); assert.equal(invoked.at(-1).args.expected.epoch, 1); checks++;
  const { bundledAgentAdapter } = await import(pathToFileURL(join(temp, "agent-client.mjs")));
  globalThis.testInvoke = async command => { assert.equal(command, "agent_bundled_adapter"); return "/Applications/CyberNote.app/Contents/MacOS/cybernote-mcp"; };
  assert.equal(await bundledAgentAdapter(), "/Applications/CyberNote.app/Contents/MacOS/cybernote-mcp"); checks++;
  for (const invalid of ["relative/adapter", "/bad\npath", "", null]) {
    globalThis.testInvoke = async () => invalid;
    await assert.rejects(bundledAgentAdapter); checks++;
  }
  globalThis.testInvoke = async () => { globalThis.testStamp.generation++; return "/valid/path"; };
  await assert.rejects(bundledAgentAdapter, error => error.code === "access"); checks++;
  // All three mutations preserve legal ToolError evidence and perform only a
  // read-only recovery lookup. No recovery outcome resumes subsequent writes.
  for (const failedTool of ["notes_create", "notes_append", "notes_update"]) {
    for (const committed of [true, false, undefined]) {
      for (const lookup of ["pending", "not_found", "denied", "lost"]) {
        const operationId = randomUUID();
        const failed = await batch({ write: true, behavior: (tool, args) => {
          if (tool === failedTool) return { result: { isError: true, structuredContent: { code: "STORAGE_ERROR", message: "PRIVATE-ERROR-BODY", retryable: false, operationId, ...(committed === undefined ? {} : { committed }) } }, elapsedMs: 3 };
          if (tool === "notes_get_operation" && args.operationId === operationId) {
            if (lookup === "lost") throw Error("PRIVATE-TRANSPORT-BODY");
            return { result: { ...(lookup === "denied" ? { isError: true } : {}), structuredContent: lookup === "denied" ? { code: "FORBIDDEN", message: "PRIVATE-DENIED-BODY" } : { operationId, status: lookup } }, elapsedMs: 1 };
          }
        } });
        const failure = failed.rows.find(r => r.tool === failedTool && r.status === "fail");
        assert.equal(failure.recovery.operationId, operationId); assert.equal(failure.recovery.committed, committed);
        assert.equal(failure.recovery.idempotencyKey, failed.calls.find(c => c.tool === failedTool).args.idempotencyKey);
        assert.deepEqual(failure.recovery.arguments, failed.calls.find(c => c.tool === failedTool).args);
        assert.equal(failure.recovery.error.committed, committed);
        const queried = failed.rows.find(r => r.recovery?.operationId === operationId && r.tool === "notes_get_operation");
        assert.equal(queried.recovery.lookup, lookup === "lost" ? "failed" : lookup);
        assert.equal(queried.recovery.committed, committed);
        assert.equal(failed.calls.filter(c => c.tool === failedTool).length, 1);
        const index = failed.calls.findIndex(c => c.tool === failedTool);
        assert.ok(failed.calls.slice(index + 1).every(c => c.tool === "notes_get_operation"));
        assert.ok(!JSON.stringify(failed.rows).includes("PRIVATE-")); checks++;
      }
    }
  }
  for (const failedTool of ["notes_create", "notes_append", "notes_update"]) {
    const lost = await batch({ write: true, behavior: tool => { if (tool === failedTool) throw Error("PRIVATE-LOST-RESPONSE"); } });
    const intent = lost.rows.find(r => r.tool === failedTool && r.status === "pending").recovery;
    assert.deepEqual(intent.arguments, lost.calls.find(c => c.tool === failedTool).args);
    assert.equal(intent.operationId, undefined); assert.equal(intent.committed, undefined); assert.ok(lost.failure);
    assert.ok(!JSON.stringify(lost.rows).includes("PRIVATE-LOST-RESPONSE"));
    assert.equal(lost.calls.filter(c => c.tool === failedTool).length, 1); checks++;
  }
  for (const failedTool of ["notes_create", "notes_append", "notes_update"]) {
    const operationId = randomUUID(); let captured = false;
    const recovered = await batch({ write: true,
      onDispatch: (tool, args, rows) => {
        if (tool !== failedTool) return;
        const before = rows.at(-1);
        assert.equal(before.status, "pending"); assert.deepEqual(before.recovery.arguments, args);
        assert.equal(before.recovery.idempotencyKey, args.idempotencyKey); captured = true;
      },
      behavior: (tool, args) => {
        if (tool === failedTool) return { result: { isError: true, structuredContent: { code: "STORAGE_ERROR", message: "PRIVATE-ERROR-BODY", retryable: false, operationId, committed: true } }, elapsedMs: 1 };
        if (tool === "notes_get_operation" && args.operationId === operationId) return { result: { structuredContent: { operationId, noteId: "this-run-created-note", committedRevision: 404, committedVersion: "recovered-version", committed: true, warnings: ["WINDOW_REFRESH_REQUIRED", "PRIVATE-WARNING-BODY"] } }, elapsedMs: 1 };
      },
    });
    assert.equal(captured, true);
    const saved = recovered.rows.find(r => r.tool === "notes_get_operation" && r.recovery?.operationId === operationId).recovery;
    assert.equal(saved.lookup, "committed"); assert.equal(saved.receipt.committedVersion, "recovered-version");
    assert.ok(saved.warnings.includes("WINDOW_REFRESH_REQUIRED")); assert.ok(saved.warnings.includes("OTHER_WARNING"));
    assert.equal(recovered.calls.filter(c => c.tool === failedTool).length, 1);
    assert.ok(recovered.calls.slice(recovered.calls.findIndex(c => c.tool === failedTool) + 1).every(c => c.tool === "notes_get_operation"));
    assert.ok(!JSON.stringify(recovered.rows).includes("PRIVATE-")); checks++;
  }
  const malformedEvidence = await batch({ write: true, behavior: tool => tool === "notes_create" ? { result: { isError: true, structuredContent: { code: "STORAGE_ERROR", message: "PRIVATE-MESSAGE", retryable: false, operationId: "PRIVATE-BAD-ID\n", committed: "true", warnings: ["WARNING_PERSIST_FAILED", "PRIVATE-WARNING"], extra: "PRIVATE-BODY" } }, elapsedMs: 1 } : null });
  const evidence = malformedEvidence.rows.find(r => r.tool === "notes_create" && r.status === "fail").recovery;
  assert.equal(evidence.operationId, undefined); assert.equal(evidence.committed, undefined);
  assert.ok(evidence.warnings.includes("WARNING_PERSIST_FAILED"));
  assert.ok(!JSON.stringify(malformedEvidence.rows).includes("PRIVATE-"));
  assert.equal(malformedEvidence.calls.filter(c => c.tool === "notes_create").length, 1); checks++;
  const opaqueId = "opaque-operation-identity";
  const opaque = await batch({ write: true, behavior: (tool, args) => {
    if (tool === "notes_create") return { result: { isError: true, structuredContent: { code: "TIMEOUT", message: "PRIVATE-MESSAGE", retryable: false, operationId: opaqueId } }, elapsedMs: 1 };
    if (tool === "notes_get_operation" && args.operationId === opaqueId) return { result: { structuredContent: { status: "not_found", operationId: opaqueId } }, elapsedMs: 1 };
  } });
  assert.equal(opaque.rows.find(r => r.tool === "notes_create" && r.status === "fail").recovery.operationId, opaqueId);
  assert.equal(opaque.rows.find(r => r.tool === "notes_get_operation").recovery.lookup, "not_found"); checks++;
  checks += await checkTesterCallbacks(root, { runMcpBatch, queryMcpRecovery, recoveryState, TesterError, testerErrorMessage });
  // Both platform handler arrays must expose all three commands, exactly once each.
  const lib = await readFile(join(root, "src-tauri/src/lib.rs"), "utf8");
  const handlers = [...lib.matchAll(/tauri::generate_handler!\[([\s\S]*?)\]/g)];
  assert.equal(handlers.length, 2);
  for (const handler of handlers) for (const name of ["agent_tester_start", "agent_tester_call", "agent_tester_stop"]) assert.equal(handler[1].split(",").filter(s => s.trim() === name).length, 1);
  checks++;
  // Existing injection remains the original four-method interface.
  const originalClient = await readFile(join(root, "src/agent-client.ts"), "utf8");
  assert.match(originalClient, /interface AgentClient \{\s*settings\(\)[\s\S]*?revokeGrant\(grantId: string\)/);
  console.log(`MCP tester: ${checks} DTO / batch / cleanup / handler checks passed (no UI automation).`);
} finally { await rm(temp, { recursive: true, force: true }); }
