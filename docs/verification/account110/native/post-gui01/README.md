# Owned GUI handoff and normal cleanup

Product/package: `29c878108b2ea421b5e4fccd71547206071fdbfa` / `mac-29c87810-debug-01`, bundle ID `com.local.notesclone.account110.debug29c87810`. Every process used an explicit owned fresh-live03 `desktop-a` or `desktop-b` data directory. The default/original library was not opened. No login, transfer, rename-save or permission-change command was submitted by these external handoff/verification harnesses.

The approved full continuation result remains unchanged, SHA256 `246c0f624784e16797a9d27a871a9d5af2da482e9b3f8db099e7c6fa017a21ca`. This GUI follow-up is separate from that result and from the original failed fresh-live03.

## Human-observed GUI checks

The parent reported the following actual CUA observations after using the exact running owned package; these are human/GUI observations, not assertions produced by the command harness:

- A had 10 notes and online B had 9. Last note times remained `23:45:08` / `23:44:02`; offline rows hid current summaries.
- Rename modal initially focused Cancel; Escape returned focus to the rename button. No name was saved.
- Clicking online B opened the direction modal with Both selected. Clicking Push and keyboard Down selected Pull. Tab from Start wrapped to the first radio. Escape returned focus to B's row.
- Reopening reset the selection to Both; Cancel returned focus to B's row.
- Start Sync, Save Name and the permission switch were not activated.

## Exact process/evidence boundaries

1. `a01-initial-holder.json`: initial A reached native ready/account page, but the external launcher's stdin EOF ended its wait and caused immediate **normal close**. Its recorded status is `closed`, not a native failure or a successful GUI acceptance run. It was not kept for the parent's GUI work. This first receipt and script are preserved unchanged.
2. `a02-gui-holder.json`: A was normally reopened with a file-based close gate and kept for CUA. Its saved startup account snapshot (`paused`, zero directory rows) was taken before directory restoration; it is **not** the final GUI status.
3. `b01-gui-holder.json`: B was opened later while A remained running, reached account ready with A online, and was kept for the two-online-device CUA checks.
4. After the parent completed CUA, both holders received their fixed normal-close request. Both exited naturally with code 0, pipe close confirmed and no signal.
5. These holders had no status/state request control after handoff. Therefore the requested finite status and complete semantic check was performed in **separate normal same-owned reopens**, followed by normal close. This limitation was disclosed before those reopens; the report does not claim to have captured the original GUI processes' pre-close status.

## Post-GUI read-only normal-reopen check

`post-gui-reopen-verification.json` is PASS, SHA256 `5a46e5fd82fd43a74731992c83c6dc9973be31e576f7f42b20311cf890c82a1b`.

Both clients restored normally, reached ready with the other device online, and had no error or deviceOperation in every sampled status. The helper used only native ready, account status and app.state observations before normal driver shutdown; it submitted no synchronization action.

For each device, every current app.state note was hashed using the same canonical semantic representation as the full continuation (exclude only local revision). The sorted **complete** hash set exactly equalled that device's pinned final-restart verification entries, with no note IDs or bodies persisted:

| Device | Expected/current notes | Complete set equal | Attachment count observed |
| --- | --- | --- | --- |
| A | 10 / 10 | true | 20 |
| B | 9 / 9 | true | 18 |

The attachment counts here are observations; this follow-up did not repeat the full continuation's byte/read checks. Both verification instances then exited naturally with code 0, pipe close confirmed and no forced signal. All five instances across the initial handoff, actual GUI holders and final verification closed normally. No candidate process remained. Both owned libraries were preserved for subsequent manual use.

Main source was checked clean at the specified product revision before launch and after cleanup. The original failed fresh-live03 result and the successful continuation result were checked byte-unchanged after final verification. The source freeze may be released after this cleanup; no main commit or artifact mutation was performed here.

All archived JSON contains only finite status/booleans/counts/hashes/lifecycle and fixed owned artifact paths. No raw stderr, profile, IDs, note bodies, credentials or authorization URLs are saved. AuthClient performed its ordinary internal restore; these harnesses did not inspect or copy grant/Noise files. `SHA256SUMS` covers the exact receipts and external scripts, preserved separately from product source.
