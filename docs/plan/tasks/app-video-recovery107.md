---
id: app-video-recovery107
scope: attachment-video-playback
status: in-progress
depends-on: [app-module-extraction98]
---

## Problem and evidence

The production `MediaView` renders a native video with controls and autoplay but no element error presentation or retry. Acquisition errors are shown separately by `useAttachmentMedia`; an already-issued URL returning an error is outside that path. This is an independently observable recovery gap, not a proven explanation of the Mac106 live11/12 post-seek stall.

See [bounded source analysis](../../verification/modernization101/final106-video-readonly-causes-20261111.md). The existing backend contract expires idle leases and returns 404. Do not change its TTL, authorization, revocation, HTTP contract or package identity to explain away native observations.

## Required behavior

When the current video reports a read/network/unsupported/decode failure, display a concise error and an explicit retry action in its attachment component. Retry must request a fresh original source through the existing authorized hook, rather than reload the expired URL or read the whole attachment into memory. Do not automatically loop or retry a stale owner.

Preserve a finite selected playback time where the platform can restore it to the replacement source. Do not silently claim a failed seek restored successfully. Playback after explicit retry should follow the user's retry intent and current ownership; do not autoplay after navigation, source revocation, unmount or authorization loss. Initial activation, native controls, visibility-based release, attachment menus and audio behavior must remain intact.

The error surface belongs to the existing attachment layout:

```text
attachment video
  ├─ native video and controls
  └─ error text + [重试视频]   (only after a failure)
```

## Validation and delivery

Use a small existing fixture and actual video element/error flow to establish failure and recovery, including a changed source URL, restored finite time and playback where supported. Check late old-element events and owner/authorization/unmount cancellation, as well as initial ordinary playback. Tests must exercise production behavior, not just string assertions or a mirror of the implementation. Reuse existing frontend tooling; no new Rust build, package, large fixture, broad suite or native UI test in this task. Keep evidence small and delete only newly generated disposable test caches after tests stop.

The author implements and tests; a different agent reviews and verifies. Changes in the dirty shared workspace are limited to the exact video component/helper, focused test and this task's documentation; preserve all unrelated edits. Frozen106 deliverables remain unchanged. Source readiness is separate from future dual-package/native verification.

## Review progress

Candidate1 passed typecheck and eight actual App/browser checks, but [independent review](../reviews/app-video-recovery107-independent.md) rejected one lifecycle gap. A real StrictMode probe with an already-loaded source reproduced cleanup removing the video `src` and replay setup not restoring it (`src=null`, `readyState=0`, connected element, live source). Candidate1 bytes and failed evidence remain preserved as the rejected historical candidate.

The final F1 revision restores the authorized source during setup under the existing validity gates, with synchronous cleanup/revocation unchanged. Independent review accepted the four-line correction and reran the original StrictMode probe: source/attribute/currentSrc agree, `readyState=4`, `networkState=1`. The affected eight actual App/video checks and final typecheck passed. Current status is **source-ready / native-open**; the task remains in progress because native validation and delivery are separate outstanding steps. This does not establish the original Mac stall's cause or repair.

The read-only final source identity is revision `bf26dae17f972fc09276deb456b4599e1ebe5d67`, dirty=true, 447 inputs, fingerprint `f34853c6cf8687b880ab0c088085b4af89e2ae8a695bbce7f0cac88c96e9dc84` (`artifacts/video-recovery107/current-source-identity.json`). Frozen106 packages retain their 446-input/`74c0a8bb…` identity and do not contain107. No native build, reinstall or device test was performed for107.
