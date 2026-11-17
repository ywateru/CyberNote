# E116 最终命令交付增量独审

归档说明：下文保留独立审查原报告正文。原报告中的“本 /tmp 目录”及裸文件名指原始证据位置，不指当前docs目录。可追溯的本批入口为[原报告](../../../artifacts/releases/20261117-project-evolution/business-verification/independent/review.md)、[机器结果](../../../artifacts/releases/20261117-project-evolution/business-verification/independent/results.json)、[来源摘要](../../../artifacts/releases/20261117-project-evolution/business-verification/independent/sources.json)和[SHA回执](../../../artifacts/releases/20261117-project-evolution/business-verification/independent/sha256-receipt.json)；未将原始私有配置、凭据或完整RPC复制到Git。

**结论：本轮命令交付 PASS；UI 验收 USER_MANUAL_PENDING，未授予整体原生 UI PASS。命令范围无新增 P1/P2 blocking。**

按用户最新授权，UI 测试由用户接手，未执行 native 项不再作为本轮命令交付阻塞。已经观察的原生问题仍准确保留：**P2：320dp 列表更多菜单打开时，单次系统 Back 令产品 EXIT_SELF/status0，未只关闭菜单。** 这不是命令层失败，也不因交接手测而变为通过。

只读离线复核；未执行产品/模块测试、构建、MCP 新调用、UI/设备/adb 动作，未读取 credential、private data/runtime。主树源码与文档未修改。所有新增报告/脚本只在本 `/tmp` 目录。最终包身份和既有模块/单测结论沿用此前归档，本轮未重核大包或重跑大组。

## 证据继承及新增差量

继承 `/tmp/evolve116-final-mcp-independent-vz1c2xqo/review.md`、`results.json`、`supplement-results.json` 的 90 次真实 Codex 调用及 **360+12** 离线断言，不重新解析执行全部旧场景/备份重算。旧 RPC 文件只核 SHA 保持，均与先前来源清单一致。另继承随后对 C 作者 08:43 正式报告的 11 项只读交叉核对。

本轮从作者 `final-mcp/rpc-call-inventory.json` 找出 **6 份新日志、17 次新增实际调用**，逐条按请求 id 和真实参数/结果对照原 RPC，核 text JSON == structuredContent。每份新日志仍是 Codex CLI 0.167.0。与原 90 合并为 **107 次 / 9 工具，87 个正常响应、20 个预期工具拒绝**，与作者 inventory 完全相符。20 个 isError 包含授权、冲突、busy、边界拒绝，不是 20 个产品失败。

| 命令/数据契约 | 本轮或继承结果 | 证据与准确边界 |
|---|---|---|
| 查询/读取/创建/追加/更新、CAS、幂等/operation | DONE / PASS，继承前轮 | 原真实 90 调用、20k 节点边界、原回执重放、CAS 单胜、active-editor busy、重启 version 连续性均已独核。本轮不重新发调用。 |
| 撤销、scope/目录负例、off→重启→resume | DONE / PASS，继承前轮 | 撤销 A 不可凭旧 key/operation 绕过；B scope/目录受限；有效 B off 时 HOST_UNAVAILABLE、恢复可用，A 仍 UNAUTHORIZED。 |
| 锁定排除 | DONE / PASS，新增 9 调用 | `locked-note/before.json` 中自建 note 可搜索/读；`locked.json` 中 search 为空、list 排除目标，read/append 均 NOT_FOUND；真实移除锁后 `removed.json` 搜索/读取恢复为原正文，不含失败 append 标记。 |
| session unlock 与移除锁区别 | DONE / PASS，保留探针失败 | `unlocked.json` 原始失败断言把本地会话解锁误认为 remove-lock；实际 search 仍为空，正确保护数据。第二次真实 remove-lock 后才恢复。此错误不改写成产品失败，也不抹除原记录。 |
| create-only 最小回执/查询授权 | DONE / PASS，新增 8 调用的一部分 | `local-pause/c/rpc.jsonl` capabilities 仅 `notes:create`。create、同参同 key 重放、自己的 get_operation 回执严格相同，字段仅 committed/committedRevision/committedVersion/noteId/operationId/warnings；notes_read 返回 FORBIDDEN，无需为回执强加 read scope。 |
| 同步暂停期间本地可用 | DONE / PASS | A UI 停止 transport 后，真实本地 Agent create/read/append/read 完整正文/version 正确；随后 B UI 也停止，再原生创建本地正文。Agent 接入与同步 transport 没有被混为同一开关。 |
| 暂停采样 | DONE / PASS，有限观察 | `local-pause-state.json` 的 B 保存 1794877020104→B 未传播观察 1794877119727，差值精确 **99.623s**；B 完整列表仍无 A 新笔记。A 观察亦无 B 新笔记，距 B 保存 **59.179s**。不宣称双向均连续监控 99.623s，也不推导无限期无传播。 |
| 暂停后普通重启 | DONE / PASS | `B-pause-restart-process.json`：菜单正常退出、43932→81134、同 data/runtime；`B-paused-restarted-body.ax.txt` 原本地完整正文保持，sync AX 仍“已停止/继续同步”，未出现 A 新笔记。没有访问 data/runtime。 |
| 恢复与双向正文收敛 | DONE / PASS，A/B 范围 | UI 恢复后 A 打开 B 的完整 `LOCAL-NATIVE-B-SAVE-WHILE-SYNC-STOPPED`；B 打开 A 的 create+append 全文，AX 与两张原始截图一致。`B-resumed-sync.ax.txt` 只是 no-change AX，**不单独拿它证明 connected**；结论依赖动作 timeline、实际新正文和截图。没有新增 C paused-note 全文已核或全库结构导出结论。 |
| Agent→A/B/C 正文/13字段/refs/PNG | DONE / PASS，继承前轮 | 三端公开产品备份与 frozen document、13 共享字段、6 附件字段一致，PNG 与原 fixture 逐字节等，3167B/SHA9257…；C 公共 guest/host 文件 789837B/SHA579b62…一致，SAF Save 1 次。最新 C 作者报告已交叉通过，不重复重算。 |
| 原 frozen PNG note 不再写 | DONE / PASS，限本次记录 | 17 条新增调用的写目标均非原 frozen note；它作为历史冻结快照保留。暂停阶段另建 canary，不将新笔记写入旧 frozen 比较。 |

调用逐项位置在 `delta-rpc-index.json`，记录真实 requestLine/responseLine/id；仅保存脱敏索引，不复制 grant-ref 配置或 credential。作者最终 staged summary 保存在 `final-summary-snapshot.json`。本轮不验证其稍后执行的进程/映射清理。

## Planck 最新原生补项：只核现有证据，交接用户手测

已直接向 Planck 请求路径，并收到原始动作范围/文件确认，未要求继续测试。统一 Android 根目录（下称 C run）：

`/Users/water/work/2026/Apple-Notes-Clone/artifacts/project-evolution/android-isolated-20261116T203629Z-dc8cf7db/release-native-20261116T225616Z-ec67e8`

原始 `native-qa-actions.jsonl` 此次复核快照为 325 行。以下 DONE 仅限记录的场景；生产内部 Editor 对象、PM composing span、ACK 未直接观测不新建产品 P2。

| native 项 | 现有证据的准确状态 | 原始位置 |
|---|---|---|
| 准确 release APK、一次 join、真实 Trime、冷开保持 | DONE / 有限 PASS，继承前轮 | 已独核 owned API36/Trime，产品 WebView 内屏幕键 nihao→你好，保存冷启和原配对保持。系统 EditText 准备与实体 Samsung/WeType 历史证据独立，不扩大为 Mac 真 IME。 |
| 两组五档字号 | DONE / 当前表面 PASS | 动作74–107、112–153；`font-ui-five-contact.png`、`font-editor-five-contact.png` 可见画廊/正文五档实际变化，末档单列可见。不是每个 DOM 字号的生产 computed px 数值证明。 |
| 三主题×浅深色，列表/画廊 | DONE / 当前表面 PASS | 动作154–229；六组原图/`theme-six-list-contact.png` 与切换轨迹一致。不是全部 portal/access/录音原生表面的穷举通过。 |
| FORMAT102 | DONE / 当前限定链 PASS | 动作249–262；machine `format102-current-release.json` 与六图一致：格式面板→800ms 原生长按 Beta，面板保持；X 关闭保留 Beta 选区；原生 Q 只替换 Beta；Undo 恢复 Beta；Back 隐藏 IME、正文保留。保留历史 r2 失败，未定位旧根因。 |
| 横屏、IME/Back、恢复竖屏 | DONE / 限定场景 PASS | 动作272–288；系统 `ROTATION_90/1920×1080`、格式面板/Beta 选区保持、IME 出现和 Back 隐藏、portrait restored 截图可核。**此处没有音频 owner 结论。** |
| 320dp 原生触达 | PARTIAL DONE / 由用户继续手测 | 系统640×1280/320dpi、w320dp，原生点中列表更多菜单；单列侧滑三动作可见；双列画廊及更多/长按菜单可见。不把320dp当DOM320CSS/44CSS；既有DOM与native触达允许分层，不因release不可观测新增debug要求。 |
| 双列无遮罩横滑仲裁 | 未证，交用户手测 | `narrow-gallery-no-card-swipe.png` **仍显示弹出菜单**，不能证明无遮挡的卡片横滑不触发侧滑。它不是额外产品失败；更大范围手势竞争本就未完成。 |
| 表格 | PARTIAL DONE | 动作289–298、`table-insert-result.png` 显示2×2插入及单元格输入记录；边缘返回与横滚竞争未完成。`narrow-table-ready.png` 实际是画廊，不能按文件名认定表格验收。 |
| 分屏；saved-audio 移动控件/owner 横屏与分屏 | 未执行，交用户手测 | 无通过证据；没有“工具不支持分屏”的实测结论。受控 synthetic tone/owner 链仍属于其原受控范围，不冒充最终 Mic/TCC 采集。用户已明确本轮不测实际 Mic/TCC。 |
| 边缘返回与表格横滚/选字/速绘手势竞争 | 未完成，交用户手测 | 不用FORMAT102长按成功替代完整手势仲裁。未执行项不阻塞当前命令交付。 |
| C 新增 paused-note 全文 | 未完成，非本轮新门槛 | C 窄屏画廊显示 PAUSED-A/B 标题与部分正文摘要，未逐篇打开核全文。核心 frozen Agent 三端公开备份链的 PASS 保持，A/B暂停完整正文收敛已证。 |

## 保留的实际原生产品失败

**P2 / NATIVE-BACK-01，用户手测/修复跟踪；不阻塞本轮命令交付，不能签 native UI 全 PASS。**

触发链为 C run `native-qa-actions.jsonl:307` 点更多、`:308` 菜单截图、`:309` 执行 `shell input keyevent 4`。当时 `narrow-list-more-menu.png` 完整显示弹出菜单；`narrow-after-back-exitinfo.txt:6` 起记录 **2026-11-17 08:59:51.864 / PID8488 / EXIT_SELF / status0**。之后 `narrow-after-back-process.txt` 为空、实际截图为 Launcher。`narrow-menu-back-recovery.json` 记录仅正常启动一次至PID18196，无清数据、重装、重配。

这违反 `docs/ui/adaptive-presentation.md:81` 的 Back 最内层弹层优先约定。**只有一次现场观察，尚未重复复现或定位；不称崩溃、不声称丢内容。** 最小后续建议：用户在同安装包、菜单开/关各一次 Back 手测，若确认，检查导航对 card-action popup 的 Back 消费与原生 finish 回退的衔接。这里只给排查接缝，未认定源码根因、未改实现。

## 工具失败及非阻塞历史问题

- Mac `locked-note/unlocked.json` 的 session-unlock/remove-lock 误判、首次 off 断言对 revoked A 错期待 HOST_UNAVAILABLE，均保留原始结果，属于探针预期错误。
- B resume 首次使用旧 AX80，invalid element ID，实际动作未执行；刷新完整 AX 后才实际点击成功。没有把失败点击当 resume 证据。
- 邀请 sender 的早期 getuid ReferenceError、当地 ACK 记录丢失、Android helper 的 TARGET/INSTRUMENT_NOT_READY/VERIFY_FAILED 依此前报告保留；真实 receiver0、产品一次正常 join 及后续正文/冷开/公开备份是分层业务证据。未捏造 helper CLEARED 或 raw ACK。
- Android session 的 productApkInstalled 已纠正为 true，原初始记录保存在 `session-result-initial-preflight-preserved.json`，不抹除原 flag。
- 所选新增 native action 记录的命令退出码均0；这**不等于 UI 行为全成功**，上述 Back 仍然是实测产品失败。
- 同步时间1970秒/毫秒显示问题沿用此前 baseline 非阻塞 backlog，未重开新门槛。

## 实际执行与归档

`python3 /tmp/evolve116-final-independent-wzbm6n3r/verify_delta.py`：**exit0，143/143 离线证据断言通过**，17新增/107累计调用、6新增日志、99.623s采样间隔准确。脚本只解析本地 JSON/AX/日志和来源摘要；没有运行作者探针/产品测试。首次输出按旧gate为BLOCKED；随后用户明确UI交接，**仅更新结论作用域为COMMAND_DELIVERY_PASS，断言/原始证据不变，不伪称消除了native失败**。

- 机器结果：`results.json`（命令PASS、UI用户手测、P2原生单次失败、未执行列表、保留工具失败）。
- 来源摘要：`sources.json`；新增RPC行号：`delta-rpc-index.json`；native动作索引：`android-action-index.json`。
- 独立查看既有字体/主题/FORMAT102原始联系图，及本/tmp生成的 `rotation.jpg`、`narrow.jpg`、`pause.jpg`，未触UI控制接口。
- 起止 `git rev-parse HEAD` 均 `96f518ee8d174da10c132f009d1bb5f4dc3d5d2c`，`git status --porcelain=v1` 均为空。详见 initial-state/final-state.json。

最终签署范围是**已核命令与数据契约交付 PASS，UI 用户接手；无整体 native UI PASS、无新增单测运行或已修复原生问题声明。**
