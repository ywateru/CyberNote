# Settings121 有界设计 / 集成独立审查

日期：2026-11-19。角色：独立验证者。结论：**blocked**，存在 4 项 P1、4 项 P2 契约阻塞；AGENTS 核对 **pass**。本结论针对下列契约与基线的可集成性，不是对尚未提交模块实现的缺陷判定，也不等待模块完成。

**后续决定追补**：用户已明确云 / Store 身份分离及跨既有 workspace 合并。本页末尾的“云身份分离策略追补”更新 D1 的判断：该策略在现有 Store 上有可运行的适配路径，策略可行性 **pass**；直接传递异 workspace WireVersion 仍不可行。原表为初审冻结点记录，不把新决定或 Cloud 尚在调整的代码继续算成已发现缺陷。host barrier / generation / media 的实际接线仍待独立验收。

## 审查冻结点与范围

- 工作树：`/Users/water/work/2026/.cybernote-worktrees/settings121-review`，分支 `codex/settings121-review`。
- 审查输入 HEAD：`5634fc7e06b58d2a53a62e8be73aef672df131cd`。
- 产品基线：`f4cc23082a1e013940480b83de32877eb3bce8b0`。已比较 baseline→HEAD 全部差异，12 个路径均为 `docs/` 或 `AGENTS.md`，产品代码与该 baseline 相同。下文行号均指审查输入 HEAD。
- 已读 `agent.md`、`docs/architecture/settings121.md`、`docs/plan/settings121.md`、`docs/verification/settings121/README.md`；补读现有同步、CyberBus 迁移、模块所有权、构建交付、偏好设置、数据管理及桌面/手机录音契约，追查实际调用符号。旧 `account-sync.md` 的协调服务描述已被 CyberBus 迁移契约及生产 `account/` 替代，不拿旧服务方案作新云端身份依据。
- 只读产品代码，只在自己的树新增此报告；未访问其他开发树、主目录的实现、真实库、凭据、云服务或正在运行的安装包。未做 UI 审查、重型 Rust 构建或全套测试。
- 下列 integration 测试是**需要补充的验收条件，均未在本次运行**。负责模块先定协议/端口，integrate 负责生产装配与真实 Session/Store 集成；不能以独立模块 mock 通过关闭这些项。

| ID | 优先级 | 属性 | 结果 | 阻塞的交付边界 |
| --- | --- | --- | --- | --- |
| D1 | P1 | blocking | blocked | 云端稳定身份、版本合并与已有 CyberBus 资料库并存 |
| D2 | P1 | blocking | blocked | 云端 / 自动备份共享保存 barrier 与原生宿主端口 |
| D3 | P1 | blocking | blocked | 版本恢复、预览确认及恢复前保护副本的精确定义 |
| D4 | P1 | blocking | blocked | 更新安装的退出授权、保存确认和替换时序 |
| D5 | P2 | blocking | blocked | 稳定 / 预发布比较及包内已安装发布身份 |
| D6 | P2 | blocking | blocked | Android 当前 unsigned 发布资产的安装能力声明 |
| D7 | P2 | blocking | blocked | 可移植设置的选择、合并及本机调度设置保留 |
| D8 | P2 | blocking | blocked | 自动备份目录与 Android 可持久访问能力 |

## D1 — 云端身份约束已写明，但还没有可执行的版本 / 身份映射契约

**P1 / blocking / blocked**

设计位置：`docs/architecture/settings121.md:31,38–43`；`docs/verification/settings121/README.md:20`。这些位置正确禁止替换账户 workspace 和反复导入复制，但未选定云端 envelope、版本所有者、cloud library 与现有 sync workspace 的映射、跨账户采用后的处理方式。

源码证据：

- `account/enrollment.rs:20` 的 `workspace()` 只从 SDK 已验证的 issuer/subject/product 派生账户 workspace；`account/mod.rs:1070` 的 `bind_session()` 与 `private::Binding` 固定 workspace/device/Noise key，`account/mod.rs:598` 的 `Command::SetEnabled` 经账户 owner 进入 adoption。
- `store/synchronization/schema.rs:331` 的 `Store::sync_enable_with_device()` 对已有 workspace/device 不同返回 mismatch；`Store::sync_adopt_workspace()`（同文件 `223`）是迁移，不是云端导入：通过预检后会重建同步表和基线，并轮换 Store instance。云端不能调用它来消除 workspace mismatch。
- `Store::sync_receive()`（`store/synchronization.rs:658`）按本库 workspace 验证版本；`WireVersion` 的摘要/向量与 workspace 和实体关联。简单替换 wire.workspace 字符串不构成合法映射。
- `store/archive.rs:147` 的 `Archive` 只有 folders/notes/attachments/settings/blobs，没有 heads、seen、inbox、向量或 purge 墓碑；`Store::prepare_archive()`（`617`）遇 ID 碰撞建立副本，`commit_archive()`（`816`）插入实体。现有回归 `valid_import_restores_settings_hierarchy_bytes_and_preserves_colliding_entities`（`store/archive/tests.rs:97`）明确要求重复导入新增副本。它不能承担同步合并。

真实触发 / 后果：A/B 已各自启用 CyberBus，账户 workspace 不同，却用相同自选云资料库；或匿名云同步后登录并显式采用账户 workspace。直接复用 Store sync 会 mismatch；通过 adopt 或改 wire 身份“修好”会破坏现有因果历史；通过 archive 导入会持续复制。只携带当前投影又会丢失另一冲突分支或永久删除知识。

必须补充：由 cloud 与 integrate 固定一种可落地协议：要么拥有独立且持久的 cloud library/entity/version 映射，通过唯一 Store 的事务端口合并；要么明确如何在不改账户身份、摘要含义和隔离规则的前提下桥接已有版本。列明首次绑定、两端独有内容、同 ID 并发、删除/恢复、冲突附件、重新绑定 provider、账户 A→B adoption 后的语义；明确云冲突经哪个查询/解决端口出现在账户展开区，不能假定既有 `sync_conflicts()` 会自动看到独立云分支。

应补 integration 测试：两个临时真实 Store，各带不同已存在的账户同步身份、独有笔记及同 ID 并发版本；用本地 HTTP 条件写 fixture 同步，反复双向同步并重开。证明 entity ID/数量稳定、并发 heads 与附件原字节可取回、purge 不被旧端复活、账户 Binding/workspace/device/Noise identity 不变。再覆盖匿名→账户 adoption 与账户 A→B 后云旧响应迟到，证明按确定规则保留/拒绝，不能重标记旧授权或默默发布旧账户历史。

## D2 — “复用保存屏障”不是现有 export 命令天然具备的能力

**P1 / blocking / blocked**

设计位置：`settings121.md:38,40,43,47`，实施计划 `docs/plan/settings121.md:16` 说自动任务受同一边界控制，但没有确定 export/snapshot、自动触发、apply 分别使用的宿主协议。

源码证据：

- `src/App.tsx:2177` 的 `archive()` 只由当前 React 窗口检查录音、`windowWrites.cancel()`、`flush()`，再调用 bridge；`flush()`（`1059`）等待正文 queues，不等同于 `settingsOwner.flush()`，也不排空其他窗口。
- `lib.rs:810` 的 `export_archive()` → `Session::export_archive()`（`session.rs:146`）只检查 Token/pending 后导出当前已持久数据，没有发送全窗口保存请求；`stage_archive()`（`session.rs:205`）也只有访问检查。`Session::check_core()`（`89`）检查 session/epoch，不是正文 revision/CAS。
- `Session::requires_barrier()`（`382`）包含 importArchive，不包含 export。import 走 `lib.rs:483` 的 `mutate_with_stage()` → begin/notes-access/ACK/finish，`notes-access prepare`（`App.tsx:1873`）会遮罩并 suspend 录音，不宜每轮后台云同步复用。
- 实际无破坏 apply 是 `Session::sync_begin/reply/tick()`（`session/synchronization.rs:565,598,736`）与 `Store::sync_plan_apply/sync_apply_plan()`（`store/synchronization.rs:794,805`）：probe 保护 IME/附件/录音，prepare 排空，最后重验 intents/plan/generation/Store instance。`App.tsx:1070` 的 `quietHost` 还会在 archiveRunning 时拒绝 probe，机械地套用 archiveRunning+quiet 会自阻塞。

真实触发 / 后果：原生自动任务直接调用受检 export 端口，可在另一窗口未提交正文、偏好尚未确认、或录音尚在内存时报告“备份/同步成功”；只校验 Token 后应用下载快照，也不能证明下载期间没有新正文。同一模块内的单操作锁不能协调账户 sync、MCP、手动导入和另一窗口。

必须补充：先定有类型的唯一宿主端口及初始化 owner，区分快照捕获与远端提交；定义全窗口已确认保存范围、设置 flush、录音的推迟策略、busy/timeout/cancel/retry 结果。网络等待前释放 Session；apply 沿 quiet 或等价受检协议，最终门内验证原库 instance、配置代次、内容版本和 live participants。快照导出若只保证已持久数据，必须明示范围，不能称全部活动草稿已备份。固定 notes-access/notes-sync/metadata/commit receipt 的发布责任，不另起保存队列或 Store。

应补 integration 测试：两个合成文档窗口连接同一 Session，B 有受控延迟保存，A 发立即/自动备份或云任务；偏好 owner 亦延迟提交，B 同时含录音/OCR/附件或 IME。断言等待/推迟及状态真实，最终备份内容包含已承诺正文与设置，不强停活动录音。延迟 GET 后在窗口保存、MCP 写入、切换配置或更换同 Session 的 Store，再放行下载，断言旧计划拒绝或重建且无覆盖；窗口 ACK/网络失败后释放门禁，可重试且不死锁、不重复提交。

## D3 — 版本“恢复”与现有 additive import 的差异及保护副本范围未定

**P1 / blocking / blocked**

设计位置：`settings121.md:40,47,49`；验证清单 `README.md:21–24`。旧 `docs/ui/data-management.md` 的“备份语义与验收”已经明确普通导入是合并、冲突建副本并应用设置；本轮新增版本恢复不能让用户把该行为理解为原位回退，也不能在未声明新事务语义时改成覆盖。

源码证据：`Store::prepare_archive()`（`store/archive.rs:657`）保留原实体并映射副本；`commit_archive()`（`883`）整体替换 settings、轮换 application incarnation、删除 application_operations，成功后清 keys。`application/tests.rs:926` 的 `logical_archive_restore_rotates_incarnation_and_excludes_agent_state` 明确旧 MCP context 不再可用。归档只捕获当前业务投影（`archive_bytes():745`），不包括现存冲突 heads、未应用 inbox 和 purge 墓碑。`Session::begin()`（`session.rs:477`）preflight 读取路径，`finish()`（`579`）重新读取；现有 preflight 也不返回可确认的数量/差异。新增 UI 预览不能仅保存同一字符串路径。

真实触发 / 后果：备份 N 后编辑并删除一篇，再“恢复 N”，沿 import 会新增副本并保留后续内容，无法得到用户期待的时点状态；若改覆盖，只以旧归档保护当前库，可能无法恢复未投影的冲突/待应用内容。预览后文件或版本清单变化，确认会导入另一份内容。恢复已提交但刷新失败时无事务收据又重试，会再生成副本；MCP 宿主若未维护则保留已失效 incarnation。

必须补充：版本恢复明确沿用“合并为副本”还是增加受控替换，预览逐项说明保留/新增/覆盖/设置变化及 MCP 影响。预览绑定已验证的不可变 payload、hash、version ID、目标库身份和内容代次；确认时重验或重新预览。定义恢复前保护版本的内容范围、完成并验证后才允许提交；如果承诺完整回滚，现有 archive 不足时要保全现有同步派生状态，或在此类库明确拒绝 destructive restore。保护版本不得被本轮 retention 清掉。保留原 import 的附件 journal、维护暂停（`lib.rs:510` 的 `AgentState::pause()`）、提交收据和提交后恢复语义。

应补 integration 测试：临时真实 Store 造正文/智能目录/图片/录音/设置，备份后编辑、删除并生成冲突与 inbox，再执行所选恢复模式；检查真实结果与预览一致、当前内容保护版本可恢复、冲突/附件不失。预览后替换文件、retention 删除目标或修改库，必须拒绝旧确认。注入保护版本失败、附件发布前/SQLite commit 前后中断、提交后刷新失败；重开证明无半引用，已提交操作不会因重试再次复制，MCP 旧 context 拒绝且新宿主按明确策略恢复。

## D4 — 更新退出不能只调用现有 app.exit/restart 或等待其返回

**P1 / blocking / blocked**

设计位置：`settings121.md:55,57`，验证清单 `README.md:27`；整合任务仅写“更新退出保护”，没有成功退出到包替换之间的授权/交接协议。

源码证据：

- `lib.rs:1301` 的 ExitRequested 先调用 `recording_window::exit_requested()`，再交 `account::Runtime::exit_requested()`；`recording_window.rs:901` 在 registry 无 entries/local/quit 时直接放行，**不会**广播正文保存。这意味着“没有录音但有未确认正文”的更新退出不能依赖现有录音 guard。
- 有录音时，`notes-recording-quit`（`App.tsx:1670`）封新写入、等待全窗 sealed、final 音频保存、settings/body flush，再 `recording_quit_ack()`；失败/45 秒超时取消。ACK 只属于该 quit ID，`may_exit()`（`recording_window.rs:720`）满足条件才允许再发 `app.exit(0)`。
- `account::Runtime::exit_requested()`（`account/mod.rs:982`）还会 prevent_exit，异步停止 network/Bus，成功后再 exit。`lib.rs:1280` 的 Exit 才关 Agent/media/sync。退出请求已发出不表示进程已退出，更不表示允许外部 helper 此刻替换包。

真实触发 / 后果：更新只复用 app.exit，可丢无录音时的排队正文；下载后立即启动替换 helper，再请求退出，可能在保存失败取消退出、账户仍关闭中或 MCP 写入时替换运行中的包。若换包失败后直接重启，用户也可能运行错版本且旧包无法回滚。

必须补充：integrate 拥有一个更新安装事务/代次，所有文档窗口无论有无录音都参加保存与设置确认，禁止新写入并停/取消/收齐云端与备份作业、MCP 和账户传输。明确复用既有录音最终保存的方式、取消后恢复准入、退出失败不换包。macOS 安装端须持有已验证 staging 与目标身份，只有原进程确已退出且本次交接有效才能替换；记录备份旧 bundle、失败回滚、显式重启的状态，不能把退出 API 返回当成功回执。

应补 integration 测试：无录音但 B 窗口 dirty/IME/settings 未提交；有跨笔记录音且末块/正文 ACK 延迟或失败；参与窗口增删、旧 ACK 迟到、账户 stop 失败及云任务尚在跑。用假退出器和临时 `.app` 安装目标捕获顺序，断言所有保存成功及原进程结束前零替换；取消/超时恢复编辑且旧交接不可重放。临时包替换/重启失败验证回滚。最终真实 macOS 退出/重启另验，不能由 fixture 推断。

## D5 — 现有包内身份无法区分同版本 preview.N 的先后

**P2 / blocking / blocked**

设计位置：`settings121.md:53`（版本源 package/Rust、stable/preview、新于当前、禁止降级），验证清单 `README.md:25`。

源码证据：`scripts/build-info.mjs:68` 的 `packageVersion()` 仅接受稳定三段，`createBuildInfo()`（`92`）及 `src/build-info.ts:2` 的 `BuildInfo` 没有 installed release tag/channel/sequence。`.github/workflows/packages.yml:159–171` 却允许 `v$version-<suffix>`，按连字符设 prerelease；`agent.md` 的 preview 流程也沿用此规则。`stage-packages.py:273` 的 receipt 不额外记录 release tag。Android `require_android_release_manifest()`（同文件 `144`）校验由三段版本推得的 versionCode，不区分同版本的 preview 序列。

真实触发 / 后果：装自 `v0.1.0-preview.1` 的包报告 `0.1.0`，候选 `v0.1.0-preview.2` 若按 semver 与它比会被判断更旧；若只比较包版本又是相等。反过来用发布时间或“允许同版本安装”会容许从较新 preview/稳定包退回旧产物；sourceRevision/fingerprint 本身没有版本先后含义。

必须补充：保留 package 三段版本为产品版本源，同时明确可比较且包内可验证的发行身份/策略；或要求每次可升级产物递增产品版本并明确旧同版本预览包无法自动判序。稳定/预发布切换、未知发行身份、重复 tag/同版本不同构建均需固定处理；不能仅在 updater 的内存里记住上次看到的 tag。Android 安装版本规则与此同步说明。

应补 integration 测试：按真实 workflow 形状生成 feed、receipt、包内 BuildInfo fixture，覆盖 preview.1→preview.2、preview→stable、stable 拒绝旧 preview、同 tag 异 hash、同 version 多 source、无发行 tag 的旧安装包、重启后比较；通过实际 updater 客户端/命令核验选择。不能只测孤立 semver 库。

## D6 — unsigned APK 无法满足当前“打开已验证安装包”的可安装承诺

**P2 / blocking / blocked**，仅阻塞 Android 安装能力验收，不阻塞检查 / 下载能力独立交付。

设计位置：`settings121.md:55` 已正确声明 Actions APK 未签名和不能绕签名，但尚未定义面对当前唯一发布资产时安装入口的实际结果。

源码证据：`.github/workflows/packages.yml:124–137,175` 发布 `CyberNote-android-arm64-unsigned.apk` 并明言 distributor signing required；`stage-packages.py:110` 的 `require_unsigned_apk()` 主动拒绝签名材料，`main():249–265` 复制这个 unsigned APK 再计算 receipt/checksum。系统安装器并非只检查“签名不匹配”：无签名 APK 自身也不可正常安装。重新签名会改变发布的字节/hash，不再是已验证的同一资产。

真实触发 / 后果：把下载及 SHA 通过显示为“可以安装”并交包安装器，当前官方包仍然装不上；要求用户卸载旧应用再安装 unsigned APK 既不能解决 unsigned，又危及库数据。

必须补充：本轮若不改变发布签名边界，Android 对 unsigned 资产只能明确呈现下载/分发状态及“无法安装：发布包未签名”，不显示成功安装或要求卸载。若要实现可用安装，则需另立已授权发行签名流程与匹配已安装证书的产物，本次审查不授权改 release 工作流或代签；安装器交接与真正安装完成须是不同状态。

应补 integration 测试：将当前真实资产名称/receipt/signingBoundary 送入 updater 选择→下载→安装入口；unsigned 在无系统副作用时明确拒绝安装。另用 synthetic verifier/installer 覆盖可验证签名包、证书不匹配、用户取消、系统拒绝，后两者不得报成功，也不得删除应用数据。Android 实包/系统验收单列。

## D7 — “可移植设置”尚无字段集合和并发合并责任

**P2 / blocking / blocked**

设计位置：`settings121.md:36,38,47,49`。既要同步可移植设置、又不能携带本机路径/凭据，且导入导出要保留设置，但没有给出与现有本地设置的边界和默认合并规则。

源码证据：`Store::archive_bytes()`（`store/archive.rs:768`）读整行 settings；`validate_settings()`（`417`）校验部分已知键，允许其他键；`commit_archive()`（`883`）整体替换。`merge_settings()`（`384`）是现有局部更新入口。既有 `docs/architecture/sync.md`“版本/删除与 Wire 模型”和 `archive.rs:293` 明确外观/选择/窗口等本机设置不进入设备 wire；既有 wire 也没有 settings 实体。不能把整行 archive.settings 当成现成的可移植同步 DTO。

真实触发 / 后果：A 的 selectedNote、桌面呈现、默认开关或将来写入 settings 的备份目录在 B 被整体覆盖；旧备份缺少新字段时恢复会清掉当前显式 false/自动任务配置。如果 credentials 留在私有文件，单靠这一点仍不能防止导出本机路径或恢复后意外启用任务。

必须补充：唯一字段/版本契约分别规定 cloud portable settings、用户手工归档 settings 和本机私有模块配置；已知字段采用/合并、缺省保持、显式 false/空值、未知旧字段以及并发设置修改的规则。明确导入后任务开关是否保持当前选择，路径及凭据永不由远端恢复，避免把恢复过程变成自动上传授权。可选择本轮不支持某类设置同步，但须收窄设计及 UI 说明，不能 silently drop。

应补 integration 测试：两个真实 Store 用不同主题/桌面布局/选中项/备份路径/自动开关，包含 false 与旧版缺字段归档；经过真实 snapshot/apply/restore 端口验证白名单、缺省保留和冲突策略。检查序列化密文解密后的 DTO 无本机路径/授权字段；恢复不产生未经选择的任务或跨端覆盖本机开关，失败保留 confirmed settings。

## D8 — 自动备份的默认目录与持久目录访问不能直接等同于现有文件选择器

**P2 / blocking / blocked**，阻塞未定目标目录的平台自动备份能力。

设计位置：`settings121.md:47,49` 与验证清单 `README.md:22–24`，要求文件夹、版本列表、定时备份，未固定默认目录、平台目录能力及重启后访问失效结果。

源码证据：`Store::export_archive()`（`store/archive.rs:793`）调用 `validate_export_target()`（`store/data_management.rs:346`），拒绝整个应用 root 内的目标。因此将默认目录简单设成 app_data/backups，再调用原 export_archive，会必然失败；不能为此放宽普通用户导出对活库的保护。Android `lib.rs:815,839` 只处理单个 `content://` 文档的读写；`NotesScanPlugin.kt:77` 的 `copyDocument()` 也是已选单文档 ContentResolver 流，没有目录授权持久化、列目录、新建版本或 retention 删除端口。它不等于可重启的备份文件夹能力。

真实触发 / 后果：界面选定文件夹后，自动任务第一次或重启后无权创建文件，版本列表/保留规则接不通；用一次 save dialog URI 作为“文件夹”也不能创建下一个版本。若自动目录放入 root，沿现有 export 会被保护性拒绝。

必须补充：定型每平台默认目标和 capability。应用私有目录可经 `stage_archive()` 捕获后由备份 owner 管理自己的版本，但不能绕开唯一 Session 的快照规则；外部目录需定义桌面路径与 Android SAF tree 持久授权、创建/枚举/读写/删除适配及丢权处理。若本轮 Android 只支持私有目录，UI 必须明确且不提供无实现的外部文件夹动作；单文件导入导出继续沿原选择器。

应补 integration 测试：临时 app root + 外部目录使用真实 host 捕获与备份发布，证明默认可写、普通 export 仍拒绝覆盖 root、retention 只删受管版本。Android 用平台 adapter fixture 覆盖 tree grant 保留/重启恢复、撤权、provider 创建/flush/close 失败、列目录失败、删除失败，不把 unknown 当空版本列表。原生 SAF 证据另验；路径 fixture 不替代。

## 非阻塞核对与实际完成的证据

| 检查 | 属性 | 结果 | 已完成的证据与边界 |
| --- | --- | --- | --- |
| AGENTS 无参考项目内容 | non-blocking | pass | 全文人工阅读及大小写无关匹配 `magpie`、`refs/`、`参考项目`、`reference project`、HTTP(S) URL 均无命中。SHA-256：`7fe0a0d23896b14047a66f0a600dfc5404a31c33596c8b9788cbc0cecbec6752`。仅检查 `AGENTS.md`；未把设计中获准的视觉参考描述算成违规。 |
| 发布资产格式 | non-blocking | pass | 源码核对实际为 macOS arm64 `.zip`（ditto keepParent/sequesterRsrc 的 `CyberNote.app`）和 Android arm64 `-unsigned.apk`，各附 notices.zip、schema=1 JSON receipt、两行 SHA256 文件，共 8 资产；不是 Tauri updater 的 `.tar.gz/.sig/latest.json` feed。updater 应读该格式，不要求发布不存在的格式。 |
| 包身份 / staging 既有针对性回归 | non-blocking | pass | 在审查输入 HEAD 执行 `node --test scripts/publish/package-identity.test.mjs scripts/publish/stage-packages.test.mjs`：9 pass / 0 fail / 0 skip。合成 Git、plist/ZIP/ELF/AXML 与临时目录；没有联网或读取真实笔记/Keychain。证明既有 staging 规则，不证明新 updater 或可安装性。 |
| 产品基线一致 / 工作边界 | non-blocking | pass | baseline→审查输入仅 12 项文档/AGENTS 变化；审查前工作树干净。本报告独立提交，产品代码无修改。 |

本次没有新增 P3 产品阻塞；没有把样式偏好、常规凭据安全要求或模块尚未提交本身列为缺陷。

未运行：新云/备份/updater 的 integration 测试（本轮只审设计及 baseline）、Rust/前端全套检查、组合 build/typecheck、真实 React 截图、真实 WebDAV/S3/GitHub 服务、macOS 换包/重启、Android 签名安装/SAF 与实体设备。没有声称这些边界 pass。

## 解阻与下一轮复用

先由对应模块与 integrate 在 owning design/模块端口处补齐 D1–D8 的决定，再按本报告测试场景做真实宿主验证；每个事实只保留一个责任文档，其余任务/回执链接过去。D6 可通过明确限定 Android 本轮只检查/下载、禁用 unsigned 安装解阻相应声明；D8 可通过真实可用的私有备份目录与明确平台能力范围解阻，均不要求擅改发行或系统权限。

本报告无需等待模块实现，后续 UI / 整合审查可引用 ID，按确切提交与完成证据逐项关闭。模块单测、命令注册存在、浏览器 mock、生产构建和原生验收分别记录，不相互替代。在补齐协议和上述关键集成证据前，整体设计 / 集成闸门保持 **blocked**。

## 云身份分离策略追补（同日，用户明确决定后）

### 输入与结论

用户授权只读主目录最新未提交设计。实际读取 `/Users/water/work/2026/Apple-Notes-Clone/docs/architecture/settings121.md:39`，整文件 SHA-256 为 `68fb5cec4a5e741adf62cd9b72623f5b533f2d2a04ab5f5fd3b52a2edc7508ba`。该行明确：云 logical workspace/config 绑定与 Store 本机/账户 sync identity 分开，两者不要求 UUID 相同；显式 cloud join 允许两个不同既有 Store workspace 合并，各自身份保留。没有修改该文件，也未读取 Cloud 开发者正在调整的实现。

本次产品源码仍为 `f4cc23082a1e013940480b83de32877eb3bce8b0`，探针运行前审查树 HEAD 为 `526b281ff1a7c85609f67f41d682f023f2abcc6e`。**策略可行性 pass；原样跨 workspace 调用 sync_receive blocked；host 整合未验收。** D1 中“身份映射需要选择”的决策部分已经得到明确方向，不再要求两者相等，也不以既有 Store workspace 不同作为 cloud join 拒绝条件。

### 现有 Wire / Store 可以复用，但需要本机可信的确定性翻译

一个已验证可行的候选适配是以下函数（探针代码，不代表 Cloud 实现已经采用）：

```text
T_target(v):
  先验证 v 原始 envelope / digest 与云 envelope、配置、确认票据绑定
  保持 version / kind / entityId / vector / payload 不变
  将工作副本 workspaceId 置为目标命名空间，重新 seal() 计算 digest

Store A 的 W_A → 云规范空间 C → Store B 的 W_B
回传同一版本：T_C(T_W_B(T_C(v))) == T_C(v)
```

若云侧使用 WireVersion，C 也需满足其 UUID 格式；云外层 config ID 无需等于 C 或任一 Store ID。另一种外层 envelope 保留源 workspace 的协议也可以，但必须同样定义源版本验证、本机翻译与云端幂等标识；不能把“放松 rows/validate 的相等判断”当作完整适配。

关键原因和约束：

1. `WireVersion::computed_digest()`（`sync/model.rs:173`）包含 workspaceId；`validation::validate()`（`store/synchronization/validation.rs:174`）在验证原 digest 后要求 wire.workspace 等于本 Store workspace。**仅改字段不 reseal 必然失败；放宽 workspace 校验却存原 digest 也不可行。** `heads()` / `sync_version()`（`synchronization.rs:65,396`）重建 wire 时用本 Store workspace，届时将得到 workspace 与 digest 不匹配的版本；同实体同向量的 `sync_seen` 唯一约束也会把不同空间摘要判为 equivocation。
2. 正确翻译只产生传输 / 本机接收版本的摘要，不调用 `sync_adopt_workspace()`，不改 `sync_identity`、device、Noise、账户 Binding 或 grant。原始未通过验证的数据不能靠 reseal“修复”。入口必须同时验证独立云身份和当前 Store 身份，不能接受 renderer 任意指定 target workspace。
3. 向量 actor/counter 与 payload 必须逐项保持，普通云下载不能重新分配 actor、增加 counter 或用本机 revision/时间戳重造版本；否则无法保证重传不生成新版本。若需要稳定 actor/实体映射处理独立来源的碰撞，那是另一个持久协议，必须可逆 / 幂等并在确认前完成，不能每轮随机改 ID。现有同 `(kind,id,vector)` 异内容仍须拒绝，不能当普通并发合并。
4. blob hash 不包含 workspace，无需改附件 hash。附件 ID 是 immutable descriptor 的全库键（`validation.rs:217,242`）；同 attachment ID 的 owner/metadata/hash 不同，仍返回 `sync_attachment_conflict`。跨 workspace 本身不触犯此不变量，真实碰撞却不能靠“允许云 join”放行。64 actor、32 heads、收件箱和媒体预算继续适用，超过限制可明确拒绝该数据批，而非因 workspace 不同拒绝策略。

### 已运行的最小真实源码探针

执行：`python3 docs/plan/reviews/settings121-cloud-identity-probe.py`。runner 在自己的私有临时目录生成 lean Cargo binary，复用现有 `application/harness` 的 Cargo.toml/Cargo.lock，`cargo run --offline --locked` 直接引用本审查树生产 Store/Session/model/application 源码。未复制或改写生产算法，未编译 Tauri / 账户网络，临时目录和所有合成库在结束后删除。

| 场景 | 结果 | 证明范围 |
| --- | --- | --- |
| 原始 W_A wire 直接到 W_B；只改 workspace 不改 digest | pass（按预期拒绝） | 分别得到 `sync_workspace_mismatch` 和 envelope digest 无效 |
| W_A→C→W_B 重新 seal，并回到 C | pass | 向量 / payload 不变，云规范 wire 可往返相等 |
| 两个独有正文库，8 轮双向翻译接收 / headless apply | pass | 两端各 2 个原实体，无 ID 重建或无限副本；各自 workspace/device 重开后不变 |
| purge 后重投递旧版本 | pass | 目标 Store 不复活笔记，删除知识保留 |
| 同 ID 两个不可比较的 heads | pass（反例被证实） | 两端都保留 2 heads，但可见选中分支可不同，见下一节 |
| 同向量异内容 | pass（按预期拒绝） | 正确 reseal 也不能绕过 `sync_equivocation` |
| 只增加 inbox，没有业务投影 | pass | application_generation 不变，旧 VerifiedMedia 仍被完整 sync generation 拒绝 |
| receipt_only scope 用来 apply 含附件版本 | pass（按预期拒绝） | `sync_plan_stale`，没有业务笔记投影；重新准备完整 media scope 后 apply 成功、原字节相等 |
| prepare 后正文写入；媒体已验证后同路径文件改变 | pass（按预期拒绝） | 旧 apply plan / VerifiedMedia 均 `sync_plan_stale` |

三组探针全部完成、退出码 0。headless `sync_apply_pending()` 仅用于证明 Store 核心行为，**不证明生产窗口 barrier、Cloud 模块、HTTP CAS、账户 owner / grant 运行或设备验收通过**。

### 一个必须明确的现有不变量：冲突投影排序随命名空间变化

`projection::selected()`（`store/synchronization/projection.rs:17`）按 `(墓碑/删除优先级, digest)` 选可见 head。相同两条逻辑版本在 W_A 与 W_B 重新 seal 后，摘要排序可能反转。探针用生产 digest 搜索有界反例，并经两端真实 `sync_receive()` / `sync_apply_pending()` 证实：heads 均保留，A/B 的 note.title 却不同。

这**不否定身份分离和无损合并**，也不是版本丢失；但若要求异 workspace 两端“同一冲突集合自动投影同一正文”，则仅做 translate+reseal 无法兑现。必须选定云规范版本的稳定投影键 / 映射并与 Store 投影协作，或明确保留两端各自投影且要求显式解决后收敛。不能用写一个同时支配所有 heads 的合成版本来假装统一选择，那等于未经用户同意解决冲突。按原 `docs/architecture/sync.md` 的确定投影目标，这个跨空间例外或适配须写入 owning contract；不应默默称两个不同可见正文“已经一致”。此项为 **P2 / blocking（若承诺相同自动投影）/ blocked**，待协议决定；不是 Cloud 未提交代码的缺陷判定。

### host 必须补齐 / 复用的检查和事务边界

| 位置 | 必须检查 / 动作 | 为什么不能省略 |
| --- | --- | --- |
| 操作 / 预览 / 确认票据 | 独立的 cloud library ID、config revision/取消代次、provider/对象/密码配置绑定、远端 ETag/SHA、已确认 payload hash，以及原 Session Token、Store instance、Store sync workspace/device | Store generation 不含云配置。配置 A→B→A 不能复活旧票据；仅检查当前字符串相等不够。此 fence 必须与收件及最终 apply 的准入线性化，不能检查后释放配置准入再提交。 |
| 下载 / 解密后、进入共享 sync_inbox **之前** | 重验上述 cloud fence 与目标库身份，先验证源 wire 再翻译至当前原 Store workspace；失败不 enqueue，不 adopt | 现有 `sync_inbox` 是所有传输共用的 durable queue，没有 cloud config/source 标签。先 enqueue 再做 join 确认，会使原有 P2P coordinator 有机会提前 apply。 |
| 收件 media 准备 | 短 Session gate 取 `sync_media_snapshot(translated_incoming,false)`，锁外 verify/capture；回门重验原 Token、instance、cloud fence，安装 `sync_begin_media()`，仅一次 `sync_receive()`，然后结束 scope | 可借鉴 `sync/adapter.rs:46` 的 `prepared_store_rechecked()` 和 `StoreBackend::receive_head():349`。receipt 用 `.receipt_only()`，不在 Session 锁内下载、完整 hash/copy；durable 不等于 applied。 |
| post-receive → apply | 另建最新完整 media snapshot / verify / scope，再驱动共享 `sync_begin/reply/tick` 的 probe→prepare→commit；云作业不依赖 CyberBus/P2P active 才驱动 | receive 改 inbox/frontiers/attachments 后旧 generation 已失效；receipt_only 没有 live attachment publication 的 staged capability。`sync/adapter.rs:1434` 的自动开始条件带 `self.active`，独立云存储不能仅等待该 P2P 分支，也不能绕 barrier 直调 headless apply。 |
| prepare 与最终 gate | 验证 exact operation、Session/epoch、Store instance、live participants、ACK、未完成 intents；protected notes 延后；比较完整 `SyncApplyPlan` 和重算目标闭包 / generation；同时检查 cloud fence | `session/synchronization.rs:736,846–878` 已有窗口与计划检查，但没有 cloud fence。若复用会被通用 coordinator 推进的 Quiet operation，必须让它也携带/检查同一 fence 或采用明确的自有 commit purpose；只在 cloud 命令最终返回前检查无效。 |
| 版本 generation | 使用 Store 的完整 sync generation / opaque plan，不用 `application_generation`、workspace UUID 或 UI metadata sequence 替代；若还应用 portable settings，另对 settings 做版本/值 CAS | `synchronization.rs:743` 涵盖 instance、业务行、dirty、heads、projection、inbox、frontiers、branches、actors、identity/counter、descriptor、seen；application generation 不观察只收件变化。二者都未包含云配置，完整 sync generation 也未包含 settings。 |
| apply 事务和媒体终验 | 复用 `sync_apply_plan()` 事务内 generation/actual plan 比较、capture=0→投影→删已应用 inbox→capture=1；保留 VerifiedMedia 的目录、持有 FD、inode/size/mtime/ctime、已验证 blob、staged 文件校验及失败清理；经 Session `apply_store` 产生事实/访问变化 | 不能直接 SQL patch 后另补 dirty/outbox，也不能为缺媒体凭据回退锁内 hash/copy。收件和 apply 是**两笔**事务；apply 失败时 durable inbox 可保留，不能报告全部回滚或已应用。 |

原 `prepared_store_rechecked()` 的 bounded retry 仅重复 prepare，不重复可能已提交的业务事务；云端适配同样需遵守。generation 因 receive、flush 或 prepare 中最终窗口保存发生变化时，应基于当前状态重建作用域/计划，而不是删掉检查。

另有一个必须规定的 lifetime 边界：已经通过有效 join / fence 提交到共享 inbox 的版本，在云作业随后关闭/取消时是否仍作为“已接受本机版本”继续 apply。现有 schema `sync_inbox(digest,wire)`（`schema.rs:13`）无来源或配置代次，不能按 cloud config 安全撤销，同时通用计划会选择所有 eligible inbox。若要求“关闭后连已收但未应用的本轮内容也绝不应用”，需要来源隔离 / operation 专属 quarantine 或等价事务能力；仅在 Cloud DTO 加 generation 字段接不通该保证。若采用“收件是接受点，关闭阻止新收件，已接受内容按既有安全屏障恢复”的语义，应明确展示 durable 与 applied，避免超额承诺。

### 下一步最小 integration 验收（本次未运行）

1. 两个不同既有账户 Store、各自 P2P 既有版本与冲突，真实云 fixture join 后 A→C→B→C→A；证明原账户/Noise/grant 不变，head/墓碑/附件不丢、无重复，显式解决后传播收敛。补上上述投影反例，核验选择的协议语义。
2. 云下载 / media verify / quiet prepare 期间受控插入窗口保存、MCP 写入、P2P 收件及 workspace adoption（包括 A→B→A），逐一核验原 fence、完整 generation、instance、窗口目标和媒体凭据拒绝旧提交。媒体全量处理期间普通 Session 读写仍能完成。
3. 云 enabled 且 CyberBus 退出或 P2P inactive，单独驱动 quiet 保存/媒体 apply；录音、IME、附件操作不被强关，受保护目标延后，其他可应用项走同一事务/事件路径。
4. 在共享 inbox 提交前后切 config / 关闭云 / 取消：通用 P2P coordinator 并行 tick，证明 join 前零入队；已收后的恢复/阻止按已选 lifetime 语义执行。插入半批 receive 或 commit 后回包失败，重启重试不冒称回滚、不重复业务提交。

这次追补关闭“身份必须相同所以策略不可行”的疑问；不会把 Store 探针通过外推为 host 已整合，也不把开发者未完成的 `store_port.rows/validate` 当成 review 产物。
