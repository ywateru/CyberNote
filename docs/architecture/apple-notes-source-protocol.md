# APP92 fixed adapter contract v1 — frozen host interface

Code owner research: `src-tauri/src/apple_notes_source.js` only. Host author will `include_str!` exact file, execute `/usr/bin/osascript -l JavaScript -e FIXED_SCRIPT JSON_ARG`; no shell, renderer script, source path or source query code. `run(argv)` exactly one JSON argv parameter. Source IDs/content remain private (returned to host buffers/private files/intended preview only), never diagnostic logs.

Request scan:
`{version:1,mode:"scan",maxNotes:5000}`
Response:
`{version:1,status:"ok",reason:null,accounts:[{id:string,name:string}],folders:[{id:string,name:string,parentId:string}],notes:[{id:string|null,title:string,folderId:string|null,status:"ok"|"locked"|"unreadable",reason:string|null}],truncated:boolean}`
folder.parentId names account or folder ID. All global folders once; resolve `folder.container().id()` (confirmed note.container().id()). Null/unreadable parent must yield affected note unreadable, never guess source hierarchy or silently root elsewhere. Account/folder metadata missing invalidates scan if ancestry cannot be complete. `maxNotes` fixed upper bound may produce truncated true, UI states cap. Do not read bodies in scan; lock flag before body in read.

Notes may enumerate an identical note object more than once. The fixed source adapter coalesces rows only when the nonnull stable ID and every returned metadata/status field match exactly. Conflicting rows for the same ID fail the entire scan with status `unreadable`, reason `source_changed`. Apply the note limit to the normalized result and report unvisited source rows as truncated. Host validation remains strict and rejects duplicate IDs in its received normalized response.

Request read:
`{version:1,mode:"read",noteId:string,exportPaths:[absoluteHostRandomPath,...]}`
Host supplies 1000 new not-yet-existing paths in one fresh owned mode0700 temp directory. Paths do not depend on source names/IDs; JS does not accept/invent other output paths. Each source attachment index j may only `app.save(attachment,{in:Path(exportPaths[j])})` once. Never `save` note/application, never write source or fallback to source path. All source collection calls explicit `collection()`; avoid running()/bridge length failures. Native-10000 is export_failed, no invented success. Directory export/package is unsupported (host rejects nonregular). Script does not read original file paths or auto-download URL attachments.
Response:
`{version:1,status:"ok"|"locked"|"unreadable"|"changed"|"automation_denied"|"timeout",reason:string|null,note:{id:string,title:string,folderId:string,html:string,plainText:string,createdAtMs:number,updatedAtMs:number,attachments:[{id:string,cid:string|null,name:string|null,status:"ok"|"export_failed"|"unsupported_object",reason:string|null,exportIndex:number}],stable:boolean}|null}`
`stable` compares source ID/folder/title/modification before/after the read/export. Source body read only after passwordProtected false. Missing required properties is unreadable, not empty body. Attachment cid/name may legitimately null, not noattachment; retain count/metadata and failure status. If >1000 or exportPaths length insufficient, item unsupported, not partial-success. Original attachment ordering preserved. MIME determined by host validated exported bytes/name, no need guess JXA MIME. Zero-length file may be valid; host verifies bounded regular exact file.

Top-level failures for either operation:
`{version:1,status:"automation_denied"|"timeout"|"unreadable"|"invalid_request",reason:FINITE_CATEGORY,accounts:[],folders:[],notes:[]}` or same with `note:null`; host validates mode-specific success shape only. Optional `code:number` numeric AppleEvent code okay, optional per-item code:number okay; no original error.message/stack. Finite reason e.g. automation_denied(-1743), event_timeout(-1712), property_unreadable, export_failed, locked, source_changed, hierarchy_unreadable, source_limit, invalid_request. Host additionally owns overall process timeout/cancellation, kills only its own osascript child.

Allowlisted source events: account/folder/note/attachment collections + described property getters; attachment save to exact host supplied newpath. No source make/set/delete/move/import/show/activate, no source DB/filesystem access, no Notes termination, no running(). JXA may parse argv and return JSON only; no ObjC file reads/writes needed. Research may test synthetic facade and actual bounded read privately. Host tests inject OS boundary only; no alternate script/runtime arbitrary evaluation API.

Host preview exposes opaque random item keys bound to scan/session/window token, not raw IDs. Host resolves account from folder ancestry, creates stable source identity `account.id + NUL + note.id` before hashing in storage, and validates read id/folder/status against scan. Source object opaque IDs never become paths or shell code.
