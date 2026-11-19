# settings121-backup 独立审查

2026-11-19。**纯模块结论：pass，附 B1/P3 nonblocking。未发现本次范围内 P1/P2 blocking。宿主集成尚未验收，不把端口契约当成实际多窗口屏障或原生调度成功。**

被测最终 HEAD：`3711132528e0f02ce7100c06789b476fa7d6ed0b`，不是早期 `185d76cc3ae95aa2ac61b916b55ce9d51b6ad787`。初次核对185d时有在途修改，未在该状态执行测试；开发者 follow-up freeze 提交后工作树干净，后续用户确认该 SHA 为最终冻结版本。所有测试在写本 review 前完成。提交只包含此文档，不修实现、不管理工作树、不推送。

## 契约与调用路径

先读本树 `agent.md`、主目录只读 `docs/architecture/settings121.md` 和 `docs/plan/tasks/settings121-backup.md`，以及两端 `local_backup/README.md`、`local-backup/README.md`。另核对 `docs/ui/data-management.md` 的归档合并语义、Session begin/acknowledge/finish 与 stage/export 约束。审查覆盖两次开发提交的全部模块文件、轻 harness 与浏览器脚本。

- 账户/Store/save queue 没有新增 owner。UI → `createLocalBackupClient` → 五个 `local_backup_*` command → `BackupRuntime` → checked `BackupPorts`；文件发布与保留归 files.rs，归档验证/Session提交归宿主。
- `commands.rs` 的 caller label 来自 WebviewWindow；expected 是期待值，不能作为授权证明。Scheduler 是 Rust enum，不是可由 JS 提交的 tick 命令。
- `BackupRuntime::restore`（`runtime.rs:479`）先消费一次性确认，核 window/session/library/target Store instance+generation+settings hash/目录/期限，再读取原文件并核 manifest/hash；传给最终宿主的是独立 owned bytes 与 `payload_sha256`。
- `RecoveryWriter::write` 只接受同 library 快照并经持久化发布后留下 receipt。模块可保证保护文件发布过程，**无法替宿主保证其快照采样发生在所有窗口 ACK 后、与实际 import 共用同一屏障**。
- `CommittedRestore` 与 `RestoreResult.outcome=committed` 保留提交事实；client 对 afterRestore/hydrate 失败返回 refreshError。UI 消费确认、显示已提交警告，只提供重新读取。普通归档/加密文件 IO 的运行能力不能由 typed host 声明推断。

## 发现

### B1 — P3 nonblocking：已有状态的后续读取失败，没有标明仍显示的是旧值

- 契约：agent 的“不可读为未知”，前端 README 的“Failed status is displayed as unknown”；旧快照可保留，但应明确当前读取未确认。
- 代码：`src/local-backup/LocalBackupSettings.tsx:181` 的 refresh catch 只 setError，不标记 status 过期；`:163` 附近 disabled 不包括状态读取故障。
- 复现：先成功配置6小时，再令下一次30秒 poll 的 host.status 拒绝。通过捕获该定时回调直接触发，无需等待真实30秒。
- 实际：错误文字正确显示，但6小时仍 aria-checked=true、正文仍描述自动备份运行条件，立即备份仍可用；没有“上次读取/未知/未确认”标识。证据为 `independent-browser-result.json` 的 status failure 断言（false）、`status-failed-with-prior-value.png`。
- 非阻塞原因：没有把失败转成默认关闭或覆盖持久状态，错误可见；实际写入/调度仍必须经 native 重新授权，不构成授权旁路。建议标注“显示上次状态，当前状态未确认”并决定故障时允许哪些动作。未修改实现。

## 精确运行结果

环境：Node22.16.0、pnpm10.15.0、Google Chrome157.0.8103.79；Rust离线/locked。产物目录 `/tmp/cybernote-settings121-backup-independent-20261119/`，保留脚本、日志、JSON和截图；没有覆盖作者 `/tmp/settings121-backup-ui/`。

| 完成检查 | 结果与证明范围 |
| --- | --- |
| `pnpm typecheck`、`pnpm version:check`、`git diff --check` | 全部 exit0，产品仍0.1.0。 |
| `CARGO_TARGET_DIR=<本目录>/target cargo test --offline --locked --manifest-path src-tauri/src/local_backup/harness/Cargo.toml` | **16/16 pass**，生产模块代码、临时目录与 controlled ports；日志 core.log。 |
| 同上 `--features real-store-proof local_backup_store` | **1/1 pass，221 filtered out**；实际生产 Store/Session/归档/附件，不运行其余应用测试；日志 real-store.log。 |
| 独立临时 Rust crate，仅引用冻结树生产模块，过滤 `independent::` | **6/6 pass，16 filtered out**；没有修改产品 tests。源码 rust/lib.rs、日志 independent-rust.log。 |
| 独立复跑 `src/local-backup/test-browser.mjs` | exit0；真实React+合成本地host、恢复确认/取消/焦点、提交后refresh警告不重复导入、private-only、晚picker/read、浅暗960/390截图；日志 author-browser.log。 |
| 新增 browser.mjs | **10项断言，9 pass、1 false（B1）**；脚本exit0表示完成收集，不代表全部断言通过。详情 independent-browser-result.json。 |

浏览器使用从 git 对象读取的固定 `Preferences.css`（UI实现 `e29a7d8c`，review提交c26e2a83未改它），快照为本目录 `shared-preferences-e29a7d8.css`。**未读取或运行 Mill 正在修改的 UI 工作树测试。** 共享样式的旧常规文字颜色问题已在 UI review 交开发者；本轮不将该旧共享样式重复记为备份模块阻塞。

独立 Rust 六项完成的负例：

1. 对合法文件分别改 manifest version、archiveBytes、sha256、scope、id、format，读取/list均拒绝并保留原始故障bytes；旧v1缺scope按 `currentBusinessProjection` 兼容。
2. 新建私有目录0700；持有目录lock时新发布返回backup_busy，所有已有版本原bytes保留，未清理旧版本。
3. 预览后把同文件替换成**另一份 manifest/checksum 全部合法**的归档，单独读文件可通过，但恢复拒绝backup_stale，import计数0，确认也已消费。不是只测坏checksum。
4. checked port 模拟同barrier的ACK→保护持久化→commit顺序；保护文件再次读出的是预导入业务bytes（与被恢复归档不同），并核传给port的payload hash。此项是**port fixture顺序证明**，不是实际多窗口宿主证明。
5. FIFO、symlink、父级跳转和非法路径名有界拒绝；外部目标bytes不变。作者测试另覆盖hardlink、目录被rename+symlink替换、foreign library/unrelated/corrupt文件和所有保留份数。
6. 实际Argon2id/AES-GCM编解码：错密码、标头/salt/nonce/末尾密文变更拒绝，无plaintext返回，测试目录条目不变、import计数0。没有可触真实Store的文件IO路径。

独立浏览器补证：

- host对象重建并等待其真实React commit后，旧picker返回不configure；新状态可继续读取，按钮不锁死。
- 旧host的在途备份回包不发布旧成功提示，busy释放；host重建会向**原prepared host** discard加密确认。
- blocked后才返回的加密预览被discard，无确认导入、无密码输入残留；错误密码被拒绝后输入清空、不调用confirmImport。
- 真实 `client.ts` + 本地Tauri invoke边界：native返回committed后afterRestore失败仍返回committed/refreshError，native import只调用一次；beforeOperation期间Token变更则下一操作不invoke。
- 320/390暗色无页面横向溢出，启用按钮触控高度≥44；零pageerror。host重建首轮探针曾在React提交前解析picker，属于测试排序错误，已加DOM owner marker等待提交后再测，最终上述两例通过，不把探针时序误判为产品缺陷。

## 文件与调度审查结论

`files.rs` 的逐组件 openat/O_NOFOLLOW、普通文件/uid/nlink校验、目录fd固定、0600 temp+flush+发布+目录fsync、unchanged config跳写及锁内再读符合模块声明。根路径与已有目录的实际应用归属/私密权限仍由宿主构造时保证；哈希是损坏检测，不是抵御文件系统owner恶意伪造的认证签名。

retention只在新版本发布并再次读验成功后执行，仅处理当前library已验证版本，强保留本轮新文件（时钟回退也不误删），通过隔离名rename后重读再删除；未知、损坏、foreign和未验证对象保留。损坏配置拒绝覆盖；关闭自动备份不删旧版。未注入真实断电/fsync故障或恶意进程逐指令竞争，不能把普通临时目录测试扩展为所有文件系统崩溃保证。

调度默认off，不触发export或Scheduler授权；开启后的每次tick经过checked authorize/export，忙时不并发，错误latch暂停，需显式授权配置更新解除。core测试覆盖录音/撤权/迟到export；这证明Runtime策略和端口调用，不能证明native timer已经安装、所有窗口权限已经检查或退出join已完成。

## 宿主必须满足的条件（非纯模块未接线阻塞）

1. 在两套invoke handler注册全部5命令，建立唯一native Runtime和应用生命周期timer，shutdown取消并join；每次使用实际calling window、Session Token、稳定library与所有recording/quit/access/archive owner授权，不接受renderer声称active/blocked作为授权，不自动刷新失败Token。
2. 实现全窗口正文和偏好排空/quiet capture，用 `Session::stage_archive` 取受检业务bytes后由备份owner发布。default备份目录可在app-private root/backups，普通export_archive的禁止覆盖活库规则必须保持；避免archiveRunning/quietHost互相拒绝造成自锁。
3. 实现**同一import barrier内**的恢复保护hook：所有participant ACK及所有权/Token/Store完整generation/settings指纹复验后采样，保护发布验证成功后才import。现有Session在pending时拒绝普通stage/export，需专用受检hook，不能先在屏障外导出或直接Store import绕过。
4. target fence必须包含Store instance、全部sync heads/inbox/tombstone/attachment等相关generation与设置hash，不能只用application_generation或Session epoch；最终commit门禁还要复验payload hash和原fence。真实Store定向测试**未覆盖此新增hook/完整同步历史保全**，必须由整合验收补证。
5. 恢复是**保留现有内容、碰撞副本、应用归档设置**，非原位时点回滚。manifest.scope正确限定当前业务投影，不能承诺保护全部历史heads/inbox；实际additive import要保留原同步冲突、墓碑和收件状态，不能重建同步表。模块私有配置和授权文件不进入归档，恢复不得启用后台任务。
6. 从DB commit开始保留committed receipt；maintenance/hydrate失败与IPC失联用现有operation/status核实，不猜未提交并自动再import。EncryptedArchiveHost也必须遵守committed返回契约。
7. 桌面选择/reveal目录用真实native能力并核路径归属；Android保持privateOnly，明确卸载删除私有备份，不伪装SAF tree支持。加密文件选择、bounded读取、认证、实际归档preview/不可变bytes绑定、限时一次确认、保护及Session commit均需functional host；密码只存瞬态，窗口关闭/取消需native清理staging。
8. 最终以实际App、原生WebKit/Android WebView、录音/多窗口竞争、目录权限与系统文件选择器验证。当前React fixture不是实际App wiring，也没有进行用户库、系统账户、安装包、全套Tauri或真实设备验收。

本轮没有修改实现、触真实笔记库/备份目录/账户凭据、启动用户CyberNote或发布产物。所有测试数据均新建于临时目录，浏览器服务与子进程在finally清理。建议B1后续收敛；本模块可交UI-host整合，最终宿主验收另审。
