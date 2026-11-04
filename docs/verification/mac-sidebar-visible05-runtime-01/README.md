# Mac sidebar build05 actual window acceptance

2026-11-04 root CUA actions. Product source 093986d170ef279fbce0f66e59891fd5f94aecad. Exact sealed executable SHA333b356ab62a0f0c55a8f67c9d7bc51bf424eb1f37dccdcb40f4b9b140bc7be7. Different-author artifact review mac-sidebar-independent05 passed before launch. This is finite interaction/geometry evidence, not whole-window pixel PASS.

## Actions and raw observations

- 00 old known-PID identity; 01 old AX/JPEG before normal quit. Old PID21092 exited (ps exit1/empty) after CUA super+q. CUA postquit AX reports App quit, expected.
- New exact sealed path launched through CUA; 02 known path process53305 and executable bytes/hash match.
- Initial blank body click2400,1300 failed windowNotFoundAtPosition and made no intended change. New actual window screenshot is2176x1320; original is2788x1806. 03 observation saves startup; its AX may be diff. The sidebar left origin and2x native top-control scale are comparable; whole canvases differ.
- 04 click blank1800,900, body focus. Visible side edge456px (228pt candidate); folder and toggle direct, black/gray, no common glass capsule.
- 05 top toggle index40 hides entire sidebar. 06 surviving toggle index26 restores folder column and selected QA-TYPE note.
- 07 visible menu shows 隐藏文件夹. Screenshot absent from CUA menu result; AX saved. Attempt to write undefined screenshot raised a type error; no image file claimed.
- 08 menu item hides sidebar. 09 menu now shows 显示文件夹. 10 item restores column.
- Drag456,950→416,950, immediate AX unchanged with transient footer selection. 11 blank-body click clears selection and settled screenshot shows side edge416px. Both native controls move with sidebar.
- Drag416,950→456,950, immediate AX unchanged/transient list selection. 12 blank-body click clears selection, width restored.
- 13 top toggle hides before normal super+q. Known PID53305 exited (ps exit1/empty). Exact same sealed app relaunched via CUA. 14 starts visible: hidden state is NOT persisted across cold start. 15 top hides;16 top restores and blank body click clears hover. This proves repeat toggle after cold launch only.
- 19 original direct button restores sidebar228/list360 after18; no data edits. 20 scoped exact-path process shows new PID57962 and same executable hash after cold launch.
- 17 original com.apple.Notes: same synthetic QA-TYPE selected, body focus blank1800,900; AX sidebar228/list360. 18 original toggle hides; body-focus blank click gives clean hidden reference. Original existing QA contents not edited.

Across recorded clone state transitions only UI layout actions were sent. No typing, deletion, reset, private database access or new audio export. AX body equality is a text-level check and cannot prove editor object/history identity or all persisted data. Image extension cua-image contains JPEG; derivatives must be labeled and cannot grant lossless pixel PASS.

## Current conclusion

Top direct restore and dynamic menu restore work in the exact new build, including repeat after normal restart. Sidebar controls follow228→208→228 widths. Independent geometric analysis is still in progress; remaining optical/surface offsets must not be reported as identical pixels.
