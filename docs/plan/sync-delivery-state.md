# 双端同步当前交付状态

更新：2026-11-06。供中断恢复；[正式规格](../architecture/sync.md)、[窗口协议](../architecture/sync-coordinator.md)和任务文件仍是行为契约。**完整同步目标 active，正在进行新隔离 Android 的实际运行验收。** 已交付 gallery83，不再重做快速首页。

最新状态：Android18/Mac28 已准确出包并通过[独立核包](../verification/sync88/native-independent/README.md)。三条 vh 回退修复了实际 API30 WebView 的设置页越界；Android18 实际设置面板现为360×568、y0，名称输入通过。final02/cycle11 的实际配对11步及 Android→桌面完整中文 document/plainText 已独立确认；桌面→Android 新笔记等待超时，完整目标仍 active。[独立证据](../verification/sync87-native/final-actual-independent/RESULT.md)保留原失败。当前须复用成功绑定的同一 DesktopPeer Store 做实时诊断；全局 pending1 不足以证明缺失的桌面笔记已入 inbox，关闭 peer 后的连接错误也不能倒推超时前网络状态。

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
| 87 最终实际 Android | **实际配对与完整上行通过；反向未通过** | 工作树 `/private/tmp/apple-notes-sync87-native`，作者 `/root/sync87_native_resume`；[final02独审](../verification/sync87-native/final-actual-independent/RESULT.md)。实际PNG选取/原字节保存及应用重开保持另有证据，媒体/导出/完整冷启仍待完成 |
| viewport88 / Mac28 / Android18 | 三条 CSS 回退已独审；准确包已独立核对 | 产品 `6553ef6f`，主线 `cb3bc1cf`；[准确新包](../verification/sync88/native-independent/README.md)，真实 Android18 设置几何已修复 |

主线后续工具整合的 notes9 与真实LAN21已恢复通过；最初LAN因root输出路径不符合准入规则而在启动前拒绝，原 failed 汇总保留，见[窄恢复记录](../verification/sync87/shared-tool-integration/README.md)。不把调用错误改写成产品失败，也不覆写成原运行通过。

## 当前准确产物和准入

- Mac：`artifacts/sync88/备忘录-Mac28.zip`，6,694,058字节，SHA256 `8199b8feeccc548a08d5921f4473b50f0156661a021bc29e41f0ead95f76aa2d`；ad-hoc、未公证。
- Android：`artifacts/sync88/备忘录-Android18.apk`，236,444,967字节，SHA256 `c2c5c2ce528c83cca9bc0a31740af3614ce778a529e51df7c5554dd31718bd5c`；arm64/API26+、debug签名/debuggable。
- 两端321项构建输入一致，准确源码 `2956f8fb49d8fd5b76cdcaa8de2be82126b8cfcb`；相比27/17仅产品 Preferences.css 三条vh回退。旧包保留，非本轮最终同步验收交付。
- 对端 immutable11：`/private/tmp/sync86-transport-build11/notes-current-attachment-transport`，SHA256 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`，产品 `cd334bc88513a89c490788d2e2e27c7967575f4a`，mode0555。旧可变 target 路径不得替代它；CSS回退不影响Rust输入。
- peer receipt `/private/tmp/sync87-peer-final11/receipt.json`，authority `root-sync87-peer-review`；Android18 receipt `/private/tmp/sync88-apk-final18/receipt.json`，authority `root-sync87-package-review`。均mode0600，已独立核包及root APK/ELF完整hash确认。

## 下一步

1. 保留 final02 成功绑定的 `/private/tmp/notes-sync87-native-final-02/desktop-peer` Store 和原失败。先窄审578e8af4的同Store重开工具，再用新5584同userdata周期采集实时安全状态、缺失合成笔记的精确入站计数，区分未送达与安全应用阻塞。
2. 按实际证据定位并修复必要产品边界，独立复核。完成双向完整document/plainText及PNG/WAV原字节/owner/实际解码；不重置、不重新配对、不伪造ACK或强制apply。
3. 继续真实provider多选/连续PNG/TXT/WAV、图片导出原SHA、前台重连、同data应用重开及冷启动身份/原字节保持。原actual-01含工具XML附件的失败现场完整保留，新formal02仅跟踪新合成笔记，旧笔记不删除。
4. 结束owned children后冻结安全证据，不同代理独审；更新最终使用说明与交付。真实验收未完成前不得 complete goal。

## 证据和资源保全

正式01双App业务39通过但Node未退出，实际定位为Chrome stderr被crashpad/updater继承；修复后另有driver TypeError失败，最终formal03完整自然退出。原件均在[DOM作者证据](../verification/sync86-dom-integration/README.md)，不能称早先是esbuild。当前引用媒体收敛已证明，SQLite附件行数4/2含本地未引用checkpoint，不宣称孤儿GC完成。

原TLS CryptoProvider panic、长持Session gate、PlanStale错误分类、locked resolve提交后旧Token、正文断言缺失等均有独立失败及修复证据，按准确源码和binary范围解释，不能追认旧版本通过。首个实际cloudflared在SIGTERM后8秒仍未退出，最后SIGKILL；第二个自然0。所有真实Rust进程自然退出与工具清理准确区分。

已正常清理完成的adapter/routes/DOM/package-review及较旧干净源工作树，分支/已提交证据保留，见[source-checkout-cleanup](../verification/sync87/source-checkout-cleanup.json)。当前native工作树保留；共享SDK、node_modules、主线target、84/85target保留，不并发借用target编译。根负责文档/派发/合入/主线整合与准确包，开发和独审由不同代理负责，不唤醒旧debug70。

## 原生实际验收进行记录（非完成收据）

- actual-01 首次stage01自然exit2/1.007秒。真实安装成功，原工具未兼容 `Performing Streamed Install` 及Android11的 `~~token` 安装父目录；最小工具修复 `febe6174` 经不同代理 `b8e1a7aa` 窄审（原20+独立45项host断言自然0）并已主线合入。没有产品修改或绕过installed完整hash。
- stage01-retry01 **实际自然0/19.919秒**：准确Android17安装/完整installed hash、直接画廊/黄色＋、原生tap新建、真实contenteditable焦点和系统 `mInputShown=true`、完整中文正文Store revision1保存。截图/HTML在 `/private/tmp/notes-sync87-native-actual-01`，后续结束owned进程后归档；此处尚不是独立设备最终收据。
- stage02首次自然exit2/8.555秒，未进入DocumentsUI。后续观察有CDP触摸15秒超时及UIA两个WebView矩形导致严格定位拒绝，尚不能据此判产品故障；原失败和截图保全，正在依据实际层级定位，不无条件取第一个。
- lifecycle01自然结束，完整外层exit0/624.453秒，owned emulator自然0、无signal；停止后guard正确拒绝无active emulator。同AVD/serial/既有userdata的reviewed lifecycle02已开始，guard下限不变。仅新5584，未碰原设备。

后续定位：cycle02在可用磁盘低于8GiB时触发reviewed保护停机（外层exit2/403.385秒）；installed hash mismatch落在保护停机的读窗口，首次读的具体bytes/SHA未被旧guard保存，不编造截断细节。未重新安装，须同data下完整installed hash再确认。根正常移除已完成63独审干净源码检出、保留branch/证据，64含untracked cache树未删；[清理记录](../verification/sync87/source-checkout-cleanup02.json)。作者和reviewer分别sparse无关历史verification检出，保留Git对象/分支/当前证据及全部产品输入，free恢复约10.39GiB。cycle03使用原data继续，guard下限不变。

原生工具后续精确范围：`febe6174`安装parser与`d27e18ca`宿主父子链已独审并合主线；原两链反例/修复证据均保留。普通输入/步骤/137一次只读重试在 `9c648b1f` 获独审核心PASS但发现home隐藏DOM误PASS和副日志任意message两个P2；`95aa2c3f`修复，经`7dd48715`独审4+14自然0关闭。共用readNativeUI和Recent/attachmentsOpen增量`176f3dcd`经`df37c287`独审8项自然0，仅工具scope。不冒称真实选取/保存/导出通过。以上后续工具源仍在native作者分支，主线已保全独审证据，等实际阶段最终接收。

截至cycle05：系统chooser打开与取消、Store无新增已实际通过；Downloads目录点击和Recent长按未证明选中，尚无PNG/TXT/WAV实际保存。旧错名`home-filled.png`是失败比例实验中的编辑页，不用于正式首页；`home.png`是真实有卡片画廊，最终须新`home-visible-final`正向gate。下一优先为Recent普通单选PNG→实际Store，避免多选阻塞基本保存。cycle05再次在<8GiB保护停机，原失败/未发生tap均保全；[第三批清理](../verification/sync87/source-checkout-cleanup03.json)正常删除完成且clean/无进程的63/68/69源检出，含untracked的64/66仍跳过，branch/证据/targets/SDK/所有data保留。cycle06同data、5584、reviewed guard继续，完整goal仍active。

cycle06已自然退出0/621.144281459秒。实际Images筛选有效、PNG行普通tap/hold仍未返回选择；经独立准入的正常TAB已使唯一PNG行获得真实系统焦点（自然0/3.455303708秒），随后的ENTER因周期已结束在guard处拒绝，未发输入。准确原始结果见[cycle06进展](../verification/sync87-native/native-picker-progress06/README.md)。最终picker-key工具`406c76f7`经独审`a99760d4`准入，含原始混合用户反例、真实foreground完整hash和严格字段计数复验；该审查只证明工具，不证明实际选取。继续同data下一周期TAB/ENTER，并独立推进真实设置配对与完整双向正文、桌面媒体收敛，原provider保存/导出门槛不删除。

### Cycle07与本轮恢复

cycle07已自然结束：外层0/618.949821708秒。真实系统Images筛选→TAB→ENTER已返回App，单PNG保存、原始read_attachment与实际HTML图片源70字节逐字节相同、SHA256 `5099baff37e3b6c8fb58023ec7c22d211544a060e6dde4276e4e84b4beffdac8`，实际解码通过；选择阶段自然0/22.477824209秒。独立只读回算已完成，正式完整原生结果仍待最终冻结归档。

两次真实connectDesktop配对未通过；attempt02的Node与修复stdin的外层wrapper均自然2，原第一次buffered daemon Fatal与原输出保留。尚未派发text/media，不能据PNG保存推断手机同步通过。`a4ac8b4d`的精确可见owner、同一已hash媒体读复用及真实目标聚焦经独审`71c6bbe8`准入，已随主线`1be8cb97`合入；原隐藏DOM与跨读反例保留。

2026-11-06恢复时实际ps无live qemu/lifecycle/native runner，不凭旧session或state文件重启。作者树clean `7038a648`：新增`90b3ff15`/`7038a648`固定pair步骤和脱敏焦点/viewport诊断待窄审，随后同userdata cycle08定位准确失败步骤，继续真实配对/双向正文/媒体/重开与冷启。原旧agent模型不可用，现由`/root/sync87_native_resume`唯一操作5584，`/root/read_private_tmp_sync87_review_resume_task_md`独立窄审；任务和共享状态位于`/private/tmp/sync87-{native,review}-resume-{task,status}.md`，用于绕过恢复后agent消息载荷无法解读的问题。原生最终独审尚待分派，不重跑已通过的全产品套件。

### Final02 与实际同 Store 重开诊断

准确Android18/Mac28构建与核包已通过，见[独审](../verification/sync88/native-independent/README.md)。cycle10实际设置几何360×568/y0与名称输入通过；首次Join只收起键盘未打开加入表单的原失败保留。正常输入工具 `25c5e65c` 增加实际IME存在时一次Back及真实表单等待，经不同代理 `9cea5a72` 接收，未注入DOM点击或重试业务动作。

root明确授权在同一userdata中新建独立formal02合成情景，原actual-01笔记/PNG/工具XML及所有失败不删除。formal02 runId `74da049123`，输出 `/private/tmp/notes-sync87-native-final-02`。cycle11实际配对11步通过45.458秒，Android笔记 `256cf1ef-b7c6-4c1e-a8ab-31cb5e6be460` 的完整中文正文/document已到桌面。桌面新笔记 `eac3b7e0-12cd-43cc-a1c0-2457e8cc4320` 存于桌面Store但未进入Android，反向等待40.881秒超时；[独审6cec3ac0](../verification/sync87-native/final-actual-independent/RESULT.md)保留准确部分结果。原peer自然退出0；不把之后出现的连接错误追认为超时前网络故障。cycle11生命周期自然0/620.839423291秒。

成功配对后的desktop-peer目录必须原位保留。重开工具578e8af4首次被独审证明新指令未加入协议入口；原失败[保留](../verification/sync87-native/reopen-independent/RESULT.md)。d0096346修复后经d687f1d8窄审准入，主线已整合：同一规范目录/DB身份、既有自然退出、原准确peerbinary；诊断仅有限枚举/整数/哈希，不重新配对或强制apply。

cycle12实际重开同一个已绑定Store通过，两个实时观察均显示Android idle、peer connected、error null、pending1，access无活动操作/挂起；桌面 listening/pending0，完整上行仍相等、反向目标仍缺失。当前尚无精确目标inbox/version计数，不将全局pending1等同缺失笔记。正在准备固定只读计数及真实事件/原处理器回复的被动观察；它们是诊断工具，不伪造事件或ACK，不放宽协议。

root因free低于8GiB又正常清理五个完成/clean/无进程的源码检出，branch/已提交证据保留；dirty65/67跳过。free恢复11,079,995,392字节，见[cleanup05](../verification/sync87/source-checkout-cleanup05.json)。AVD、数据、目标二进制、SDK及共享target未动，生命周期下限保持8GiB。

### 目标接收已证明，应用连续中止

cycle13/14的实际被动观察已排除“完全没有事件/缺少main窗口”：12秒内4次probe、4次prepare、4次release，真实窗口仅main；[release结果](../verification/sync87-native/native-abort-diagnosis14/README.md)为commit0/abort4。没有改写invoke/IPC/回调或发送观察者ACK，原始回复因Tauri invoke不可写而未观察。

实际get_data_management仅返回的rootPath为 `/data/data/com.local.notesclone`。最初计数工具错误加入files子目录导致FILE失败，修正后只读打开成功但SQLite JSON查询失败；原件均保留。a65a6853经独审接收，改为两个固定只读查询+Android org.json仅计数root kind/entityId；没有输出、复制或保存wire/body/config。cycle14实际得到 `inboxTotal=1,targetInbox=1,targetNotes=0,targetProjection=0,targetSeen=0`，1.7176秒、同app PID/startTicks前后未变、同一配对peer在线。**到此才证明exact目标已到达Android，但尚未应用。** 两查询顺序执行不声称原子快照；原先pending1推断不追认为早先已证实。

cycle14close晚于生命周期截止而被guard拒绝；peer finally仍自然0，但报告的frontendUnchanged=false原件保留。root此前误以为工具文件不在sourceFingerprint内，实际包括scripts/debug/**；不改写该失败。下一次同Store重开须独立核对精确旧/新manifest，证明变更仅已审count工具且真实前端/产品/peer依赖字节相同，再追加明确continuationproof。不能广泛忽略工具变化，更不能换Store或重新配对规避。

下一判别：7f0dcd0d工具通过固定Android18脚本SHA/函数位置的DevTools false条件断点，仅统计原始probe.blocked和prepare.ready布尔，不修改原函数/参数/返回、不暂停、不新增ACK。源码待独审后由唯一设备操作者实测，区分renderer主动拒绝与backend最终计划校验失败；未证明该工具实际运行前不选择产品修复。

## 用户原现场和范围

原Android约13秒未保存录音完全不碰：禁止安装、启动、停止、重启、读取、导出、备份原应用或旧AVD（含5580）。ADB显式5584，无默认serial，无kill-server。只用合成PNG/TXT/WAV，无真实mic；Apple Notes删除实验不做。已有直接执行授权沿用，无重复询权限。

快速画廊/黄色＋及设置双标签已随[Mac26/Android16](../verification/mobile-home8283/README.md)交付；它们不含本轮新增同步。Mac28/Android18准确包已生成并独立核包；实际反向同步及其余原生验收仍待完成。API30模拟器、真实双App DOM、Store/socket、包身份与苹果整窗像素分别记账；硬件、多Android版本、真实WireGuard/EasyTier及原版像素不因这些层通过而自动通过。
