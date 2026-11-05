import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  RecordingEnvelope,
  RecordingIdentity,
  RecordingMessage,
  RecordingTransfer,
} from "./recording-coordinator";

export function recordingSend(
  identity: RecordingIdentity,
  message: RecordingMessage,
) {
  return invoke<void>("recording_window_message", {
    sessionId: identity.sessionId,
    operationId: identity.operationId,
    message,
  });
}
export function recordingListen(handler: (event: RecordingEnvelope) => void) {
  return getCurrentWindow().listen<RecordingEnvelope>(
    "notes-recording",
    ({ payload }) => handler(payload),
  );
}
export function decodeRecordingFile(transfer: RecordingTransfer): File {
  const binary = atob(transfer.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return new File([bytes], transfer.name, {
    type: transfer.mime,
    lastModified: transfer.lastModified,
  });
}
export function recordingFinish(identity: RecordingIdentity) {
  return invoke<void>("recording_window_finish", {
    sessionId: identity.sessionId,
    operationId: identity.operationId,
  });
}
