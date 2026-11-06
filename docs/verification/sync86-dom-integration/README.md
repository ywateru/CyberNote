# APP-SYNC86 实际双 App DOM 与 Rust 同步整合

2026-11-06。**作者完整矩阵 PASS，等待独立复核。** 最终 `build11-formal03` 共 39 项检查（含 3 个 Rust 自然退出检查），外层 Node **自然 exit0 / 103.515550250s**，内部 102913ms。前端最终工具冻结 `b08c77289203691c30026ce673116721c5ca5a59`，运行前后 136 项输入 SHA256 均为 `6c50a195c5bbb65e18d23d94c5427a392bcb1ecf0129b16b01d70368629813b2`，git source clean。正式前两次失败保留，没有把已写业务报告冒称自然退出成功。

## 准确来源与运行范围

源码依次为基础设施 `3352b913149b827a61d66e961e9ae9ac8d5522a9`、浏览器 owned pipe 退出修正 `6d33147e466786fd897d6954fe69bee85068db18`、过期 conflict 查询观察修正 `b08c77289203691c30026ce673116721c5ca5a59`。这三个提交只实现/修正 `scripts/debug/runtime.mjs`、`rust-backend.mjs` 与 `sync-rust-dom.mjs`，没有改生产前端或 Rust。

后端 build product commit `cd334bc88513a89c490788d2e2e27c7967575f4a`，运行时 source HEAD `0feb310ddae132adb13652ba909b323a72280c3c` 含后续证据。47 项构建输入在启动前和退出后逐项匹配；immutable11 二进制 SHA256 为 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`。`backend-build11/` 保存原 build manifest、仅重指向不可变 binary.path 的派生 manifest 及 provenance，不混用 Cargo 可覆盖 target。运行另复制一份 owned binary 到外部输出。

实际两个 React/Tiptap App 页面，各自独立 Rust Session、SQLite、附件目录及 Noise/socket；实际本机事件从所有 response 单 sink 恰好一次投递，后台 poll 与 reply 按 requestId 严格关联。每个真实页面登记 main participant，退出前注销。没有 FakeBackend、伪 metadata、headless apply 或 JS merge。静态 bundle 仅为本测试显式启用 `DEV=true / VITE_NOTES_DEBUG=1 / NODE_ENV=development`，避免 dev HMR 的独立不稳定边界；它不是生产排除验证。

原始执行：

```sh
cd /private/tmp/apple-notes-sync86-dom
node scripts/debug/sync-rust-dom.mjs /private/tmp/sync86-transport-build11-dom-input /private/tmp/sync86-dom-build11-formal03 /private/tmp/apple-notes-sync86-adapter
```

输出目录必须 fresh，且在被监视源码树之外。实际外层命令/PID/完整 wall 见 `build11-formal03/process.json`，实际源指纹、进程/事件/调用/页面错误/数据库及逐项检查见 `result.json`。三份确切 runner 输入副本也在 `input-scripts/`。开发者只在本工作树写工具与证据，未写 main；前一轮误做 Android83 的 45 项不计入本任务。

## 最终进程与数据库

下列 Rust 和浏览器主进程均有实际自然 exit0/signal null，所有 pageErrors 为空，poll 已停止、pending=0。每个浏览器都记录 Context close、Browser disconnected、公开 BrowserServer.process() 的 actual exit、browser-server close；actual exit 后只销毁该 owned child 的 stdio，避免继承日志写端阻塞 close。没有扫描销毁全局 handles、杀 updater/crashpad 或强制退出来取得 PASS。

| 页面 | Rust PID | 浏览器 PID | cleanup ms |
| --- | --- | --- | --- |
| A | 24643 | 24746 | 314.933 |
| B | 24930 | 24959 | 296.063 |
| A-restart | 25594 | 25596 | 236.031 |

只有全部 owned Rust/browser 终止并确认 WAL 不存在或为 0 后，才使用 `mode=ro&immutable=1` 查询。两库 integrity=ok，inbox=0，dirty=0，读前后数据库 SHA 不变；完整 projection/head digest 见 result。

| 库 | notes | attachments | heads | projection | DB SHA256 |
| --- | --- | --- | --- | --- | --- |
| store-A | 13 | 4 | 17 | 15 | 7f5d4a12eec5809b7190bc83ff1860b73ee3f9418e56dfcf8cd69efcf5c5350f |
| store-B | 13 | 3 | 17 | 15 | 23de89a1235a3e787a95b6649b7c575a4a87ef52bc864ae7fb6b535aa2db404f |

附件行数 4/3 不混同已引用媒体收敛。补充只读 `attachment-inventory-readonly.json` 证明 A 多一条未被当前 note body 引用的本地录音 checkpoint；两端还共同保留另一条早期未引用 checkpoint。最终已引用图片/录音 ID、原字节及 peer bytes 均已断言一致。本轮不验证孤儿回收，也不声称全部本地附件行/文件应逐项相等。补充 inventory 首次错误假定 notes.document 列的失败保留在 `attachment-inventory-first-failure.txt`，随后按真实 notes.body 读取，未改数据库或产品。

## 原字节与 DOM 证据

`A-after-media.html/png`、`B-after-media.html/png` 是实际最后页面（A 图片所属笔记与 B 已锁定目标），截图已目视；不是插入时或录音动画的逐帧记录。邀请仅在内存传递，capture 前严格要求无 invitation 控件，日志不保存完整命令参数。

`exported-original.png` 为从实际预览保存链导出的 68 字节原 PNG，SHA256 `11f8a69f10d1f9296a6aa25c92b0b9b35d0b1fbc039211d59d2ffa55747a753f`。`synthetic-recording.wav` 为真实 RecordingPcm/保存/peer 读取得到的最终原始 77962 字节 WAV，SHA256 `6d6f0171787aacab0d11ba4db0e03d64d30293a49c9be9ba4a08bee4b450ac39`；浏览器 AudioContext 独立解码 duration1.6232916667s、末四分之一 tailPeak0.1250038594。另以 Python wave 只读确认 mono/16bit/24000Hz/38959frames/相同时长，见 `independent-wav-header.json`。音频来自显式 440Hz 合成设备，未使用真实麦克风。

`preservation.json` 列出每份保全文件的原绝对路径、字节数和 SHA256。未拷贝任何 `.sync` 私钥、原 SQLite 或整个合成存储目录；这些仅保留在 `/private/tmp`。

## 原始失败与修复链

| 原运行 | 原结果与精确边界 |
| --- | --- |
| exploratory01 | exit1，2 项为 Rust 清理检查；实际 UI 拒绝 port0，改为真实预留 loopback 端口。内部11612ms，原指纹4e7f36…，build07。 |
| exploratory02 | 旧开发态 18 项自然 exit0，105439ms；build07。覆盖早期 text/IME/chooser/image/restart，不含后来完整录音/导航矩阵。 |
| exploratory03 | 业务到图片/录音后清理挂起；强制 owned-resource 恢复并 exit1。最初 Vite 推断的纠正原文保留，无最终 source fingerprint，不补造。 |
| exploratory04 | exit1，8 项；原断言误假定本地冲突分支必须为 primary，另有 Vite client WebSocket error。改为检查真实 variants；23799ms，build08。 |
| exploratory05 | 静态模式业务继续通过，但清理仍挂起，排除了 Vite 是唯一原因；实际 Context closed / Browser disconnected 而 close API 确认未回。owned 恢复 exit1，无最终 source fingerprint，不当自然清理通过。 |
| cleanup-smoke02 | 两个静态真实 App runtime 的有界关闭自然 exit0，12679.874ms，仅清理定向证据。 |
| exploratory06 | 36 项业务/清理通过、3 Rust 自然0、pageErrors空；只读 SQLite mode=ro 证据错误导致原 exit1，76018ms，build08。退出后 immutable focused probe 证明两库 integrity ok/WAL0/SHA不变，仍不改写原 exit1。 |
| exploratory07 | build08 与已变更 store.rs 源哈希不匹配，启动前严格拒绝；没有启动 App/Rust，原 log 保留。 |
| build11-formal01 | 3352 冻结完整 39 项、result.failure=null，但外层因浏览器继承 stderr 不自然退出。owned inspector 先有两次失败；实际 Vite 依赖 esbuild.stop 只移除 esbuild，未移除同一 pipe，明确纠正早期 esbuild 推断。exact fd peer 对应 crashpad/updater，未杀它们，随后其自行退出；人为设 exitCode1 保留清理失败，外层386.965044125s。 |
| build11-formal02 | 6d331 冻结自然 exit1/57.549359458s；两个真实 Chrome/Rust 正常退出，cleanup813/678ms，WAL0/只读通过。旧 runner 把合法 sync_plan_stale 变成 false，再读 false?.variants.length，原 TypeError 保留。 |
| build11-formal03 | b08c 冻结完整39项自然exit0/103.515550250s。仅 conflict 查询白名单 sync_plan_stale 重读；不重发任何已提交 resolve，不弱化双版本/owner/去重断言，其它错误立即失败。 |

`history/transport-selfcheck01` 使用明确合成协议可执行体，仅证明 requestId 乱序关联/事件一次投递/同步 sink 失败拒绝当前和 pending；首个固定45ms启动等待失败保留，sink-negative 的 SIGTERM 是预期负例，不是真实 App/Rust 业务证明。`history/frozen-default-notes01` 是3352之后默认 fixture 的9项；最终 `final-default-notes01` 在 b08c 上再次9项自然 exit0/13.777574208s、pageErrors空，仅证明默认 runtime 兼容，不计作真实 Rust 矩阵。

## 最终 39 项

1. Two real App pages pair over authenticated sockets and retain both preexisting SQLite records
2. Actual folder forms, smart query, note creation and pin project to peer DOM and Store
3. Reverse actual Tiptap edit converges through independent Rust sockets
4. Unrelated remote metadata preserves actual editor DOM, editor identity and focus
5. Unrelated network apply preserves actual local Undo history
6. Real target prepare freezes and waits for actual local pending save ACK
7. Pending local body and remote version both survive prepare flush
8. Actual HTML search waits for terminal abort despite a lost first receipt
9. Latest HTML search draft remains visible while original owner stays frozen
10. Actual retained abort receipt releases navigation to its final draft query
11. Terminal abort does not steal deliberate HTML search focus
12. Real same-owner navigation abort restores same DOM, selection and editor focus
13. Actual CDP IME and TagComposition keep owner update in real durable inbox
14. Actual IME final transaction saves without a forced composition end
15. Both concurrent text heads survive naturally settled local composition
16. Actual FileChooser retains captured owner while remote update waits durably
17. Actual confirmed keep-all retains image branch and concurrent remote text copy
18. Actual chooser/FileReader/journal/body ACK stores one original image reference
19. Actual Rust attachment read preserves original image bytes
20. Actual remote App and SQLite expose same original immutable image bytes after resolution
21. Actual image preview save uses Rust original-byte export
22. Actual desktop checkpoint ACK retains full recording ticket owner
23. Actual unrelated lock/delete advance global authority without invalidating recording owner
24. Actual recording rebinds trusted global epoch and checkpoints again to original owner
25. Full ticket remains protected after final journal/body ACK before actual release
26. Only actual Rust local release ACK ends original recording protection
27. Recorded original bytes persist outside SQLite and independently decode with nonzero late samples
28. Actual remote audio bytes equal final saved original recording
29. Selected target remote lock never restores stale editable DOM after release
30. Actual Session rejects pre-lock token after target authority changes
31. Actual Rust IPC rejects unknown reply fields on a retained terminal operation
32. Actual Session rejects foreign expected Session without restoring target editor
33. A owned process exited naturally
34. Same-directory new Rust process preserves paused state and device identity
35. New App and Session restore actual body and original attachment bytes
36. Paused local dirty survives restart and converges after actual resume
37. Real delivered event chain contains probe, prepare and terminal commit
38. B owned process exited naturally
39. A-restart owned process exited naturally

## 验收范围

这是显式隔离合成数据的真实 App DOM/Session/Store/Noise 本机整合作者证明，仍需不同 agent 独审与根的准确主线组合。浏览器 chooser、录音设备、dialog/clipboard、窗口/原生边界可模拟；未验证 Android provider、系统输入法、真实硬件麦克风、LAN/公网、物理设备或原版 Apple 全窗口像素一致。原 Android/AVD/未保存录音、用户库和苹果备忘录均未操作。
