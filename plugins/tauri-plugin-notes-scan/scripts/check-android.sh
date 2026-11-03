#!/usr/bin/env bash
set -euo pipefail
notes_scan_root="$(cd "$(dirname "$0")/.." && pwd)"
: "${NOTES_SCAN_TAURI_ANDROID:?Set NOTES_SCAN_TAURI_ANDROID to tauri-2.12.5/mobile/android}"
: "${NOTES_SCAN_GRADLE:?Set NOTES_SCAN_GRADLE to a Gradle 9.6.1 executable}"
notes_scan_cache="${NOTES_SCAN_GRADLE_HOME:-/private/tmp/notes-scan-gradle-home}"
exec "$NOTES_SCAN_GRADLE" --gradle-user-home "$notes_scan_cache" -p "$notes_scan_root/android" \
  "-PtauriAndroidPath=$NOTES_SCAN_TAURI_ANDROID" --no-daemon --max-workers=2 "$@"
