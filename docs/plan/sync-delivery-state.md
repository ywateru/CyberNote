# 双端同步当前交付状态

更新：2026-11-06。供中断恢复；[正式规格](../architecture/sync.md)、[窗口协议](../architecture/sync-coordinator.md)和任务文件仍是行为契约。**完整同步目标 active，正在进行新隔离 Android 的实际运行验收。** 已交付 gallery83，不再重做快速首页。

## 已接收与剩余门槛

| 层 | 当前状态 | 准确来源与证据 |
| --- | --- | --- |
| 84 Store / 85 认证网络 / 86 设置与协调 | 已独审合入 | 84 `feff050d`、85 `0ab39d70`、设置 `d8ff3336`、协调 `85b9e0eb`；历史失败保留于各自证据目录 |
| 86 Rust adapter / Session | 最终产品已独审并整合 | 产品 `cd334bc8`，独审 `0feb310d`，主线合入 `9cbbb150` |
| 主线完整产品回归 | PASS，十条命令自然0 | [完整整合](../verification/sync87/main-integration/README.md)：桌面464、手机笔记9/录音43/附件组合290/同步设置56，Store159 pass/3既有ignored、网络23，build/production/Tauri check；未因后续纯工具合入重跑全套 |
| 86 两实际 App DOM | 作者与不同代理各39项自然0 | 最终工具 `b08c7728`，作者 `40b93a6a`、独审 `c66e18db`；[独审](reviews/app-sync86-dom-integration-independent.md)。两个 React/Tiptap、独立 Rust/SQLite/Noise、同目录重启、真实 renderer ACK；不是 fixture 或 Android |
| 87 实际 LAN / 匿名 wss | 已独审接收 | harness `7323d818`、作者 `bd4e531e`、独审 `55b71804`；[56项实际路线](../verification/sync87-routes/build11/README.md)、[独审32项审计](../verification/sync87-routes/independent-build11/RESULT.md)。含第二 hostname 新邀请及原目录冷启；实际 WireGuard/EasyTier 无现成对端，未验证 |
| Mac27 / Android17 准确包 | 已构建，独立核包 PASS | 两端321项产品输入相同；[Mac](../verification/sync87/native-build/result.json)、[Android](../verification/sync87/android-build/result.json)、[独立核包](../verification/sync87/native-independent/README.md)。Mac ad-hoc、Android debug，不等于原生运行 |
| 87 原生验收工具 | 最终依赖与断言已独审 | 完整正文修复 `cb202998` / 独审 `97b048ae`；精确依赖 `16ce5779`，作者 smoke `5f0fd4df`，独审 `ad48a884`，主线合入 `5a07d842`。final11单实际 DesktopPeer10项自然0，非双端设备证明 |
| 87 新隔离 Android 环境 | 既有 ready，实际 APK 验收进行中 | AVD `notes-sync87-isolated`，仅 `emulator-5584`；资源 `/private/tmp/apple-notes-sync87-environment-01`。reviewed lifecycle 保持至少8GiB free；不得降低 guard |
| 87 最终实际 Android | **stage01已实际通过；附件与同步阶段仍进行中** | 工作树 `/private/tmp/apple-notes-sync87-native`，分支 `codex/sync87-native`，作者 `/root/sync87_native_develop`。最终实际结果还需不同代理独审 |

主线后续工具整合的 notes9 与真实LAN21已恢复通过；最初LAN因root输出路径不符合准入规则而在启动前拒绝，原 failed 汇总保留，见[窄恢复记录](../verification/sync87/shared-tool-integration/README.md)。不把调用错误改写成产品失败，也不覆写成原运行通过。

## 当前准确产物和准入

- Mac：`artifacts/sync87/备忘录-Mac27.zip`，6,694,032字节，SHA256 `7d86122f52c904ecc6a24f3407913de4c2e352b936b6937056094d4edf04fc7f`。
- Android：`artifacts/sync87/备忘录-Android17.apk`，236,444,967字节，SHA256 `e54b7da52b95a65d23f308214ff8e2fa6a93079935f617b6603828e435c68173`。
- 对端 immutable11：`/private/tmp/sync86-transport-build11/notes-current-attachment-transport`，SHA256 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`，产品 `cd334bc88513a89c490788d2e2e27c7967575f4a`，mode0555。旧可变 target 路径不得替代它。
- 最终 peer receipt `/private/tmp/sync87-peer-final11/receipt.json`，authority `root-sync87-peer-review`；APK receipt `/private/tmp/sync87-apk-final17/receipt.json`，authority `root-sync87-package-review`。均mode0600，已实际准入与hash检查。
- 产品包冻结后未修改321项产品输入；后续主线合入仅验收工具与证据。

## 下一步

1. 仅新5584安装准确Android17；核 AVD、emulator PID、app PID、CDP identity。实际 gallery/＋/聚焦/中文正文保存、系统chooser取消/多选/连续PNG/TXT/WAV、图片导出原SHA、应用重开持久化。
2. 实际手机设置 UI 配对真实 DesktopPeer；双向完整document/plainText及PNG/WAV原字节、前台重连、同data应用重启、同data冷启动恢复。冷启动拆prepare/verify并用已审生命周期，核新bootUUID和同userdata dev/inode/size。
3. 保留失败，必要时原作者窄修、不同代理复核；不放宽断言。结束owned children/forwards/lifecycle后提交紧凑安全证据。
4. 不同代理独审实际结果；更新最终使用说明与交付文档。真实运行未完成前不得 complete goal。

## 证据和资源保全

正式01双App业务39通过但Node未退出，实际定位为Chrome stderr被crashpad/updater继承；修复后另有driver TypeError失败，最终formal03完整自然退出。原件均在[DOM作者证据](../verification/sync86-dom-integration/README.md)，不能称早先是esbuild。当前引用媒体收敛已证明，SQLite附件行数4/2含本地未引用checkpoint，不宣称孤儿GC完成。

原TLS CryptoProvider panic、长持Session gate、PlanStale错误分类、locked resolve提交后旧Token、正文断言缺失等均有独立失败及修复证据，按准确源码和binary范围解释，不能追认旧版本通过。首个实际cloudflared在SIGTERM后8秒仍未退出，最后SIGKILL；第二个自然0。所有真实Rust进程自然退出与工具清理准确区分。

已正常清理完成的adapter/routes/DOM/package-review及较旧干净源工作树，分支/已提交证据保留，见[source-checkout-cleanup](../verification/sync87/source-checkout-cleanup.json)。当前native工作树保留；共享SDK、node_modules、主线target、84/85target保留，不并发借用target编译。根负责文档/派发/合入/主线整合与准确包，开发和独审由不同代理负责，不唤醒旧debug70。

## 原生实际验收进行记录（非完成收据）

- actual-01 首次stage01自然exit2/1.007秒。真实安装成功，原工具未兼容 `Performing Streamed Install` 及Android11的 `~~token` 安装父目录；最小工具修复 `febe6174` 经不同代理 `b8e1a7aa` 窄审（原20+独立45项host断言自然0）并已主线合入。没有产品修改或绕过installed完整hash。
- stage01-retry01 **实际自然0/19.919秒**：准确Android17安装/完整installed hash、直接画廊/黄色＋、原生tap新建、真实contenteditable焦点和系统 `mInputShown=true`、完整中文正文Store revision1保存。截图/HTML在 `/private/tmp/notes-sync87-native-actual-01`，后续结束owned进程后归档；此处尚不是独立设备最终收据。
- stage02首次自然exit2/8.555秒，未进入DocumentsUI。后续观察有CDP触摸15秒超时及UIA两个WebView矩形导致严格定位拒绝，尚不能据此判产品故障；原失败和截图保全，正在依据实际层级定位，不无条件取第一个。
- lifecycle01自然结束，完整外层exit0/624.453秒，owned emulator自然0、无signal；停止后guard正确拒绝无active emulator。同AVD/serial/既有userdata的reviewed lifecycle02已开始，guard下限不变。仅新5584，未碰原设备。

## 用户原现场和范围

原Android约13秒未保存录音完全不碰：禁止安装、启动、停止、重启、读取、导出、备份原应用或旧AVD（含5580）。ADB显式5584，无默认serial，无kill-server。只用合成PNG/TXT/WAV，无真实mic；Apple Notes删除实验不做。已有直接执行授权沿用，无重复询权限。

快速画廊/黄色＋及设置双标签已随[Mac26/Android16](../verification/mobile-home8283/README.md)交付；它们不含本轮新增同步。Mac27/Android17准确包已生成，实际原生验收仍待完成。API30模拟器、真实双App DOM、Store/socket、包身份与苹果整窗像素分别记账；硬件、多Android版本、真实WireGuard/EasyTier及原版像素不因这些层通过而自动通过。
