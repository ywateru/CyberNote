# Ordinary IME dismissal and join-panel gate — independent source PASS

Reviewed frozen25c5e65c vs0b1d9790. native-ui.mjs has only3insertions/1line change, SHA2565abac3ed0ad232988f7a669be45d85d294cf23ba39010cd728f599bd7778bc9b. All source outside pairViaUI is identical.

Two fixed stages perform the existing guarded read of actual IME state. Only mInputShown=true triggers ordinary system Back then250ms pause. The joining button is tapped once; now it must produce actual .sync-pair before filling the invitation. Existing exact visible input focus and final peer-present/no-pair check remain unchanged. No product edit, native mutation IPC, selector weakening or action retry is introduced. The unchanged guard enforces explicit owned5584/AVD/lifecycle identity for each call.

Necessary host cases exercise the actual function with fake guard/client: IMEfalse performs0Back, IMEtrue performs2Back across both fields, join/submit each occur once, and the join-panel observation precedes invitation fill. An injected join-panel wait failure stops before invitation with one joining tap and no retry. A synthetic invitation sentinel never appears in fixed stage labels. These mocks do not issue real guard commands or device operations. Original cycle10 actual joining failure is retained in final-actual-independent; this host admission does not convert it into native success.

Admission was sent immediately through /private/tmp/sync87-pair-keyboard-review-status.md and normal root/author messages, before this evidence commit. Root explicitly selected a new formal output fixture run on the same userdata, preserving all actual-01 state/notes/accidental XML and failures. Actual successful pairing/text/media/reconnect/restart/coldboot/provider/export results remain required.
