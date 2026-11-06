# APP92 native host/core/Session independent review — blocked freeze

Product `0d91e1847ffd2c510274810bbe15784b25e54007` (local cherry `1701a706`), author evidence `35aa5821` read as context, not substitute for independent checks. Fixed source `b33a5838` and Store/HTML `9bd6cc0f` + `9f1eb115` were previously reviewed. No actual Notes, devices, microphone, user database, UI or packages used. All independent data are synthetic in temporary directories.

`checks01`: **2 PASS /2 FAIL**, natural cargo exit101 /17.2796755s. Four targeted cases execute current core/real Session/SQLite and sparse managed files. One real `/bin/sleep` child is owned, killed and reaped by current wait_source; no Notes process. Shared target84 used only after explicit release, then released; temporary test-only module include restored before evidence commit.

## Blocking P2: media byte budgets apply too late

- `source_note` reads each regular export up to100MiB, but accumulates every attachment into a Vec before `import_selected` checks128MiB and before Store preparation checks100MiB. Independent two65MiB sparse files returned a valid130MiB SourceNote; assertion refused this. With1000 attachments the effective temporary memory can be far larger than the intended limit. Need cumulative preflight/bounded reads before buffering a whole note.
- `wait_source` monitors24MiB stdout/64KiB stderr, but never managed-export size or total. A managed100MiB+1 sparse export did not trigger source_limit; owned child only reached generic source_timeout. Need monitor regular owned export sizes/totals while waiting, finite failure and owned-client kill/wait. Do not claim a hard filesystem quota or immediate termination of an Apple Notes save already delegated to the source application: only the owned osascript client can be terminated, never Notes.

Original assertions/files/results retained unchanged. Original author notified for narrow repair; actual source→Store admission waits. No guessed production symptom or actual source failure is asserted from these synthetic counterexamples.

## Independent PASS evidence

- Replacing the stage directory identity makes it invalid; Drop does not delete a replacement sentinel. Test manually cleans only its own generated directories afterward.
- Real Session rejects stale token before Store append, with no notes or metadata event. First authorized append produces sequence1/event; repeat deduplicates and stays at sequence1 with no event, confirming quiet unchanged facts.

## Static boundary review

Opaque UUID job/item keys bind to real Tauri window label and Session id/epoch; production command constructs SystemSource only. Fixed original source IDs stay in private scan/read state. Global authorizations occur at scan/start/status, during reads and inside Session append. Session checks existing access/quiet operation, append-only Store preserves settings/keys; existing metadata receipts are used. Publication mutex orders cancel-before-save vs cancel-after-publication, with latter reporting committed outcome. Destroy marks cancellation and final publication checks window presence. Source reads run outside Session mutex. UI draft/recording flushing and full production command flow remain later UI integration scope.

OwnedStage uses generated paths and0700 parent, regular/no-follow/inode/size checks, identity-aware cleanup; names and source IDs do not become filesystem paths or code. Source stdout/stderr are0600 and never surfaced as error text. Fixed source reason conversion keeps returned diagnostics local; invalid raw JSON/schema maps to fixed errors. Reviewed structs and source_note recheck selected id/title/folder/stable plus ordered export index, namespace source identity by account+NUL+note. Filename/MIME classification is local after managed-file read. The missing aggregate/media live guard above prevents full resource-bound admission at this freeze.

The `actual_readonly_source_worker_to_isolated_store` entry is `#[cfg(test)]`, macOS-only and explicitly ignored. Requires private input/new output, verifies no symlink and restrictive input mode, creates0700 output. It uses one already-known attachment-free source, real SystemSource/core/Session/Store, synthetic baseline/settings, repeat/reopen, and private before/after comparisons. Assertions avoid printing source values; only fixed safe aggregate report is written. It is not invoked by normal tests or these checks. It remains a future opt-in actual-source operation, not evidence already executed here.

Reproduction: add only this test include temporarily to `src-tauri/src/apple_notes_import/core.rs`, run exact command in result JSON, then restore core:

```rust
#[cfg(test)]
#[path = "../../../docs/verification/apple-notes-import92/independent-host/review-host-tests.rs"]
mod independent_host;
```

## Resource repair admission

Repair `bb1aff7fa3b54388b92a5678f8072a0522f6afdd` statically verified: all attachment sizes are summed before any media Vec/read_to_end; each read independently rechecks its remaining budget. Stage preflight/wait/post-success checks enforce allocated filenames only, regular/no-symlink entries,100MiB per file and aggregate; actual statvfs computes available bytes in u128 and refuses below512MiB. Identity-matching stage cleanup now handles unsupported packages with standard no-follow recursive removal. Existing replaced-stage PASS remains preserved, not rerun.

`repair02`: **3 PASS**, natural cargo exit0 /13.425641208s. Original two failed assertions in unchanged `review-host-tests.rs` now pass. New `review-budget-delta.rs` directly verifies real current-filesystem free-space admission; exact100MiB accepted and aggregate+1 rejected; remaining budget refusal; unknown entry, directory package and symlink refusal; new cleanup unlinks its own symlink and retains outside synthetic sentinel. Low-space branch is statically reviewed, not dynamically executed by filling a disk. No unrelated passed tests repeated. The two sparse oversized exports use metadata lengths, not real media or source content. Only one owned sleep child runs and is reaped.

**Host/core/Session PASS after narrow repair.** Target84 is released; temporary includes restored. Original `checks01`2PASS/2FAIL and all logs remain intact. Existing one-note, already-known attachment-free actual SystemSource→new0700 isolated Store test may now be dispatched to the designated research operator. This admission is not an instruction to this reviewer to access Notes. No actual source or device action was performed by reviewer. UI/debug and signed-app runtime/TCC remain separate gates.

The budget is monitored admission, not a hard filesystem quota. An Apple Notes save already dispatched may finish after its client is killed; implementation kills/waits only its owned osascript child and never Notes. Do not claim instant external save termination.

Also statically reviewed safe aggregate source-runtime evidence `22b4508a`: exact approved sourceSHA, scan126 metadata, one stable attachment-free read, before/after equality, private capture modes and zero exports. Scope is correctly source-script runtime, not this native host/Store, full-library preservation or successful attachment export. Raw private source was not opened by reviewer.
