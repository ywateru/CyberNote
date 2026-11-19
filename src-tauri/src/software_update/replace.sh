#!/bin/sh
# Private, detached transaction; all paths are arguments, never shell source.
# No elevation, no recursive removal. Backups/failed payloads are retained.
set -u
pid=$1 stage=$2 target=$3 backup=$4 work=$5 executable=$6 expected=$7 opener=$8 staged_hash=$9
phase() { printf '%s\n' "$1" > "$work/phase.tmp" && mv "$work/phase.tmp" "$work/phase"; }
phase waiting_exit || exit 1
n=0
while kill -0 "$pid" 2>/dev/null; do
  if [ -e "$work/abort" ] || [ "$n" -ge 120 ]; then phase cancelled; exit 1; fi
  n=$((n + 1)); sleep 1
done
if [ -e "$work/abort" ] || [ -L "$target" ] || [ -L "$stage" ] || [ -e "$backup" ] || [ ! -d "$target" ] || [ ! -d "$stage" ]; then phase unchanged; exit 1; fi
actual=$(/usr/bin/shasum -a 256 "$target/Contents/MacOS/$executable") || { phase unchanged; exit 1; }
actual=${actual%% *}
if [ "$actual" != "$expected" ]; then phase unchanged; exit 1; fi
staged_actual=$(/usr/bin/shasum -a 256 "$stage/Contents/MacOS/$executable") || { phase unchanged; exit 1; }
staged_actual=${staged_actual%% *}
if [ "$staged_actual" != "$staged_hash" ]; then phase unchanged; exit 1; fi
phase replacing || exit 1
mv "$target" "$backup" || { phase unchanged; exit 1; }
if ! mv "$stage" "$target"; then
  if mv "$backup" "$target"; then phase rolled_back; "$opener" -n "$target"; else phase rollback_failed; fi
  exit 1
fi
rollback() {
  # Never overwrite/delete the failed bundle; retain evidence beside the backup.
  if mv "$target" "$work/failed.app" && mv "$backup" "$target"; then
    phase rolled_back; "$opener" -n "$target"; exit 1
  fi
  phase rollback_failed; exit 1
}
phase awaiting_ack || rollback
"$opener" -n "$target" || rollback
n=0
while [ "$n" -lt 90 ]; do
  if [ -f "$work/ack" ] && [ ! -L "$work/ack" ]; then phase complete; exit 0; fi
  n=$((n + 1)); sleep 1
done
rollback
