#!/usr/bin/env node
// Finite CyberBus test command surface for the real macOS and Android apps.
// It accepts only named, typed actions. Account payloads, expressions, shell
// commands, arbitrary file bytes and device identifiers never cross this CLI.
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NativeApp, delay, bounded } from "./sync108-native-driver.mjs";

const ACTIONS = new Set([
  "status",
  "diagnostic",
  "workspace-summary",
  "workspace-index",
  "enable",
  "disable",
  "sync-now",
  "sync-device",
  "create-note",
  "create-fixture-note",
  "read-attachment",
]);
const PLATFORMS = new Set(["mac", "android", "all"]);
const DIRECTIONS = new Set(["push", "pull", "both"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){2,}$/;
const SLOT = /^[a-z0-9-]{1,32}$/;
const MAX_BODY_BYTES = 200_000;
const MAX_TITLE_BYTES = 2_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const OPTIONS = new Set([
  "--platform",
  "--action",
  "--binary",
  "--data-dir",
  "--slot",
  "--android-package",
  "--note-id",
  "--attachment-id",
  "--device-id",
  "--direction",
  "--title",
  "--body",
  "--watch-ms",
  "--timeout-ms",
  "--help",
]);

export const PHONE_FILES = Object.freeze([
  Object.freeze({
    name: "cyberbus-command.png",
    mime: "image/png",
    bytes: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=",
      "base64",
    ),
  }),
  Object.freeze({
    name: "cyberbus-command.bin",
    mime: "application/octet-stream",
    bytes: Buffer.from(Array.from({ length: 4_096 }, (_, index) => (index * 17 + 3) % 256)),
  }),
]);

function commandError(code, phase) {
  return Object.assign(new Error(code), { code, ...(phase ? { phase } : {}) });
}

function finiteInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw commandError(`INVALID_${name.toUpperCase()}`);
    return value;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw commandError(`INVALID_${name.toUpperCase()}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw commandError(`INVALID_${name.toUpperCase()}`);
  return number;
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeCode(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(value)
    ? value
    : null;
}

export function parseArguments(argv) {
  const values = {};
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!OPTIONS.has(option)) throw commandError("INVALID_ARGUMENT");
    if (option === "--help") {
      if (help) throw commandError("DUPLICATE_ARGUMENT");
      help = true;
      continue;
    }
    const key = option.slice(2);
    if (Object.hasOwn(values, key) || index + 1 >= argv.length)
      throw commandError("INVALID_ARGUMENT");
    values[key] = argv[++index];
  }
  if (help) return Object.freeze({ help: true });

  const platform = values.platform ?? "mac";
  const action = values.action;
  if (!PLATFORMS.has(platform)) throw commandError("INVALID_PLATFORM");
  if (!ACTIONS.has(action)) throw commandError("INVALID_ACTION");
  const timeoutMs = finiteInteger(values["timeout-ms"] ?? "30000", "timeout_ms", {
    min: 1_000,
    max: 120_000,
  });
  const watchMs = finiteInteger(values["watch-ms"] ?? "0", "watch_ms", {
    min: 0,
    max: 60_000,
  });
  const mac = platform === "mac" || platform === "all";
  const android = platform === "android" || platform === "all";
  const binary = values.binary;
  const dataDir = values["data-dir"];
  if (mac && (!binary || !dataDir || !isAbsolute(binary) || !isAbsolute(dataDir)))
    throw commandError("ABSOLUTE_MAC_PATHS_REQUIRED");
  const slot = values.slot ?? "cyberbus-command";
  if (!SLOT.test(slot)) throw commandError("INVALID_SLOT");
  const androidPackage =
    values["android-package"] ??
    process.env.CYBERNOTE_ANDROID_PACKAGE ??
    "com.local.notesclone.cyberbusqa";
  if (!PACKAGE.test(androidPackage) || byteLength(androidPackage) > 200)
    throw commandError("INVALID_ANDROID_PACKAGE");

  const allowed = {
    status: new Set(),
    diagnostic: new Set(["watch-ms"]),
    "workspace-summary": new Set(),
    "workspace-index": new Set(),
    enable: new Set(),
    disable: new Set(),
    "sync-now": new Set(),
    "sync-device": new Set(["device-id", "direction"]),
    "create-note": new Set(["title", "body"]),
    "create-fixture-note": new Set(["title", "body"]),
    "read-attachment": new Set(["attachment-id"]),
  }[action];
  const actionValues = {
    platform,
    action,
    timeoutMs,
    watchMs,
    binary: binary && resolve(binary),
    dataDir: dataDir && resolve(dataDir),
    slot,
    androidPackage,
  };
  for (const key of allowed) {
    if (!Object.hasOwn(values, key)) continue;
    if (key === "watch-ms") continue;
    actionValues[
      key === "attachment-id"
        ? "attachmentId"
        : key === "device-id"
          ? "deviceId"
          : key
    ] = values[key];
  }
  const suppliedActionOptions = Object.keys(values).filter(
    (key) =>
      !["platform", "action", "binary", "data-dir", "slot", "android-package", "timeout-ms", "watch-ms"].includes(
        key,
      ),
  );
  if (suppliedActionOptions.some((key) => !allowed.has(key)))
    throw commandError("ACTION_ARGUMENT_NOT_ALLOWED");

  if (action === "create-note" || action === "create-fixture-note") {
    if (
      typeof actionValues.title !== "string" ||
      !actionValues.title.trim() ||
      actionValues.title.includes("\n") ||
      actionValues.title.includes("\r") ||
      byteLength(actionValues.title) > MAX_TITLE_BYTES ||
      typeof actionValues.body !== "string" ||
      !actionValues.body ||
      byteLength(actionValues.body) > MAX_BODY_BYTES
    )
      throw commandError("INVALID_NOTE_FIXTURE");
  }
  if (action === "read-attachment") {
    if (platform === "all") throw commandError("SINGLE_PLATFORM_REQUIRED");
    if (typeof actionValues.attachmentId !== "string" || !UUID.test(actionValues.attachmentId))
      throw commandError("INVALID_ATTACHMENT_ID");
  }
  if (action === "sync-device") {
    if (typeof actionValues.deviceId !== "string" || !UUID.test(actionValues.deviceId))
      throw commandError("INVALID_DEVICE_ID");
    if (typeof actionValues.direction !== "string" || !DIRECTIONS.has(actionValues.direction))
      throw commandError("INVALID_DIRECTION");
  }
  if (action === "workspace-index" && platform === "all")
    throw commandError("SINGLE_PLATFORM_REQUIRED");
  return Object.freeze(actionValues);
}

export function compactAccountStatus(value) {
  if (!isObject(value)) throw commandError("INVALID_ACCOUNT_STATUS");
  const devices = Array.isArray(value.devices) ? value.devices : [];
  const profile = isObject(value.profile) ? value.profile : null;
  const error = isObject(value.error) ? value.error : null;
  const operation = isObject(value.deviceOperation) ? value.deviceOperation : null;
  return {
    state: safeCode(value.state),
    enabled: value.enabled === true,
    signedIn: !!profile,
    authorizationSurface: safeCode(value.authorizationSurface),
    deviceCount: devices.length,
    onlineDeviceCount: devices.filter((device) => isObject(device) && device.online === true).length,
    connectedDeviceCount: devices.filter((device) => isObject(device) && device.connected === true).length,
    syncAvailableDeviceCount: devices.filter(
      (device) => isObject(device) && device.syncAvailable === true,
    ).length,
    pendingCount: Number.isSafeInteger(value.pendingCount) ? value.pendingCount : null,
    conflictCount: Number.isSafeInteger(value.conflictCount) ? value.conflictCount : null,
    lastSyncAt: Number.isSafeInteger(value.lastSyncAt) ? value.lastSyncAt : null,
    errorCode: error ? safeCode(error.code) : null,
    errorStage: error ? safeCode(error.stage) : null,
    providerReason: error ? safeCode(error.providerReason) : null,
    operation: operation
      ? {
          direction: safeCode(operation.direction),
          phase: safeCode(operation.phase),
          progress:
            isObject(operation.progress) && Number.isSafeInteger(operation.progress.completed)
              ? operation.progress.completed
              : null,
        }
      : null,
  };
}

function attachmentSemantic(value) {
  if (!isObject(value)) return null;
  return {
    id: typeof value.id === "string" ? value.id : null,
    noteId: typeof value.noteId === "string" ? value.noteId : null,
    displayName: typeof value.displayName === "string" ? value.displayName : null,
    mimeType: typeof value.mime === "string" ? value.mime : null,
    byteLength: Number.isSafeInteger(value.size) ? value.size : null,
  };
}

export function compactWorkspace(value, { includeIds = false } = {}) {
  if (!isObject(value)) throw commandError("INVALID_WORKSPACE");
  const notes = Array.isArray(value.notes) ? value.notes : [];
  const attachments = Array.isArray(value.attachments) ? value.attachments : [];
  const folders = Array.isArray(value.folders) ? value.folders : [];
  const active = notes.filter((note) => isObject(note) && !note.deletedAt);
  const deleted = notes.filter((note) => isObject(note) && !!note.deletedAt);
  const semanticNotes = active
    .map((note) => ({
      id: note.id,
      title: note.title,
      plainText: note.plainText,
      document: note.document,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const semanticAttachments = attachments
    .map(attachmentSemantic)
    .sort((left, right) =>
      String(left?.id ?? "").localeCompare(String(right?.id ?? "")),
    );
  const summary = {
    noteCount: active.length,
    deletedNoteCount: deleted.length,
    attachmentCount: attachments.length,
    folderCount: folders.length,
    noteSemanticSha256: digestJson(semanticNotes),
    attachmentDescriptorSha256: digestJson(semanticAttachments),
  };
  if (includeIds) {
    summary.noteIds = active
      .filter((note) => typeof note.id === "string" && UUID.test(note.id))
      .map((note) => note.id)
      .sort();
    summary.attachmentIds = attachments
      .filter(
        (attachment) =>
          isObject(attachment) &&
          typeof attachment.id === "string" &&
          UUID.test(attachment.id),
      )
      .map((attachment) => attachment.id)
      .sort();
  }
  return summary;
}

export const DIAGNOSTIC_FIELDS = Object.freeze([
  "schemaVersion",
  "diagnosticsAvailable",
  "transportRunning",
  "transportPhase",
  "transportGeneration",
  "localIpv4Present",
  "routeCount",
  "remoteRouteCount",
  "indirectRouteCount",
  "deviceCount",
  "onlineDeviceCount",
  "devicesWithVirtualIpv4",
  "directoryRevision",
  "livePeerCount",
  "liveProbeCount",
  "activeRefreshCount",
  "activeProfileQueryCount",
  "metadataReceived",
  "metadataValid",
  "noiseVerified",
  "probeSuccess",
  "probeFailure",
  "routeFetchSuccess",
  "routeFetchFailure",
  "networkUnready",
  "sessionsEstablished",
  "sessionsInbound",
  "sessionsOutbound",
  "probeSessionsEstablished",
  "businessSessionsEstablished",
  "upPublished",
  "upInstalled",
  "metadataQueued",
  "metadataQueueFailed",
  "writerFramesSent",
  "writerMetadataSent",
  "writerSendFailed",
  "writerProbeExpired",
  "framesReceived",
  "metadataFramesReceived",
  "readerErrors",
  "readerClosed",
  "readerIo",
  "readerProtocol",
  "readerAuthentication",
  "readerLimit",
  "readerTimeout",
  "readerAborted",
  "readerForcedAbort",
  "readerPrefixTimeout",
  "readerNoFrameExits",
  "readerCloseFrames",
  "readerAdmissionClosed",
  "readerChannelClosed",
  "writerClosed",
  "writerIo",
  "writerProtocol",
  "writerAuthentication",
  "writerLimit",
  "writerTimeout",
  "writerShutdownFailed",
  "writerExitCancel",
  "writerExitStop",
  "writerExitQueueClosed",
  "writerExitProbeExpired",
  "writerExitPrefixTimeout",
  "writerExitAdmissionClosed",
  "writerExitSendFailed",
  "writerCloseAttempted",
  "writerCloseSent",
  "writerCloseFailed",
  "localPrefixReady",
  "localPrefixSent",
]);

export function compactDiagnostic(value) {
  if (!isObject(value)) throw commandError("INVALID_DIAGNOSTIC");
  return Object.fromEntries(
    DIAGNOSTIC_FIELDS.filter((key) => Object.hasOwn(value, key)).map((key) => {
      const field = value[key];
      if (
        typeof field !== "boolean" &&
        typeof field !== "string" &&
        !(Number.isSafeInteger(field) && field >= 0)
      )
        throw commandError("INVALID_DIAGNOSTIC");
      return [key, field];
    }),
  );
}

export function diagnosticDelta(before, after) {
  const delta = {};
  const changed = {};
  for (const key of DIAGNOSTIC_FIELDS) {
    if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key)) continue;
    if (Number.isSafeInteger(before[key]) && Number.isSafeInteger(after[key]))
      delta[key] = after[key] - before[key];
    else if (before[key] !== after[key]) changed[key] = { before: before[key], after: after[key] };
  }
  return { counters: delta, changed };
}

export function documentFor(title, body) {
  const content = [
    {
      type: "paragraph",
      content: [{ type: "text", text: title, marks: [{ type: "bold" }] }],
    },
    ...body.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  ];
  return { type: "doc", content };
}

function noteProjection(note) {
  if (!isObject(note) || typeof note.id !== "string" || !UUID.test(note.id))
    throw commandError("INVALID_CREATED_NOTE");
  return {
    noteId: note.id,
    plainTextBytes:
      typeof note.plainText === "string" ? byteLength(note.plainText) : null,
    noteSemanticSha256: digestJson({
      title: note.title,
      plainText: note.plainText,
      document: note.document,
    }),
  };
}

function fixtureFiles() {
  return PHONE_FILES.map(({ name, mime, bytes }) => ({
    name,
    mime,
    base64: bytes.toString("base64"),
  }));
}

async function macWorkspace(app) {
  return (await app.state()).workspace;
}

async function macCreateNote(app, title, body) {
  if ((await app.state()).preferences.open) await app.execute("app.back");
  await app.execute("folder.select", { id: "default" });
  await app.execute("note.create");
  const created = await app.state();
  const noteId = created.selection?.noteId;
  if (typeof noteId !== "string" || !UUID.test(noteId))
    throw commandError("INVALID_CREATED_NOTE");
  await app.execute("editor.setContent", { document: documentFor(title, body) });
  await app.execute("app.flush");
  const workspace = await macWorkspace(app);
  const note = workspace.notes.find((entry) => entry.id === noteId);
  if (!note) throw commandError("INVALID_CREATED_NOTE");
  return note;
}

async function macReadAttachment(app, attachmentId) {
  const workspace = await macWorkspace(app);
  const attachment = workspace.attachments.find((entry) => entry.id === attachmentId);
  if (!attachment || typeof attachment.noteId !== "string")
    throw commandError("ATTACHMENT_NOT_FOUND");
  const result = await app.evaluate(
    `(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;` +
      `const access=s.workspace.access,owner=access.notes[arg.noteId];` +
      `if(!owner?.authorized)throw Error('OWNER_NOT_AUTHORIZED');` +
      `return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,` +
      `expected:{sessionId:access.sessionId,epoch:access.epoch,noteEpoch:owner.epoch}});})()`,
    { id: attachmentId, noteId: attachment.noteId },
  );
  if (!isObject(result) || typeof result.data !== "string")
    throw commandError("INVALID_ATTACHMENT_READ");
  const bytes = Buffer.from(result.data, "base64");
  return {
    attachmentId,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function macDriverOptions(slot) {
  return {
    name: slot,
    env: {
      ...(["left", "right"].includes(slot) ? { NOTES_SYNC_E2E_SLOT: slot } : {}),
      CYBERNOTE_ACCOUNT_SDK_DIAGNOSTICS: "1",
      CYBERNOTE_SYNC_DIAGNOSTICS: "1",
    },
  };
}

// QA actions use the same production IPC as Android. The UI handler requires
// an open preferences page and returns its inspect wrapper, not AccountStatus;
// enable/syncDevice there only open confirmation and do not execute a transfer.
export function macAccountCommand(app, command, timeoutMs) {
  const keys = {
    status: ["type"], syncNow: ["type"], setEnabled: ["type", "enabled"],
    syncDevice: ["type", "deviceId", "direction"],
  }[command?.type];
  if (!keys || Object.keys(command).length !== keys.length ||
      Object.keys(command).some(key => !keys.includes(key)) ||
      (command.type === "setEnabled" && typeof command.enabled !== "boolean") ||
      (command.type === "syncDevice" && (!UUID.test(command.deviceId) || !DIRECTIONS.has(command.direction))))
    throw commandError("INVALID_ACCOUNT_COMMAND");
  return app.evaluate("window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})", command, timeoutMs);
}

export async function waitForDeviceOperation(readStatus, accepted, deviceId, direction, timeoutMs, {
  now = Date.now, sleep = delay,
} = {}) {
  const operation = accepted?.deviceOperation;
  if (!operation || operation.deviceId !== deviceId || operation.direction !== direction ||
      !Number.isSafeInteger(operation.startedAt) || operation.startedAt < 0)
    throw commandError("DEVICE_SYNC_NOT_ACCEPTED");
  const deadline = now() + timeoutMs;
  let status = accepted;
  for (;;) {
    const current = status.deviceOperation;
    if (!current || current.deviceId !== deviceId || current.direction !== direction ||
        current.startedAt !== operation.startedAt || status.profile?.subject !== accepted.profile?.subject)
      throw commandError("DEVICE_SYNC_RETIRED");
    if (current.phase === "succeeded") return status;
    if (current.phase === "failed") throw commandError("DEVICE_SYNC_FAILED", safeCode(status.error?.syncStage));
    if (current.phase !== "running") throw commandError("INVALID_DEVICE_OPERATION");
    const remaining = deadline - now();
    if (remaining <= 0) throw commandError("DEVICE_SYNC_TIMEOUT");
    await sleep(Math.min(200, remaining));
    const requestBudget = deadline - now();
    if (requestBudget <= 0) throw commandError("DEVICE_SYNC_TIMEOUT");
    const budget = Math.min(requestBudget, 10_000);
    status = await bounded(readStatus(budget), budget, "DEVICE_SYNC_TIMEOUT");
  }
}

async function runMac(config, action) {
  const requestTimeout = Math.min(config.timeoutMs, 60_000);
  const app = new NativeApp(config.binary, config.dataDir, macDriverOptions(config.slot));
  try {
    await app.ready(requestTimeout);
    if (action === "status") {
      return {
        account: compactAccountStatus(
          await macAccountCommand(app, { type: "status" }, requestTimeout),
        ),
        workspace: compactWorkspace(await macWorkspace(app)),
      };
    }
    if (action === "workspace-summary")
      return compactWorkspace(await macWorkspace(app));
    if (action === "workspace-index")
      return compactWorkspace(await macWorkspace(app), { includeIds: true });
    if (action === "diagnostic") {
      const before = compactDiagnostic(
        await app.request({ op: "accountSdkDiagnostic" }, requestTimeout),
      );
      if (!config.watchMs) return { snapshot: before };
      await delay(config.watchMs);
      const after = compactDiagnostic(
        await app.request({ op: "accountSdkDiagnostic" }, requestTimeout),
      );
      return { before, after, delta: diagnosticDelta(before, after) };
    }
    if (action === "enable" || action === "disable") {
      await macAccountCommand(
        app,
        { type: "setEnabled", enabled: action === "enable" },
        requestTimeout,
      );
      await app.idle();
      return {
        account: compactAccountStatus(
          await macAccountCommand(app, { type: "status" }, requestTimeout),
        ),
      };
    }
    if (action === "sync-now") {
      await macAccountCommand(app, { type: "syncNow" }, requestTimeout);
      await app.idle();
      return {
        account: compactAccountStatus(
          await macAccountCommand(app, { type: "status" }, requestTimeout),
        ),
      };
    }
    if (action === "sync-device") {
      const accepted = await macAccountCommand(
        app,
        { type: "syncDevice", deviceId: config.deviceId, direction: config.direction },
        requestTimeout,
      );
      // The native command ACK only starts a background operation. Keep this
      // owned Mac alive until its durable result; closing it now cancels sync.
      const completed = await waitForDeviceOperation(
        budget => macAccountCommand(app, { type: "status" }, budget),
        accepted, config.deviceId, config.direction, config.timeoutMs,
      );
      return {
        account: compactAccountStatus(completed),
      };
    }
    if (action === "create-note" || action === "create-fixture-note") {
      const note = await macCreateNote(app, config.title, config.body);
      const attachments = [];
      if (action === "create-fixture-note") {
        await app.execute("attachment.submit", { files: fixtureFiles() }, requestTimeout);
        await app.execute("app.flush", {}, requestTimeout);
        const workspace = await macWorkspace(app);
        for (const attachment of workspace.attachments.filter(
          (entry) => entry.noteId === note.id,
        )) {
          attachments.push({
            ...(await macReadAttachment(app, attachment.id)),
            mimeType: attachment.mime,
            displayName: attachment.displayName,
          });
        }
      }
      return { note: noteProjection(note), attachments };
    }
    if (action === "read-attachment")
      return macReadAttachment(app, config.attachmentId);
    throw commandError("INVALID_ACTION");
  } finally {
    await app.close();
  }
}

async function runAndroid(config, action) {
  process.env.CYBERNOTE_ANDROID_PACKAGE = config.androidPackage;
  const { connectAndroid } = await import(
    `${pathToFileURL(resolve("scripts/verification/account109-android.mjs")).href}`
  );
  const api = await connectAndroid();
  try {
    if (action === "status") {
      return {
        account: compactAccountStatus(await api.accountStatus()),
        workspace: compactWorkspace(await api.readWorkspace()),
        ui: await api.inspect().then(({ ui }) => ({
          ready: ui?.ready === true,
          state: safeCode(ui?.state),
          loginVisible: ui?.login === true,
          cancelVisible: ui?.cancel === true,
        })),
      };
    }
    if (action === "workspace-summary")
      return compactWorkspace(await api.readWorkspace());
    if (action === "workspace-index")
      return compactWorkspace(await api.readWorkspace(), { includeIds: true });
    if (action === "diagnostic") {
      const before = compactDiagnostic(await api.sdkDiagnostic());
      if (!config.watchMs) return { snapshot: before };
      await delay(config.watchMs);
      const after = compactDiagnostic(await api.sdkDiagnostic());
      return { before, after, delta: diagnosticDelta(before, after) };
    }
    if (action === "enable" || action === "disable") {
      await api.setEnabled(action === "enable");
      return { account: compactAccountStatus(await api.accountStatus()) };
    }
    if (action === "sync-now") {
      await api.syncNow();
      return { account: compactAccountStatus(await api.accountStatus()) };
    }
    if (action === "sync-device") {
      const accepted = await api.syncDevice(config.deviceId, config.direction);
      const completed = await waitForDeviceOperation(
        () => api.accountStatus(), accepted, config.deviceId, config.direction, config.timeoutMs,
      );
      return { account: compactAccountStatus(completed) };
    }
    if (action === "create-note" || action === "create-fixture-note") {
      let note = await api.createNote({ title: config.title, body: config.body });
      const attachments = [];
      if (action === "create-fixture-note") {
        note = await api.submitNoteFiles(note.id);
        const workspace = await api.readWorkspace();
        for (const attachment of workspace.attachments.filter(
          (entry) => entry.noteId === note.id,
        )) {
          const result = await api.readAttachment(attachment.id);
          attachments.push({
            attachmentId: attachment.id,
            byteLength: result.byteLength,
            sha256: result.sha256,
            mimeType: attachment.mime,
            displayName: attachment.displayName,
          });
        }
      }
      return { note: noteProjection(note), attachments };
    }
    if (action === "read-attachment")
      return {
        attachmentId: config.attachmentId,
        ...(await api.readAttachment(config.attachmentId)),
      };
    throw commandError("INVALID_ACTION");
  } finally {
    await api.close();
  }
}

function sanitizedError(error) {
  return {
    code: safeCode(error?.code) ?? "COMMAND_FAILED",
    ...(safeCode(error?.phase) ? { phase: safeCode(error.phase) } : {}),
  };
}

export async function execute(config) {
  if (config.help) return { ok: true, usage: usage() };
  const targets =
    config.platform === "all" ? ["mac", "android"] : [config.platform];
  const results = {};
  for (const target of targets) {
    results[target] =
      target === "mac"
        ? await runMac(config, config.action)
        : await runAndroid(config, config.action);
  }
  return {
    ok: true,
    action: config.action,
    platform: config.platform,
    results,
  };
}

export function usage() {
  return [
    "Usage:",
    "  node scripts/verification/cyberbus-command.mjs --platform mac --action status --binary ABS --data-dir ABS [--slot NAME]",
    "  node scripts/verification/cyberbus-command.mjs --platform android --action diagnostic [--android-package PACKAGE] [--watch-ms MS]",
    "  node scripts/verification/cyberbus-command.mjs --platform all --action diagnostic --binary ABS --data-dir ABS [--watch-ms MS]",
    "  node scripts/verification/cyberbus-command.mjs --platform mac|android|all --action sync-device --device-id UUID --direction push|pull|both [--binary ABS --data-dir ABS]",
    "",
    "Actions: status, diagnostic, workspace-summary, workspace-index, enable, disable, sync-now, sync-device,",
    "         create-note, create-fixture-note, read-attachment",
  ].join("\n");
}

async function main() {
  try {
    const config = parseArguments(process.argv.slice(2));
    const result = await execute(config);
    const output = JSON.stringify(result);
    if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES)
      throw commandError("OUTPUT_TOO_LARGE");
    process.stdout.write(output + "\n");
  } catch (error) {
    const failure = sanitizedError(error);
    process.stdout.write(JSON.stringify({ ok: false, error: failure }) + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  await main();
