# settings121-update 独立审查

日期：2026-11-19。结论：**BLOCKED — 2 项 P1、3 项 P2 阻塞项待作者修复后复验**。

被审实现固定为 `cfde38103f71d0dd1fdf3e60a5c720a63abb2461`，工作树
`/Users/water/work/2026/.cybernote-worktrees/settings121-update`。审查期间实现未修改；
本次提交仅含本 review。审查者此前负责设置 UI，未参与更新模块实现。

依据：根仓库只读 `docs/architecture/settings121.md` 的“界面/更新/验证”与
`docs/plan/tasks/settings121-update.md`（用户简写的 `tasks/` 实际位于 `docs/plan/tasks/`），
本树 `agent.md`、[原生 README](../../../src-tauri/src/software_update/README.md) 和
[前端 README](../../../src/software-update/README.md)。本报告中的源码行号均针对上述固定 SHA。
UI 共享宿主 CSS 按作者 fixture 使用 `e29a7d8c:src/Preferences.css`；不把此 fixture
称为最终 App 集成，也未恢复 UI 开发工作。

## 阻塞发现

| ID | 优先级 | 判定 | 问题与代码位置 |
| --- | --- | --- | --- |
| U1 | P1 | blocking | ZIP 的真实解压量没有受总量上限约束；`archive.rs:84`、`archive.rs:94`、`install.rs:313` |
| U2 | P1 | blocking | 新进程仍活着但未 ready ACK 时直接回滚 bundle 并再启动旧版；`replace.sh:26`、`replace.sh:34`、`replace.sh:36` |
| U3 | P2 | blocking | helper 等待退出期间允许新变更打断安装状态，取消后可遗留不释放的安装 lease；`service.rs:129`、`:148`、`:174`、`:400` |
| U4 | P2 | blocking | 配置保存失败的“重试”执行 check 而非重放原配置，失败提示被清除；`SoftwareUpdateSettings.tsx:111`、`useSoftwareUpdate.tsx:98` |
| U5 | P2 | blocking | 手机三个设置开关实际触达仅 30×18px，无扩大点击标签；`SoftwareUpdateSettings.tsx:75`、`software-update.css:34` |

### U1 — 实际解压大小可绕过声明的 2 GiB 上限

设计要求有界 ZIP；原生 README 也承诺在 `ditto` 前检查展开总字节数、拒绝 ZIP64。
`validate_zip` 累加 central header 的 uncompressed size，却不验证其与 local header、
真实 deflate 输出一致；之后直接调用 `ditto -x -k`，没有针对实际写出字节数的上限。
90 秒子进程截止不能替代磁盘展开量限制。

独立负例构造一个约 **8,340 bytes** 的真实 deflate ZIP，将 central uncompressed size
改为 **1 byte**，保留实际 **8,388,608 bytes** 内容。实际源码 validator 返回 `Ok`，
同实现使用的 `/usr/bin/ditto` 返回 0 并在临时目录写出完整 8 MiB。
因此“2 GiB 总上限”依赖未验证的声明字段；同一机制允许更大的输出，未为证明此问题
生成或解压超过限制的大包。另一个带 `0x0001` ZIP64 extra 的 ZIP 也被 validator 接受，
与文档的 ZIP64 fail-closed 声明不符。

修复要求：在可信的受限解压路径按实际流量累计并在超限时停止，验证 entry 大小/CRC/
本地与 central 元数据及 ZIP64 extra/descriptor；不得只用 central 声明或事后 `walk`
当作写入界限。增加“SHA 正确但展开元数据不实”的回归，失败必须发生在无界提取之前。

证据：`/tmp/settings121-update-independent/zip-result.json`、`understated.zip`、
`zip64-extra.zip`、`test.log`、`extra-native.log`。

### U2 — ACK 超时不代表替换进程已经退出

设计要求新宿主 ready ACK 后才能确认成功，超时须安全回滚。
helper 只跟踪旧 PID；`open -n` 返回后循环等待 ACK，到时直接把当前 target 移为
`failed.app`、恢复 backup，并再次 `open -n` 旧版。它没有获得/校验新进程身份，
没有请求新进程停止，也没有等待其真正退出。

独立 fake-app 负例用惰性 opener 启动一个临时 `sleep` 子进程模拟“新进程活着但初始化
未完成”，不写 ACK；仅将 helper 的 sleep 替换成无等待以加速。结果：helper 返回 1，
phase=`rolled_back`，旧 target 已恢复且旧 opener 被调用，但替换进程仍活着。
这与仅“新程序根本没启动”的作者 ACK-timeout case 不同。对真实宿主，该路径可能在
新进程仍持有库/窗口/后台工作时移动其 bundle 并启动第二个宿主。此处未操作真实库或安装包，
不宣称已复现数据损坏。

修复要求：建立可核验的新进程生命周期握手，安全停止并确认新进程结束后才能回滚/重开；
无法确认时保留事务和备份并报告需恢复，不能把“文件已移回”作为整个运行态安全回滚完成。
应覆盖活着但未 ACK、迟到 ACK、退出失败及恢复失败，并清理测试子进程。

证据：`/tmp/settings121-update-helper-live-probe.py`、
`/tmp/settings121-update-independent/helper-live.json`。测试结束已终止自建子进程。

### U3 — 安装操作许可在异步退出前释放

设计要求单操作、正确持有安装 lease 直到实际退出或取消，并可从失败恢复。
`install_owned` 调用 `launch` 后把 lease 存入 `install_lease`，随即完成 `Operation`，
其 Drop 将 `busy=false`。此时 helper 仍可能处于 `waiting_exit`，但 native
`configure/check/download/install` 的 admission 只检查这个 busy 原子位。
前端的 busy 状态和 scheduler 的 phase 过滤不能代替共享原生边界。

独立私有边界探针建立与作者 lease 测试相同的临时事务、`phase=restarting`、保留 lease：
`configure({channel:preview})` 在 helper 等待时返回成功并把状态改为 `idle`。
随后写入真实 helper 的终态 `cancelled` 再读 `status()`，得到 `idle`，lease 仍未释放。
原因是失败处理仅在复制出的 status.phase 恰为 `restarting` 时 take lease；新命令已改写
该字段。若 host lease 持有编辑/录音屏障，应用可能在取消后仍不能编辑。此探针不要求
真实退出用户 app；当前 React 禁用按钮降低触发面，但 native 主窗口命令仍可达。

修复要求：以原生安装事务身份/存活 lease 持有 operation admission，等待 helper 终态再结束；
不能以可被其他操作覆盖的显示 phase 判断 lease 所有权。失败终态同步回权威状态，覆盖
waiting_exit 时重复命令、退出 veto、状态读取与取消竞态。

证据：`/tmp/settings121-update-independent/service.rs` 的 appended test
`admitted_command_during_exit_can_strand_lease`，日志 `test.log` / `extra-native.log`。

### U4 — 配置失败重试丢失原始意图

设计要求持久化失败明确、可恢复，不把其他成功操作冒充原操作成功。
Provider 在 `configure` 拒绝后保留错误、读取旧 status；旧 status.retry 通常为 null，
还可能保留另一项下载/安装失败的 retry。Settings 的统一“重试”只检查该 status.retry，
没有记录本次失败的配置 patch，于是调用 `check()`（或错误地重试旧下载/安装）。
成功的 check 清除 action error，配置仍是旧值。

独立浏览器探针注入第一次 configure 抛 `preferences_changed_externally`，点击“定时检查”
试图关闭，再点击“重试”。实际调用序列为
`configure:{"automaticChecks":false}` → `check`；开关仍为 true，alert 已消失。
产品未伪写 false，但“重试”没有做所承诺的动作，也隐藏了未保存意图。

修复要求：记录失败操作类型与配置 patch，重试正确动作；若外部修改要求重载，则给出
明确重载/重新应用流程，不用检查发布成功消除配置保存问题。还须覆盖 status 中残留
`retry=download/install` 时配置失败的分支。

证据：`/tmp/settings121-update-independent-ui.mjs`、
`/tmp/settings121-update-independent/ui-probes.json`、`configure-retry-mobile.png`。

### U5 — 开关缺少手机 44px 触达区

界面契约要求手机控件触达至少 44px。`Toggle` 直接渲染 input，行标题与 input 没有
`label/htmlFor` 关联或父 label；CSS 明确设为 width30/height18。shared host 的手机
min-height 规则针对 button/select/summary，不会扩大这个 input 的触达。

独立浏览器测量在 390px 并添加实际 `.preferences-mobile` 宿主 wrapper 后，
“启动时检查/定时检查/显示更新徽标”全部为 **30×18px**，`input.labels.length=0`。
键盘可操作及 `aria-label` 不能代替触屏目标。

修复要求：用关联 label 或至少 44×44px 的可操作 wrapper 承载紧凑视觉开关，避免新增
嵌套交互元素；测试点击触达区边缘能切换、禁用时不能切换，保留键盘焦点与说明关联。

证据同 `ui-probes.json` 的 `mobileSwitches`。此问题在已有共享宿主规则下仍成立，
不是“尚未接 App”导致的假缺陷。

## 已完成检查与边界

| 检查 | 结果 | 建立的事实 / 不建立的事实 |
| --- | --- | --- |
| `python3 scripts/verification/settings121-update/verify.py --commands` | PASS，21 tests | 实际 Rust 模块、macOS validators、5 条 Tauri command 及独立 `generate_handler!` 编译；临时原生 arm64/ad-hoc bundle 的身份/版本/native hash/损坏负例。不是最终 lib.rs 双入口注册或真实 app 替换。 |
| `python3 scripts/verification/settings121-update/replace-proof.py` | PASS，10 cases | success、open failure、无 ACK timeout、stage move/rollback failure、live/stage hash 变化、abort、symlink、exit veto；全为临时 fake bundle、惰性 opener。未覆盖 U2 活进程。 |
| `pnpm typecheck`、`pnpm version:check`、`git diff --check` | PASS | 固定实现 TS 与包版本一致；不证明 D5 的 preview 升级身份正确。 |
| 作者 `browser-proof.mjs`，本地 Vite1431 / Chrome | PASS | 1000px light/dark、520/390/320px 无水平溢出；空发布、开关键盘、频率/频道、进度、checksum失败与重试、安装 guard 拒绝、unsigned Android 无安装按钮、徽标隐藏/恢复、无 native 注册时不可用。 |
| 独立 Rust probes | 5 probes 完成 | redirect allowlist 正反例、U1 两类 archive 接受、U3 安装 lease 复现、no-op prefs rewrite 观察；这些是问题复现/行为观测通过，不能写作产品修复 PASS。 |
| 实际 `acknowledge()` 临时 `.app` 可执行探针 | PASS，5 cases | matching native hash 的 awaiting_ack 写 ACK 且保留 pending；wrong hash/unknown phase/corrupt pending 不 ACK 且保留证据；complete 转存 receipt。不证明真实宿主在正确 readiness 时点调用。 |
| 独立 Provider 控制时序探针 | PASS，3 cases | 迟到进度不能覆盖 ready；client 替换停止旧轮询并使用新状态；unmount 停止计时器。 |
| 独立 UI 失败/触达探针 | U4/U5 REPRO；nested button 检查 PASS | configure失败后错重试、30×18px真实触达；`button button` 数量0，UpdateBadge 无交互后代。 |
| 独立活替换进程 helper 探针 | U2 REPRO | 临时活进程、未 ACK 情况下 helper 确实回滚/重开却不停止新进程；已清理子进程。 |

固定源代码检查另确认：production feed 为
`https://api.github.com/repos/ywateru/CyberNote/releases`，无生产 feed override；
asset URL 必须精确匹配本仓库/tag/name。重定向仅 HTTPS443、无 userinfo、最多5跳、
GitHub/API/release-assets/objects 四个明确 host；独立纯函数负例覆盖 HTTP/异端口/userinfo/
伪后缀/其他 host/file URL。未用真实 GitHub/TLS 下载来声称链路在线验收。

SemVer 测试覆盖预发布数字段、超长数字、build metadata 不影响排序、稳定版本拒绝同 core
preview 降级；选最新后缺包报 missing_asset，不回落旧版。receipt 对 package/platform/
arch/core version/production/native hash 格式与 SHA 文件绑定；mac staging 再查 native
hash、identifier、exact executable、arm64 和 `codesign --deep --strict`。
HTTPS 发布源信任不等于独立签名清单/Developer ID/公证，UI 明确说明此限制。

持久化读取错误/损坏/链接拒绝，partial false/zero、未知 key 保留与外部字节变化检查、
原子替换均有源码及部分回归证据。检查元数据分页/响应体、包下载大小/时间有界；取消清理
part 文件、重试实际重新发请求、scheduler 显式关闭/频率变更/Drop/shutdown 有已有测试。
未注入磁盘满、写后目录 fsync 失败或系统级断电，不能把已测项扩大为所有 I/O 故障验收。

独立探针位于 `/tmp`，没有改本树实现：Rust 使用原文件，私有边界探针仅在外部临时镜像
追加测试（并把 tests.rs path 指向本树原件），source SHA256 清单保留在
`/tmp/settings121-update-independent/source-hashes.json`。不依赖用户凭据/账号库/笔记库，
未下载真实发布大包，未替换 `/Applications` 或其他现存用户 bundle。

## 非阻塞观察与整合条件

- **D5 / integration-required，非本模块新阻塞**：`CARGO_PKG_VERSION=0.1.0` 且缺完整 preview
  release identity 是已知事项。version:check 只能证明 core 一致；当前稳定身份会拒绝
  `0.1.0-preview.N`，且包 core 相同不能表达 preview.N→preview.N+1。
  整合必须明确完整运行发布版本来源、排序与 receipt/plist core 的不同职责，并回归当前
  preview 升级路径，不以改语义比较允许降级绕过它。
- **integration-required，非因未接线阻塞模块**：lib.rs normal/proof 两套 handler 加全部5命令，
  管理唯一 `Arc<SoftwareUpdater>`，scheduler 在 entered runtime 启动并在退出时 drop/join；
  不替换全局 invoke handler，不引入新 Store/保存队列。命令仅 main 窗口可调。
- **release gate**：`InstallGuard` 由既有 native 确认与全窗口 save/preferences/录音/quiet/quit
  协调实现，返回 lease 后阻止新编辑，不能把 `app.exit` 返回当实际退出。
  当前模块不含这些 App 宿主实现；必须在最终集成验收前补齐，DenyInstall 可安全拒绝。
- **release gate**：所有启动都在 Store、窗口、保存/录音和退出 hooks 真 ready 后调用
  `acknowledge_launch`；与 U2 修复一起证明真实退出、重启、ready、失败恢复链。
  仅本次临时 ack function probe 不足以证明宿主 ready。
- **Android accepted scope**：unsigned APK 只真实下载/receipt+SHA/ZIP头检查；UI 无安装按钮，
  native install 拒绝。未做 manifest/signature/PackageInstaller，不应包装成可安装或要求卸载。
- **UI integration-required**：一个 Provider 常驻 main root；`softwareUpdate` 为面板、
  `softwareUpdateBadge` 为非交互 span，host button 独占点击/焦点。列表/行/标签/操作/文字按钮
  使用共享 `settings121-*`，最终复验 token/字体缩放/选择器弹出与 Escape 行为、常规灰色文字
  操作及紫色强调/22px胶囊徽标。作者 fixture 固定旧 CSS，不能替代整合后 cascade/原生WebKit
  和 Android WebView/触屏验收；U5 仍由模块修复。
- **P3 / non-blocking observation**：向一个排版不同、只含部分字段的 preferences 文件提交同值
  patch，会补齐默认字段并格式化重写，未知 key 保留；当前为模块自有 JSON，不作为阻塞项。
  不把它说成保留外部文件格式的工具。

未运行全套重型构建、真实发布包下载、真实 app替换、真实退出/录音 barrier、原生 WebKit、
Android 真机；本机未安装 Playwright WebKit executable。以上均不计 PASS。

## 可复核证据与移交

- 作者原生日志：`/tmp/settings121-update-review-native.log`。
- 作者 helper 结果：`/tmp/settings121-update-review-helper.json`。
- 作者 Chrome：`/tmp/settings121-update-ui/results-chrome.json` 及同目录截图。
- 独立入口：`/tmp/settings121-update-independent.py`、
  `/tmp/settings121-update-extra-probes.py`、`/tmp/settings121-update-independent-ui.mjs`、
  `/tmp/settings121-update-provider-probes.mjs`、`/tmp/settings121-update-helper-live-probe.py`。
- 独立结果：`/tmp/settings121-update-independent/` 内 `test.log`、`extra-native.log`、
  `zip-result.json`、`ack-results.json`、`ui-probes.json`、`provider-results.json`、`helper-live.json`。

U1–U5 交模块作者 Faraday 修复；审查者不改实现。修复后须以新的固定 SHA 重跑对应负例及
作者已通过检查，才可把模块判为 PASS。UI 工作保持暂停，待 Locke 的独立 review 结果。
