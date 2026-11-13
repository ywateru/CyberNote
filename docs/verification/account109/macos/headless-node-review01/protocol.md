# Account109 native headless protocol v1 — fixed contract

Native source: /private/tmp/cybernote-account109-headless-native/src-tauri/src/sync_headless.rs
Compile gate: sync-e2e && debug_assertions && desktop.
Runtime gate: NOTES_SYNC_E2E_HEADLESS=1 AND NOTES_SYNC_E2E=1.
Startup uses existing --data-dir option/Workspace lease; no paths or auth fields on stdin.

Stdout protocol lines: @@ACCOUNT109_HEADLESS@@ followed by JSON + LF.
Hello: {"type":"hello","protocol":1,"pid":123,"transport":"native-session-stdio","participant":"account109-native-harness"}
Request: {"id":1,"action":{"op":"ready"}} + LF. IDs integers 1..9007199254740991, strictly increasing. MAX input 65536 bytes including LF. No timeout field. Unknown/duplicate fields/types rejected. Driver timeouts are local only.
Response success: {"type":"response","id":1,"ok":true,"value":...}
Response failure: {"type":"response","id":1,"ok":false,"error":{"code":"operation_failed"}}
Protocol parse/input failure uses id:null and initiates normal exit. Never persist arbitrary raw errors.
MAX reply JSON bytes: 16000000 (prefix and LF excluded). Decoder line budget >=16000000 + prefix length + 1.
Error codes complete finite set: invalid_request, invalid_id, input_error, access_changed, not_found, sync_deferred, sync_disabled, sync_busy, sync_invalid, conflict_changed, operation_failed.

Fixed action objects (no other fields):
- {"op":"ready"}
- {"op":"workspace"}
- {"op":"conflicts"}
- {"op":"keepAll","kind":"note","entityId":"<canonical lowercase UUID>","digest":"<64 lowercase hex>","keepAll":true} (kind may also be folder)
- {"op":"accountStatus"}
- {"op":"signOut"}
- {"op":"readAttachment","id":"<canonical lowercase UUID>"}
- {"op":"createPlainNote","title":"account109-...","text":"account109-..."} (both prefixes mandatory, title<=256 bytes, text<=16000 bytes, no NUL)
- {"op":"shutdown"}

ready value: {"protocol":1,"participant":"account109-native-harness","transport":"native-session-stdio","windows":0}
workspace value: production Session.workspace full docs, access + metadata.
conflicts value: production sync Conflicts result including status/conflicts array.
keepAll value: production sync Resolve result; entity+digest must exist in current Conflicts, then production rules recheck.
accountStatus/signOut value: production account Status (safe finite existing stage/providerReason).
readAttachment value: production tagged attachment result; base64 key is data (NOT dataBase64), plus mime/name/recordedAt/access/metadata.
createPlainNote value: production tagged saved note including id, full document, plainText, access/metadata. Creation uses Session.ordinary then Session.register_save/save under one lock.
shutdown value: {"requested":true}. ACK only: caller MUST await natural child exit, cannot count ACK as clean shutdown.
