import assert from "node:assert/strict";
import test from "node:test";
import {
  compactAccountStatus,
  compactDiagnostic,
  compactWorkspace,
  diagnosticDelta,
  documentFor,
  parseArguments,
} from "./cyberbus-command.mjs";

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
    credentialStorage: "encryptedFile",
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
        mimeType: "application/octet-stream",
        byteLength: 4,
      },
    ],
    folders: [{ id: "private-folder" }],
  });
  assert.equal(workspace.noteCount, 1);
  assert.equal(workspace.attachmentCount, 1);
  assert.doesNotMatch(JSON.stringify(workspace), /private title|private body|private-folder|private\.bin/);
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
