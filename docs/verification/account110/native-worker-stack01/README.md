# Account110 native worker stack correction

Source: `8c3fc430c7289a4e5a96f45f676612861037fd2e`, based on frozen live source `cb91f4b82995a314268aa47b491b7973679dff8f`. Author branch: `codex/account110-worker-stack-fix`. Independent review pending.

The actual A crash is preserved separately by documentation commit `633bc98209000375d9290b459607d25ed850cc66`. Its sanitized receipt identifies Rust stack-overflow handling on a Tokio worker, with `MaybeDone<account::worker::run>` polling frames. This patch addresses the concrete inline child-future composition; it does not establish server rejection or asynchronous recursion.

Only `src-tauri/src/account/worker.rs` changes. Both real child futures are heap-pinned before composition. The extracted join still cancels the shared stop on either error, waits for both children, and preserves content-error precedence. No detached task, early drop, timeout relaxation, or production thread-stack override is introduced. Final control/catalog/SDK close remains after the join.

The final-source regressions measure the real content/directory futures and worker type. The previous inline composition is measured without polling it, avoiding an intentional process-aborting overflow. Measured debug sizes: content 105,400 bytes; directory 1,488; old inline composition 213,904; pinned join 128; worker 10,608. The test enforces join <=4KiB and worker <=128KiB. These are compiler-specific measurements, not a promise of identical sizes on other targets.

A scoped 512KiB test thread polls the real paused content owner and directory owner through cancellation and drain, then enters the real cancelled worker poll and its normal cleanup. An absent runtime owner fences directory access before summary/token/HTTP; the already-cancelled worker fences coordinator HTTP. Synthetic private temp paths contain no real grant. This is an actual production-future poll test, not a live account test. The second regression covers either child failing, cancellation reaching the other child, and the join remaining pending until that child's explicitly delayed retirement is released.

## Results and retained failure

- Preliminary owner-layout/small-stack test: 1 passed. Its log predates the final full-worker poll extension and is labeled preliminary.
- Exact final-source `account::` group: **73 passed, 1 failed, 0 ignored**. Both new regressions passed, as did existing request cancellation, late admission and blocked-backend retirement cases.
- The existing enrollment fixture `real_store_activation_preserves_documents_and_restart_identity_and_allows_explicit_adoption` failed at its second-workspace preflight (`enrollment.rs:823`, `sync_adoption_blocked`). Its isolated rerun passed 1/1. The initial failure cause is not established, and the full group is not reported as green.
- Existing adoption group: **6 passed, 0 failed, 0 ignored**.

No source was changed after the final-source tests. No broader rerun was started. All raw command output, including the first failure and existing warnings, is retained. The synthetic blocking-action panic in the account log belongs to the passing panic/retirement regression.

Commands and exact environment are in `receipt.json`. Tests reused the sole shared target, offline/locked with jobs2, debug0 and incremental0. The 6GiB disk floor was monitored and not triggered. All owned Cargo processes exited and the target lease was released before archiving this receipt. No app, account login, original library, device, manifest, package, or live acceptance run was touched. Independent review and real-client acceptance remain pending.
