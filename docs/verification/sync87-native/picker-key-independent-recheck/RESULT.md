# Final 406c76f7 picker-key source/host admission: PASS

The two original `d034a85e` admission counterexamples are closed in final freeze `406c76f7`. This is admission of the bounded tool implementation, not proof that any device key, attachment selection or save/export has succeeded.

Only the two small guard/test fixes `33eaf7e0` and `406c76f7` were carried forward. Both reviewed files exactly match final author objects; hashes and local mappings are recorded in `source.json`. No separate admission was issued for the intermediate33e version.

| Host process | Natural exit | Wall seconds | Result |
| --- | --- | --- | --- |
| Same two counterexamples plus exact actual-dump positive | 0 | 0.032572167 | 3 pass |
| Author focused picker admission checks | 0 | 0.028811375 | 34 pass |

The independent recheck loads the original complete synthetic inputs from the preserved BLOCKED `result.json` rather than rewriting them. Both valid-u0 pair plus extra foreign-u10 Resumed and valid-u0 pair plus extra foreign-u10 Focus now refuse ENTER.

Final source counts every `mResumedActivity\s*:` and `mCurrentFocus\s*=` field line first, requiring exactly one of each. It then fullmatches strict hexadecimal record/window tokens, u0, exact allowed DocumentsUI PickActivity component and the required numeric task token. The unique resumed/focused components must match. Additional whitespace or malformed duplicate fields are counted and refused; component suffixes and trailing foreign tokens are refused by the full match. Six fixed navigation keys and the unchanged before/middle/after app identity guards remain in place.

The exact allowed read-only actual dump `/private/tmp/notes-sync87-native-actual-01/cycle06-foreground.txt` has SHA256 `71ab82a6e4b7b1f557fc10c2291565162c48681ae337ed58cbac09db83fe835a`. The final real helper accepts fixed ENTER as keycode66 on those exact bytes. This also resolves the earlier observation-source question: that actual activity dump includes both required fields. Only the two relevant field lines, the source path, byte count and hash are archived here; the full dump is not copied into the evidence.

The focused author checks cover the fixed key allowlist, invalid keys, foreign/mismatched/duplicate observations, mixed-user and malformed duplicate fields, and four strict activity-token suffix/trailing-token cases. The prior seven-check host mock established main-path identity sequencing; that unchanged branch and the old20 suite were not rerun.

Original BLOCKED evidence `e71ac34b` remains unchanged. This recheck ran zero ADB/device actions and no builds, main writes, invitations or user Store reads. No actual key was sent. Actual chooser navigation, file selection, attachment persistence and export remain separate open acceptance work.
