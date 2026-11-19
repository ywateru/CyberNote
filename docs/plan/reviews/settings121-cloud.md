# Settings121 Cloud 独立实现审查

日期：2026-11-19。角色：独立 verify；未开发本模块。被审产品源码冻结于
`189b348e66e1d9db02c0d796e5671ea3c3d15e1c`，分支 `codex/settings121-cloud`。
本次只新增此报告，不修改实现、测试脚本、锁文件、AGENTS 或其他工作树。
没有运行完整 Tauri、真实云账户、用户资料库或发布。

**结论：blocked。** 发现 1 项 P1、4 项 P2 blocking，以及 1 项 P3
nonblocking。HTTP/CAS/加密/版本桥接和多数配置失效边界通过本轮模块检查；
不能以这些通过项关闭下列实际实现问题，也不能据此宣布生产窗口/保存屏障
或 notes+settings 同事务已经接通。Host 尚未接 App 本身不列为模块新 stub 缺陷。

| ID | 优先级 | 闸门 | 状态 | 结果 |
| --- | --- | --- | --- | --- |
| C1 | P1 | blocking | blocked | Lease gate 内复验再次取读锁，与配置 Save 的写锁形成死锁 |
| C2 | P2 | blocking | blocked | theme/view 只写旧投影，未更新实际 appearance/presentation 所有者 |
| C3 | P2 | blocking | blocked | SettingsPort 缺失 control singleton 仍被接受，捕获静默停止 |
| C4 | P2 | blocking | blocked | 原生确认 Promise 失败无人接住，且确认阶段没有操作互斥 |
| C5 | P2 | blocking | blocked | active 重进时旧 inFlight 标记使已启用按钮静默失效 |
| C6 | P3 | nonblocking | open | UI 未说明实际 32/48/16 MiB 预算，超限反馈过于笼统 |

## 审查输入

已读本树 `agent.md`、Cloud 双 README，以及主树目标/任务和设计审查
D1/D2/D7（含身份分离追补）。读取时 SHA-256：

- 主树 `docs/architecture/settings121.md`：`c3b76de75ae491f0eeb993ec832b9e985a1e2904a7edc6b8d8ac182ecaf96d7d`。
- 主树 `docs/plan/tasks/settings121-cloud.md`：`cfefdb9a25774e2aa44489ba80d2f1d710a7928cd2811ae90833433ed3a6a3e8`。
- review 树 `docs/plan/reviews/settings121-design.md`：`3f594dae00bed87c5287bf233f66a7f945c4dbd3257459bb410c132fd1c048cc`。

调用链：`CloudSyncSettings` → `cloud_sync_command` → `CloudRuntime::command`
→ 受检 read/decrypt/preview ticket → re-read revision+hash → inspect/capture
→ merge/validate/protect → 远端 CAS PUT → Host commit → Store 收件/quiet apply
→ CommitReport/UI。设置私有状态和便携因果设置是两个 owner，不把前者塞入云包。

## C1 — 最终 lease gate 不能再次调用会取锁的绑定检查

**P1 / blocking / blocked**

位置：`src-tauri/src/cloud_sync/runtime.rs:38` 的 `check_workspace()`、`:45`
的 `binding()` 都经 `check()` → `enter()` 再取同一 `RwLock` 读锁；`:53`
是实际取锁点，`:244` 的 Save 持有 state 后等待 epoch 写锁。实际提供的
headless Host 在 `engine_tests.rs:170` 先 `lease.enter()`，随后又调用
`lease.check_workspace(w)`；README 又要求最终短 gate 内复验完整 binding。

独立复现用合法 CloudHost capture：先持有 `lease.enter()`，通知并发 Save
开始，再在同一最终 gate 里调用 `lease.binding()`。macOS 当前 std RwLock
会让已等待的写者优先，第二次读等待 Save，Save 等第一次读释放，形成环。
日志停在：

```text
GATE first lease guard acquired
GATE Save requested
GATE calling binding under final lease gate while Save writer waits
```

有界独立子进程（包括 Cargo 编译）8 秒不返回，已终止整个进程组。
对照使用相同捕获路径，只把 Save 改成纯 Status，出现
`GATE nested lease read returned` 并正常结束。不是 HTTP 延迟或 Store 慢查询。
外层 Tokio timeout 不能打断正在运行的 blocking 闭包/同步锁；错误处理还需
state 锁，不能依赖其恢复。

需要让 final gate 的检查不递归取 lease 读锁，例如先取得不可变 fence 的
副本、再一次性 enter 后复验 host 事实，或提供携带 fence 的已进入 guard。
明确禁止在持 guard 期间调用 `binding/check_workspace/check/enter`，修正
现有测试 Host 的嵌套调用，并加 Save 并发队列回归。这里不是说每个 Host
都会死锁，而是当前 API/示例允许并使用了会卡死的合法次序。

## C2 — 便携设置必须通过既有字段所有者投影

**P2 / blocking / blocked**

位置：`src-tauri/src/cloud_sync/settings_port.rs:267`–`:279` 直接
`b[key]=value` 后更新整个 settings body。产品所有者在
`store/archive.rs:374`、`:384`，界面在 `src/themes/appearance.ts:31` 与
`src/presentation/model.ts:33`：存在 appearance/presentation 时，旧
`theme/view` 只是派生投影。

独立真实路径：`Store::open(temp)` → 真实 `Store::action(settings)` 创建
`appearance={themeId:ocean,schemePreference:light}` 及现有 presentation →
在同一真实 SQLite 文件事务中 install/capture Cloud settings → 对 theme
和 view 的因果后继调用生产 `settings_port::apply`。观察：

```text
raw theme="dark"   appearance.schemePreference="light"
raw view="gallery" presentation.desktop.collectionView="list"
```

UI 因而仍显示 light/list。随后通过生产 Store 普通 settings 动作只改
`groupDates=false`，`merge_settings` 重新投影 light/list；Cloud triggers
又把这个派生回写标为本机新版本，capture 将 light/list 向外传播。即远端
成功值在本机没有生效，还可被下一次无关设置保存覆盖并反向同步。

测试没有代用 settings schema：使用真实 Store 初始化/动作和真实
notes.sqlite3，额外 test connection 仅用于把生产 SettingsPort 接在该
数据库事务上；不声称这已经证明最终 notes+settings quiet 同事务。

修复应只更新便携字段对应的实际 owner（保留 themeId、设备 navigation/
density/mobile 选择等本机字段），复用既有设置业务规则/投影并保持云版本
和 settings 写入同事务。回归需同时读真实 frontend 所有者值和下一轮
capture；只断言 JSON 中 theme/view 两个旧键不够。对应设计 D7。

## C3 — 完整 schema 不代表捕获控制状态可读

**P2 / blocking / blocked**

位置：`settings_port.rs:40`–`:72` 的 install 只核对 7 表/4 trigger 的 DDL，
仅首次创建时插入 control；已有表不检查 `singleton=1,capture=1` 这一关键行。
`:35` 的 triggers 依赖该行，`:274`/`:282` 的 UPDATE 也不检查命中行数。

独立 SQL 负例：正常 install/capture 并 commit → 删除
`cloud_setting_control` singleton → 新事务 `install()` 仍 Ok → 本机把
`groupDates=false` 改成 true → capture 仍导出旧 false，没有 dirty 记录。
这不是把损坏当拒绝：API 已明确接受该状态并继续同步旧值。
`capture=0` 的异常持久状态同样值得拒绝，不能靠重建行猜测恢复。

需在准入/安装验证控制行存在、唯一和期望状态，并在 apply 控制更新时
检查准确命中；损坏保留并返回 state 错误，不覆盖成默认有效状态。现有事务
rollback 约束继续保留。扩展 schema 是 README 明确声明的 7+4 项，没有发现
它偷偷修改主 schema/user_version，但数据不变量验证不足。

## C4 — 确认失败与确认阶段并发不受操作 owner 管理

**P2 / blocking / blocked**

位置：`src/cloud-sync/CloudSyncSettings.tsx:219`–`:232`。
`await ports.confirm()` 在 run 的 try/catch 外，调用者通过 `void apply()`
丢弃 Promise。真实 React/注入 native-confirm fixture 返回 rejected Promise
时，得到 unhandled rejection `native dialog failed`，页面 `role=alert` 数为
0；用户只看到点击没有结果。该路径没有 native 写入，但违反明确失败反馈。

确认等待期间既没有 busy，也没有独立 confirmation owner。让 confirm
保持 pending，重复点击确认同步，会再次调用确认端口；两次点击实际新增
两个确认调用。`run()` 的 inFlight 到用户确认之后才取得，不能防住这一段。

需在进入确认前认领单操作/代次，try/catch/finally 包住原生确认，确认失败
走唯一安全错误面；取消/active 变化释放 owner 并拒绝旧结果。避免把原生
对话框异常或重复弹出转给宿主碰运气处理。浏览器测试不是实际系统对话框。

## C5 — 重新激活后旧请求占位导致按钮静默忽略

**P2 / blocking / blocked**

位置：`CloudSyncSettings.tsx:111`–`:146` 清理代次但未处理 inFlight，`:150`
见 true 就无反馈 return，`:171` 只有旧请求 finally 才清标记。

独立 React 负例：发起一个延迟的 Test → `active=false` → `active=true`
（组件实例仍在）→ 新 Status 正常返回、busy=false、预览按钮启用 → 点击
预览。调用日志计数保持 `4→4`，没有 preview 命令，也没有 busy/error 反馈。
直到旧请求完成，才恢复。原生请求可能持续到操作 deadline，这期间用户
无法判断是忙、点击失效还是配置不支持。

这里旧 response 已按 generation 丢弃，这是正确部分；但 operation owner
仍跨代次悬挂。应为请求 owner 分配代次，重新激活要么明确保留并显示忙，
要么释放旧 UI owner并让新请求得到真实 native busy；旧 finally 不能清掉
新 owner。补延迟 context/client、hide/reopen、旧结果晚到回归。

## C6 — 预算要在用户可见说明中准确表达

**P3 / nonblocking / open**

位置：`cloud_sync/model.rs:9`–`:13`、`:30`；前端表单说明
`CloudSyncSettings.tsx:351`及 preview/feedback 区。README 清楚写了
解密 JSON32MiB、密文48MiB、单 blob16MiB，UI 却只说“支持笔记、附件”及
泛化“超过大小或数量限制”，无法分辨整库、单附件、版本数量或编码开销。

可增加短能力说明/按 error detail 区分预算，但不回传私密正文、URL或密钥。
GitHub 的100MiB是上游 API 上限，本模块实际先受48MiB密文/32MiB明文约束，
不要显示成此客户端可上传100MiB。本项不单独阻塞模块修复交付。

## 已完成验证与通过事实

### 现有模块验证的独立复跑

- `CARGO_TARGET_DIR=/tmp/cybernote-settings121-cloud-review-target cargo test
  --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml --lib --offline
  --locked cloud`：**16 pass，0 fail，205 filtered**。
- `node scripts/verification/settings121-cloud/browser.mjs
  /tmp/settings121-cloud-review-browser`：**7 组 pass**，page errors/external
  requests 均空。实际 React，client/confirm/committed ports 为 mock；读取
  UI 树当前共享 CSS，SHA-256
  `ca4a090520482e32e42105b39b4d8feac1094166ac91e80c94d7f67ceea6d848`。
- `pnpm typecheck`、`pnpm version:check`、产品源码 diff 检查通过。

### 本轮独立负例

在临时 crate 中使用相同 Cargo.toml/lock，直接指向冻结的生产 Store、Session、
Sync model 和 Cloud 文件；只复制原测试 Host/HTTP fixture作为脚手架并追加
probe，没有改本树实现。`independent_cloud` 筛选 **9 项通过**，其中 C2/C3
是“断言缺陷实际存在”的探针，不能称为产品需求通过：

1. 在 Host commit 最终 gate **之前**停住，对 fields、secrets、passphrase、
   provider 分别 A→B→A；恢复旧闭包后全部 permission，远端 note 未进入
   本机业务投影，`sync_pending_count=0`。真实 Store + controlled Host；
   不等于真实 App/window/账户撤权测试。
2. 确认后远端 ETag 不变但解密 payload 改变：conflict，capture=0。
3. window/session/token/storeInstance 单独伪造：拒绝且无 HTTP/capture；
   授权 oracle 是测试 Host，生产可信校验仍需整合。
4. GitHub 大文件 metadata 与同源 raw body 不同：Git blob SHA 失败拒绝，
   不使用恶意 `download_url`；WebDAV302不跟随、不向第二个fixture转发凭据。
5. WireVersion 未 reseal 的 payload 修改被拒绝；合法换 namespace 保留
   ID/vector/payload，换回原 namespace 得到原 digest。
6. S3 实际 wire 捕获覆盖 endpoint 含中文/加号、prefix 中文/空格/加号、
   ListObjects query、session token、If-None-Match:* 和 If-Match。
   再用**独立 Python hashlib/hmac/urllib 实现**重建 canonical URI/query/
   headers/payload hash/string-to-sign，**6/6 请求签名一致**；验证器不调用
   产品 sign_s3。现有文档向量之外追加了真实发送字节证据。
7. C3 控制行缺失继续接受的 SQL 负例。
8. C2 真实 Store 设置 owner/投影被旧值覆盖的路径。
9. 未许可 key `backupPath` 被拒绝，事务 rollback 保留 groupDates=false、
   本机路径和自动开关；未知字段不进入允许列表。

额外锁子进程建立 C1：有 Save 时有界超时，对照无 Save 正常返回。进程组
已终止并 wait，不留下云服务/Store后台进程。

额外 Chrome React probe 建立 C4/C5，并测量390px可见 action/select均44px；
checkbox 本身20px但其可点击 enclosing label 约80px高，不误报成20px触达。
桌面自有菜单、内层Escape、外点关闭、手机select与浅暗布局有模块证据；
未以Chrome结果代替macOS WebKit/Android WebView/native IME。

本机临时证据（未提交到仓库，报告以上保留可复现步骤与观测）：

- `/tmp/settings121-cloud-review-baseline.log`：16条原用例。
- `/tmp/settings121-cloud-review-independent.log`：9条独立probe及C2/C3观测。
- `/tmp/settings121-cloud-independent-path`：临时crate路径；该目录的
  `probes.rs` 包含脚手架及完整独立probe；Cargo依赖/产品源码均只读。
- `/tmp/settings121-cloud-review-lease-gate.log`、
  `/tmp/settings121-cloud-review-lease-control.log`：C1阻塞与无Save对照。
- `/tmp/settings121-cloud-review-s3-wire.json`：仅合成凭据的wire fixture。
- `/tmp/settings121-cloud-review-browser/result.json` 及浅暗截图。
- `/tmp/settings121-cloud-review-browser-independent/independent.json`：
  C4/C5计数、unhandled rejection、390px尺寸。
- `/tmp/settings121-cloud-independent-browser.mjs`：独立React runner，SHA-256
  `5f5cf78c7d5870b4de1bb8e285c33ffa33d64aff898e85b32859d5f56d48d6dd`。

## 其余重点的审查结论与整合条件

**D1 / 版本桥接：模块边界 pass，生产整合待验。**
`store_port.rs:166` 先 `validate_envelope()` 再 rebind/reseal，未调用 account
adoption 或替换原 Store identity。原测试及本轮复跑覆盖不同原workspace、
原identity保持、并发heads、显式解决收敛、purge后重投不复活、附件原字节
和重复往返。云规范digest的head集合相等不代表各端当前投影必然相同；
runtime 在有冲突时明确要求显式解决。账户binding文件是synthetic fixture，
不是实测CyberBus绑定/Noise。真正账户A→B、Store instance轮换和迟到media
receipt还需在整合Host验证。

**D2 / 收件线性化：模块机制 pass，宿主准入待验；C1阻塞当前API次序。**
CloudFence原生构建，不接受renderer反序列化，绑定context/config revision/
云workspace/原Store tuple/远端revision/确认hash/最终incoming hash。
Save增epoch并取消旧token，ticket还检查配置revision和5分钟期限，抵抗
本进程A→B→A。Host在最终lease→Session gate必须再验证真实Window/Token/
Session/store instance、完整同步generation（包括inbox，不能只用
application_generation）和settings generation、bundle.digest。blob发布
在锁外；在有效fence之后receive才是共享durable inbox的接受点。关闭云不
撤回已接受inbox；post-receive需重新full media snapshot + quiet apply。

不允许将测试Host装入生产：其inspect用sync_plan_apply会flush；真实inspect
必须只读。capture需真实全窗quiet/设置保存和受保护录音/IME策略，不能把
普通export视为屏障。停止/退出要取消并join唯一foreground调度器；status/
打开UI不得触发automatic。生产两套handler、可信context适配、participant
变化/撤权/窗口ACK、并发P2P coordinator携带同一fence均待整合验收，属于
现有分工，不另判模块stub。

**D7 / 同事务：接口声明清楚，C2/C3需要修复，组合事务待整合。**
白名单固定theme/view/sort/groupDates，vector/seen/frontier/head/CAS存在，
false和缺失不覆盖、本机secret/path/任务开关隔离有证据。没有暗改Store
schema的commit；settings install明示增加7表4trigger，必须由Store owner
在确认后、既有事务中装配。生产notes投影与settings_port::apply需要在
同一个Store事务commit之前完成，settings-only操作亦需真实已提交回执。
目前headless Host用空settings bundle，单独SQL测试不证明该组合已完成。

**HTTP/crypto/私有状态：本轮检查 pass；未扩大为真实服务验收。**
WebDAV先只读PROPFIND验证根，只有已验证服务上的对象缺失才是Missing；
401/403/根404/500、HTML解析错误、弱ETag不伪装空库。S3签名与条件实际
wire验证通过；GitHub要求private repo/已有branch，raw同源并验证Git SHA。
HTTP重定向禁用，逐chunk有界；连接8秒、每请求含body30秒、操作120秒由
代码定义，本轮未刻意耗满30/120秒。Argon2参数固定、随机salt/nonce、AES-GCM
workspace AAD，错口令/篡改在capture前失败。32/48/16MiB和数量限额由代码
拒绝，不截断。状态DTO不含secret；错误使用固定摘要，不回显reqwest URL/
服务正文，源码未见秘密日志。PrivateFiles的openat/no-follow、owner/nlink、
0600/0700、锁/CAS、原子rename/fsync与损坏保留有代码/现有fixture证据。

## 关闭条件

修复C1–C5并针对各触发做回归后，对新的确切冻结revision重审；C6可独立
排期但不能继续宣称UI已清楚说明预算。随后由整合任务证明真实Host的
Context/fence/quiet/media收件与notes+settings同事务、事件和生命周期。
本轮没有改code，没有全套Tauri、真实云账户、用户数据、平台安装或发布操作。
