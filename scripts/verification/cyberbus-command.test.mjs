import assert from "node:assert/strict";
import test from "node:test";
import {
  compactAccountStatus,
  compactDiagnostic,
  compactWorkspace,
  diagnosticDelta,
  documentFor,
  parseArguments,
  macDriverOptions,
  macAccountCommand,
  waitForDeviceOperation,
} from "./cyberbus-command.mjs";

test("QA labels do not become invalid native window placements", () => {
  for (const slot of ["cyberbus-command", "qa-a", "live"]) {
    assert.equal(macDriverOptions(slot).name, slot);
    assert.equal(macDriverOptions(slot).env.NOTES_SYNC_E2E_SLOT, undefined);
  }
  for (const slot of ["left", "right"])
    assert.equal(macDriverOptions(slot).env.NOTES_SYNC_E2E_SLOT, slot);
});

test("mac QA executes finite production IPC and receives the native status", async () => {
  const status = { state: "ready", enabled: true, devices: [] };
  const calls = [];
  const app = { evaluate: async (...args) => { calls.push(args); return status; } };
  const commands = [
    { type: "status" }, { type: "syncNow" }, { type: "setEnabled", enabled: true },
    { type: "syncDevice", deviceId: "123e4567-e89b-12d3-a456-426614174000", direction: "both" },
  ];
  for (const command of commands)
    assert.equal(await macAccountCommand(app, command, 15000), status);
  assert.deepEqual(calls.map(call => call[1]), commands);
  assert(calls.every(call => call[0] === "window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})" && call[2] === 15000));
  for (const command of [{ type: "signIn" }, { type: "status", token: "secret" }, { type: "setEnabled", enabled: "true" }, { type: "syncDevice", deviceId: "invalid", direction: "both" }])
    assert.throws(() => macAccountCommand(app, command), { code: "INVALID_ACCOUNT_COMMAND" });
  assert.equal(calls.length, commands.length);
});

test("a sync ACK stays pending until the same native operation succeeds", async () => {
  const deviceId = "123e4567-e89b-12d3-a456-426614174000";
  const accepted = { profile: { subject: "fixture-account" }, deviceOperation: { deviceId, direction: "both", startedAt: 1, phase: "running" } };
  let clock = 0, reads = 0;
  const completed = await waitForDeviceOperation(async () => {
    reads++;
    return { ...accepted, deviceOperation: { ...accepted.deviceOperation, phase: reads === 3 ? "succeeded" : "running" } };
  }, accepted, deviceId, "both", 1000, { now: () => clock, sleep: async ms => { clock += ms; } });
  assert.equal(reads, 3);
  assert.equal(completed.deviceOperation.phase, "succeeded");
});

test("failed, replaced and expired sync operations cannot become success", async () => {
  const deviceId = "123e4567-e89b-12d3-a456-426614174000";
  const accepted = { profile: { subject: "fixture-account" }, deviceOperation: { deviceId, direction: "pull", startedAt: 1, phase: "running" } };
  for (const [next, code] of [
    [{ ...accepted, deviceOperation: { ...accepted.deviceOperation, phase: "failed" } }, "DEVICE_SYNC_FAILED"],
    [{ ...accepted, deviceOperation: { ...accepted.deviceOperation, startedAt: 2, phase: "succeeded" } }, "DEVICE_SYNC_RETIRED"],
    [{ ...accepted, profile: { subject: "different-fixture-account" } }, "DEVICE_SYNC_RETIRED"],
  ]) {
    await assert.rejects(waitForDeviceOperation(async () => next, accepted, deviceId, "pull", 1000, { sleep: async () => {} }), { code });
  }
  let clock = 0;
  await assert.rejects(waitForDeviceOperation(async () => accepted, accepted, deviceId, "pull", 400, {
    now: () => clock, sleep: async ms => { clock += ms; },
  }), { code: "DEVICE_SYNC_TIMEOUT" });
  await assert.rejects(waitForDeviceOperation(async () => accepted, {}, deviceId, "pull", 1000), { code: "DEVICE_SYNC_NOT_ACCEPTED" });
});

test("mac commands require absolute binary and data directory paths", () => {
  assert.throws(
    () => parseArguments(["--platform", "mac", "--action", "status"]),
    { code: "ABSOLUTE_MAC_PATHS_REQUIRED" },
  );
  const parsed = parseArguments([
    "--platform",
    "mac",
    "--action",
    "diagnostic",
    "--binary",
    "/tmp/CyberNote",
    "--data-dir",
    "/tmp/cybernote-data",
    "--watch-ms",
    "2500",
  ]);
  assert.equal(parsed.action, "diagnostic");
  assert.equal(parsed.watchMs, 2500);
  assert.equal(parsed.timeoutMs, 30000);
});

test("only finite actions and action-specific arguments are accepted", () => {
  assert.throws(
    () =>
      parseArguments([
        "--platform",
        "android",
        "--action",
        "shell",
      ]),
    { code: "INVALID_ACTION" },
  );
  assert.throws(
    () =>
      parseArguments([
        "--platform",
        "android",
        "--action",
        "status",
        "--title",
        "unexpected",
      ]),
    { code: "ACTION_ARGUMENT_NOT_ALLOWED" },
  );
  assert.throws(
    () =>
      parseArguments([
        "--platform",
        "all",
        "--action",
        "read-attachment",
        "--binary",
        "/tmp/CyberNote",
        "--data-dir",
        "/tmp/data",
        "--attachment-id",
        "123e4567-e89b-12d3-a456-426614174000",
      ]),
    { code: "SINGLE_PLATFORM_REQUIRED" },
  );
  const target = "123e4567-e89b-12d3-a456-426614174000";
  assert.deepEqual(
    parseArguments([
      "--platform",
      "android",
      "--action",
      "sync-device",
      "--device-id",
      target,
      "--direction",
      "both",
    ]),
    {
      platform: "android",
      action: "sync-device",
      timeoutMs: 30000,
      watchMs: 0,
      binary: undefined,
      dataDir: undefined,
      slot: "cyberbus-command",
      androidPackage: "com.local.notesclone.cyberbusqa",
      deviceId: target,
      direction: "both",
    },
  );
  assert.throws(
    () =>
      parseArguments([
        "--platform",
        "android",
        "--action",
        "sync-device",
        "--device-id",
        "http://private.invalid",
        "--direction",
        "both",
      ]),
    { code: "INVALID_DEVICE_ID" },
  );
  assert.throws(
    () =>
      parseArguments([
        "--platform",
        "android",
        "--action",
        "sync-device",
        "--device-id",
        target,
        "--direction",
        "broadcast",
      ]),
    { code: "INVALID_DIRECTION" },
  );
});

test("account and workspace projections never retain identities or content", () => {
  const account = compactAccountStatus({
    state: "ready",
    enabled: true,
    profile: { subject: "secret-subject", displayName: "secret-name" },
    devices: [
      { id: "secret-device", name: "secret-device-name", online: true, connected: true, syncAvailable: true },
      { id: "other-device", name: "other-name", online: false, connected: false, syncAvailable: false },
    ],
    pendingCount: 0,
    conflictCount: 0,
    error: null,
  });
  assert.equal(account.signedIn, true);
  assert.equal(account.deviceCount, 2);
  assert.equal(account.onlineDeviceCount, 1);
  assert.doesNotMatch(JSON.stringify(account), /secret|other-device/);

  const workspace = compactWorkspace({
    notes: [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: "private title",
        plainText: "private body",
        document: { type: "doc", content: [] },
      },
    ],
    attachments: [
      {
        id: "123e4567-e89b-12d3-a456-426614174001",
        noteId: "123e4567-e89b-12d3-a456-426614174000",
        displayName: "private.bin",
        mime: "application/octet-stream",
        size: 4,
      },
    ],
    folders: [{ id: "private-folder" }],
  });
  assert.equal(workspace.noteCount, 1);
  assert.equal(workspace.attachmentCount, 1);
  assert.doesNotMatch(JSON.stringify(workspace), /private title|private body|private-folder|private\.bin/);
});

test("attachment descriptor hashes include production MIME and size fields", () => {
  const attachment = { id: "fixture-attachment", noteId: "fixture-note", displayName: "fixture.bin", mime: "application/octet-stream", size: 4 };
  const summary = value => compactWorkspace({ notes: [], folders: [], attachments: [value] }).attachmentDescriptorSha256;
  assert.notEqual(summary(attachment), summary({ ...attachment, mime: "image/png" }));
  assert.notEqual(summary(attachment), summary({ ...attachment, size: 8 }));
  assert.equal(summary(attachment), summary({ ...attachment, relativePath: "device-local-path" }));
});

test("diagnostics are bounded to known fields and produce counter deltas", () => {
  const before = compactDiagnostic({
    schemaVersion: 1,
    transportPhase: "connected",
    framesReceived: 2,
    metadataValid: 1,
    secretEndpoint: "do-not-return",
  });
  const after = compactDiagnostic({
    schemaVersion: 1,
    transportPhase: "ready",
    framesReceived: 5,
    metadataValid: 4,
  });
  assert.deepEqual(before, {
    schemaVersion: 1,
    transportPhase: "connected",
    framesReceived: 2,
    metadataValid: 1,
  });
  assert.deepEqual(diagnosticDelta(before, after), {
    counters: {
      schemaVersion: 0,
      framesReceived: 3,
      metadataValid: 3,
    },
    changed: {
      transportPhase: { before: "connected", after: "ready" },
    },
  });
  assert.doesNotMatch(JSON.stringify(before), /secretEndpoint/);
});

test("fixed note document includes title and each body line", () => {
  assert.deepEqual(documentFor("标题", "第一段\n第二段"), {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "标题", marks: [{ type: "bold" }] }],
      },
      { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
      { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
    ],
  });
});
