# Settings121 Cloud C1–C6 独立复审

日期：2026-11-19。被测冻结产品源码：
**`f57c40bf7cad15485a44f371439103bd71b11514`**。
上一轮：[`settings121-cloud.md`](settings121-cloud.md)，被测旧实现
`189b348e66e1d9db02c0d796e5671ea3c3d15e1c`，报告提交 `85873a61`。
角色：独立 reviewer，未开发 Cloud 修复；只写本报告，不改代码/测试/依赖。

**本次模块修复闸门：pass。** 原 C1–C5 blocking 和 C6 nonblocking
在本次限定复审范围关闭，没有新增 blocking。此结论针对上述准确模块
revision，不等于 CloudHost/原生接线/平台验收 pass。公共 Host 必须适配
CheckedLease；仍在开发的 Host 不作为本轮被测对象，不重复评其已知问题。

| 原问题 | 修复与证据 | 复审 |
| --- | --- | --- |
| C1 / P1 blocking | CheckedLease 在同一已持有读锁上查 binding/workspace；旧版与新版的 Save-writer-waiting 对照；真实 Save 不能越过 gate | pass / closed |
| C2 / P2 blocking | 更新实际 AppearanceV2/PresentationV1 owner；真实 Store 保存→SQL apply→无关 Store 保存→重新 capture/reopen，因果值不反向回退 | pass / closed |
| C3 / P2 blocking | control 必须唯一 `(1,1)`，所有入口拒绝丢行/关闭捕获；精确旧 trigger 迁移保留因果行并可 rollback | pass / closed |
| C4 / P2 blocking | 确认前取得单 owner，reject 单安全错误，双击不重复确认；取消/过期确认不发 sync | pass / closed |
| C5 / P2 blocking | 每代 active 和每请求有 owner；重进可发新请求，旧结果/finally 不清新 busy，迟到 context 不发旧命令 | pass / closed |
| C6 / P3 nonblocking | UI 明示32/48/16 MiB、1024/128及编码开销，GitHub服从更小模块预算 | pass / closed |

## 来源与实际检查

先核对工作树 HEAD、clean 状态和 `git diff 189b348e..f57c40bf`，读新增
`lease_tests.rs`、`settings_owner.rs`、`settings_regressions.rs`、修改后的
runtime/settings_port/React/README。未使用源码 pattern 作为唯一结论。

### 原模块与新增作者回归：独立复跑

```sh
CARGO_TARGET_DIR=/tmp/cybernote-settings121-cloud-review-target cargo test \
  --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml \
  --lib --offline --locked cloud
node scripts/verification/settings121-cloud/browser.mjs /tmp/settings121-cloud-recheck-browser
CARGO_TARGET_DIR=/tmp/cybernote-settings121-cloud-review-target node \
  scripts/verification/settings121-cloud/old-regressions.mjs \
  /tmp/settings121-cloud-recheck-old-behavior
pnpm typecheck
pnpm version:check
git diff --check
```

- Rust **23 pass / 0 fail / 205 filtered**，包含原有真实 Store/媒体/身份桥接/
  CAS/HTTP/crypto与新增lease、owner、control、migration测试；没有运行无关
  全套Store/Session或Tauri。
- Chrome实际React **10组 pass**，page errors/external requests均空；有
  桌面/390浅暗截图、菜单/焦点、C4/C5/C6回归。原生client/confirm为受控
  ports，不是系统原生对话框。
- old-regressions以旧Git object中的真实settings_port/React执行相同修复后
  行为断言：**C2/C3/C4/C5四组均拒绝旧行为**，分别产生预期断言失败、
  native confirm unhandled rejection和重进后未发请求的证据。不是因编译
  失败/无产品入口而误认为回归有效。
- typecheck、版本一致性、diff检查通过。

### 独立C1：旧/新版各有无Save writer的四路对照

另建临时crate，直接指向生产Store/Session/model，Cloud文件复制到临时
目录；旧组仅替换runtime为`189b348e`的Git object，新组使用冻结修复源码。
调用路径仍通过真实CloudRuntime配置/preview/sync→受控CloudHost capture。
Host取得最终lease gate后暂停，另一任务发真实`CloudCommand::Save`，让
writer排队；随后最终gate中读取binding/workspace。旧组使用旧Lease读取，
新组使用新CheckedLease读取；只对这项必要API调用做区分。

编译在计时之外完成，再对实际Rust测试进程设置3秒硬deadline：

| 版本 | 等待Save writer | 结果 |
| --- | --- | --- |
| 旧189b348e | 无（Status对照） | 正常结束，nested read返回 |
| 旧189b348e | 有 | 3秒超时，停在gate内nested read，终止并wait整个进程组 |
| 新f57c40bf | 无 | 正常结束 |
| 新f57c40bf | 有 | 正常结束，guard accessor不被writer阻塞 |

这复用了上一轮真实死锁交错，而不是只测试无竞争的guard读取。另复跑作者
`cloud_final_gate_with_save_writer_is_bounded_and_linearized`，实际检验：
Save持state等待epoch写锁，guard accessor仍成功；gate未释放时Save不完成；
释放后Save落盘，旧lease返回permission。旧式lease查询改为try_read，writer
排队时可返回busy但不应阻塞；不是删除写锁来绕开线性化。

## C2/C3独立生产Store与SQL负例

独立probe代码保存在临时crate，不写本树。追加 **4项通过**：

1. **真实owner roundtrip / portable whitelist /因果CAS**。
   `Store::open(temp)`→真实`Store::action(settings)`设置forest/light与
   focus/two-pane/list/compact、手机gallery/comfortable、本机selectedNote/
   cloudConfig；对同一真实notes.sqlite3的SettingsPort事务应用因果后继
   dark/gallery。读取`Store::workspace()`确认实际owner改变，themeId、
   navigation/density/mobile、selectedNote和本机配置完全保留。
   随后真实Store仅改sort，重新capture：theme/view/groupDates仍是已接收
   digest，没有反向新后继。序列化版本只含theme/view/sort/groupDates。
   合法变更后再混入unknown cloudConfig key，apply失败并rollback，body和
   heads不变；相同vector异value reseal的equivocation也被拒绝。重开Store
   后仍为dark。这是原C2失败路径的修复结果。
2. **真实owner dirty→stale apply**。本机通过Store设置appearance为新值，
   未capture前用旧preview值apply，返回stale，body不变；capture会导出
   实际新owner的值/因果后继，未静默覆盖活动设置。
3. **控制行损坏各入口拒绝**。分别删除singleton和持久capture=0，
   heads/generation/install/capture/apply全部state；rollback后没有补行、
   没有改body。与上一轮“旧false被继续导出”的负例相反，现已fail closed。
4. **真实旧schema迁移→rollback→commit→reopen**。在真实Store文件上，
   先调用从旧revision读取的实际SettingsPort install/capture建立旧7+4
   schema和heads，再调用新install；迁移前后heads不丢，rollback恢复准确
   旧trigger SQL与旧heads；重新迁移/capture/commit后重开，install不重复
   标dirty。额外作者回归覆盖混合/错误owner、control中途丢失等失败。

源码责任对应：

- `settings_owner.rs:84`读实际owner的便携投影，`:104`只更新选中便携字段
  的owner和旧兼容投影，保留非便携siblings。
- `settings_port.rs:84`只迁移准确完整旧DDL；`:133`验证唯一control；
  `:331` apply前准入；`:337`拒绝dirty；`:357`投影实际owner；`:358`后
  控制切换/设置写入都要求准确命中一行。
- trigger表达式比较有效owner值及类型；wire仍是四个独立因果键，不把
  整个appearance/presentation或本机路径/开关偷偷加入portable schema。

以上用到真实生产Store和设置SQL，但不是最终Host的notes+settings quiet
同事务测试；该接线仍在公共backend审查范围。module不打开第二个Store。

## C4/C5独立实际React负例

独立Vite/Chrome runner直接挂载冻结生产组件，注入可控制拒绝/延迟的
context/client/confirm。额外检查全部通过：

- native-confirm reject显示**一个**固定“无法打开确认对话框”alert，
  无unhandled rejection，无sync调用；错误不回显原异常文本。
- 在React提交disabled之前同一DOM事件循环双击，确认计数只增加1；
  pending期间按钮禁用。返回false后不发sync。
- pending确认时hide/reopen，旧确认随后true，也不发旧sync。
- 旧Test延迟→hide/reopen→新status完成→再次Test，实际发出第二请求；
  旧请求先结束时新请求仍busy/按钮禁用；新请求结束才恢复。
- budgets实际DOM含32MiB/48MiB/16MiB/1024/128和Base64开销说明。
- page errors、unhandled rejection和external requests均为空。

对应`CloudSyncSettings.tsx:178`的operation owner把确认包含在run的
try/catch/finally内；`:172`清理active generation，`:224`只清当前owner，
不会由旧finally清掉新请求；`:558`预算说明已可见。作者额外context延迟
用例也复跑通过，防止hide后迟到context继续调用client。

## 给Pasteur的CheckedLease整合反馈

新API精确位置：`runtime.rs:39`的`CheckedLease`、`:78`的
`Lease::enter() -> Result<CheckedLease<'_>>`。

```rust
// 网络、media.verify、窗口ACK以及大文件hash/copy必须在gate之外。
let guard = lease.enter()?;
guard.check_workspace(&bundle.workspace_id)?;
let binding = guard.binding()?; // 只检查已持有的epoch/fence，不再取锁
// 然后才取得唯一Session，验证真实Context/Store instance/identity/
// full generation/payload hash，在同一短最终事务内完成收件或应用。
// 释放Session，再释放guard。
```

**持有guard期间禁止**调用`lease.enter/check/binding/check_workspace`，
使用`guard.check/binding/check_workspace`；也不能读取CloudRuntime.state，
因为Save顺序是state→epoch writer。lease旧查询现在try_read可能返回busy，
这只避免旧误用卡死，不代表宿主可以依赖旧调用顺序完成事务。不要在锁外
只check一次就丢guard，也不要把配置锁删掉。

新接口保留context/config revision/cloud namespace/原Store tuple/remote
revision/confirmed hash/incoming hash绑定。receive前最终gate与后续full
media/quiet apply都需适配；已进入共享inbox的事实不能在关闭云后声称撤回。
Host原有媒体事件锁顺序、提交后事件失败的receipt等问题不由此次module
fix自动解决，将在新的Host冻结revision单独审查，不重复记为C1–C5。

## 证据、准确源码与边界

原始本机证据（临时产物不提交实现树）：

| 路径 | 内容 |
| --- | --- |
| `/tmp/settings121-cloud-recheck-rust.log` | 23项完整Cloud筛选结果 |
| `/tmp/settings121-cloud-recheck-browser/result.json` | 10组React检查/实际源码hash与截图 |
| `/tmp/settings121-cloud-recheck-old-behavior/result.json` | 旧C2–C5四组因果失败 |
| `/tmp/settings121-cloud-recheck-lock-results.json` | 独立C1四路对照及每路日志 |
| `/tmp/settings121-cloud-recheck-lock-proof.py` | 独立有界lock runner，超时进程组清理 |
| `/tmp/cloud-recheck-independent-path` | 独立Store probe临时crate路径，其中`probes.rs`及`legacy_settings_port.rs` |
| `/tmp/settings121-cloud-recheck-independent.log` | 4条独立真实Store/SQL检查 |
| `/tmp/settings121-cloud-recheck-browser-independent/independent.json` | 独立C4/C5/C6观察 |
| `/tmp/settings121-cloud-recheck-browser-independent.mjs` | 独立React runner |

冻结源码SHA-256：

- runtime.rs：`06be50129d944c532123c80eef7ed7c58279d6a487cd6c979bcf9fac940efd8a`。
- settings_owner.rs：`54f672136333c80999c1966832d7dc64066248158aad48b0f732bcd5a9f15ca7`。
- settings_port.rs：`61d87f45d7eb74cc168ed187c0d84169181c9d2e73bbb263a5abe6fff41dbfd7`。
- CloudSyncSettings.tsx：`bb7b00a069b08ce639b4a3e5fed6f79f3a5f0117d12b137cb271c73f4e6372e3`。

本轮无真实云账户/CyberBus/Noise、完整Tauri、系统原生确认、WebKit/WebView/
IME/录音/设备/安装或发布；全部SQLite/文件/HTTP位于临时隔离目录/loopback。
source probe和Rust/浏览器均已结束，死锁对照子进程已kill/wait。公共Host
未冻结前不运行其浮态测试；本报告只关闭准确`f57c40bf`模块C1–C6。
