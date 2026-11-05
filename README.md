# Apple Notes Clone

用 Rust + pnpm 构建的本地备忘录应用，目标为 macOS 与 Android。Tauri 2提供安装应用与原生窗口，React/Tiptap提供编辑器，Rust/SQLite保存笔记与附件。不接入iCloud。

**当前是可运行开发版，尚未达到原版全部UI、交互及逐像素一致，完整目标仍在进行。** 需求、UI、调研及原视频保全见[文档索引](docs/INDEX.md)和[参考资料](references/README.md)，细分状态见[交付计划](docs/plan/README.md)。

## 当前交付（2026-11-05）

本轮录音开发包为 **Mac16 / Android构建11**；两端来源不同，不能视为同一完整构建。Mac16源 `9167db94908ac635b026220e782878447c9e16a7`，包含浮窗/主窗右栏双模式与已保存录音播放修复；Android11源 `747a509bce96f72a23c2709493d7d50fe46aa53c`，另含手机录音完成保存的提交时序修复。它们仍属有限验收中的开发包。

| 平台 | 最新本机录音开发包（未纳入Git） | 已验证与限制 |
| --- | --- | --- |
| Mac16 | [ZIP](artifacts/unified-candidate06/mac-recording-presentation-build16/mac-attempt01/mac-sealed.zip) / [应用](artifacts/unified-candidate06/mac-recording-presentation-build16/mac-attempt01/mac-sealed.app) | 实际浮窗↔右栏及Notes内编辑/撤销重做/新建/搜索/加粗通过，但新采集被系统授权请求无返回阻塞；已有长录音正常重开后播放与±15秒通过。未完成新包采集中双模式验收 |
| Android构建11 | [APK](artifacts/unified-candidate06/android-recording-save-build11/android-attempt01/android-original.apk) | arm64-v8a debug；源码独审、准确离线构建/收集通过，尚未安装。用户选择保留原构建10的13秒未保存录音现场、暂不继续手机设备验收；不备份、不覆盖升级或停止原应用。11是构建编号，现有设备OS为Android11/API30 |

实包过程见[录音运行记录](docs/verification/recording-presentation55-runtime/README.md)和[Android11构建记录](docs/verification/unified-candidate06/android-recording-save-build11/README.md)。当前录音完整设备验收与原版像素一致性均未通过。

此前已有限接收的包为 **Mac14 / Android08**。Mac14固定构建源 `d9ce9c4b864c2d05bf3d2057ec48ae65fb868a46`，Android08保持 `182464bcc3055caadcd78fe4c7ce1a0ec31eea6a`。两端来源分别记录；[Mac14有限接收](docs/verification/mac-ordinary-keyboard47-root-acceptance.md)承接[上一批双端接收](docs/verification/typography-compose-keyboard36-root-acceptance.md)。

| 平台 | 当前本机交付（未纳入Git） | 本批已验证 |
| --- | --- | --- |
| Mac14 | [ZIP](artifacts/unified-candidate06/mac-ordinary-loop-build14/mac-attempt01/mac-sealed.zip) / [应用](artifacts/unified-candidate06/mac-ordinary-loop-build14/mac-attempt01/mac-sealed.app) | arm64、本地完整adhoc签名、未公证；普通Tab全选循环、OptionTab实际插入与撤销重做、侧栏两入口及显隐正常重启、浅色选中字改善 |
| Android08 | [APK](artifacts/unified-candidate06/android-compose-anchor-build08/android-attempt01/android-original.apk) | arm64-v8a debug；保数据覆盖升级、右下新建真实触摸、左侧plus取消、旧QA正文/标签冷启保持 |

Mac14当前系统导航关闭条件下的Tab/OptionTab故障路径已实际有限通过；系统导航开启、多窗和完整输入仍待验。干净补拍48支持全选及部分选中文字颜色误差下降，自然态相对Mac13完整图像零变化，字形、选区背景与全界面像素仍有残差。Android空白新建返回后计数9的条目继续保留，原版相同路径语义待证。

用户新增录音需求的重点是：录音时继续使用备忘录内的其他功能，包括当前A编辑/撤销重做、切换或新建B、搜索与格式工具，并始终保存回开始录音的A。[任务50](docs/plan/tasks/app-recording-interactions50.md)及[双模式55](docs/plan/tasks/app-recording-presentation55.md)已完成源码独审与整合：真实独立非模态浮窗、主窗右侧展开、同一会话连续切换；正文无阻塞遮罩，同时完善进行中卡、试听定位与安全关闭。不做听写或转写。这些变化已包含Mac16开发包，尚未进入此前有限接收的Mac14/Android08。用户[桌面截图](references/desktop/recording-20261105/user-recording-sidebar.png)已原字节保存；实际双模式采集与像素结论以运行记录为准，不能把代码或计时器当作实际收音通过。
原始移动端录屏已保存在 `references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4`。原版删除/恢复实验按用户要求暂停；Mac对比使用Computer Use，本批未增加系统截图工具权限要求。旧包、缓存及失败证据均保留。

## 早期交付记录

以下candidate03/04/05段落和后面的首轮实现、FIX记录保留当时上下文；其中“当前”“最新”“待验”均指各段记录时点。当前安装包和任务状态以上面的2026-11-05交付及交付计划为准。

2026-11-04双端基线为 **candidate04**，已保存Mac本地完整签名包和Android arm64 debug APK。本批包括暂停录音试听、OCR文字宿主接入及搜索零结果文字位置校准。Mac实际启动、搜索零结果恢复及单张本地图OCR插入/正常退出冷启恢复已有限通过；Android实际输入保存、系统选图OCR、新录音保存/强制停止冷启恢复及新旧录音播放控制已有限通过。完整运行与像素验收仍未完成。[构建记录](docs/verification/unified-candidate04/README.md)和[Android运行记录](docs/verification/candidate04-android-runtime-01/README.md)分别列明范围与限制。

另有仅调整宽三栏工具栏的 **Mac candidate05**，源码已独立审查，完整本地签名包已构建并保全，尚未启动。[构建记录](docs/verification/mac-candidate05-wide-toolbar-build-01/README.md)与[root交接](docs/verification/mac-candidate05-wide-toolbar-root-handoff-01/result.json)记录其独立冻结身份；切换旧包时Mac再次锁定，没有强制退出旧包。它不包含开发中的标签，也不替代Android candidate04的验收身份。

| 平台 | 本机交付文件（未纳入Git） | 已完成检查 |
| --- | --- | --- |
| Mac | `artifacts/unified-candidate04/NotesClone-mac.zip` | 完整本地adhoc签名，严格验签通过；未做开发者公证 |
| Mac宽窗候选05 | `artifacts/mac-candidate05-wide-toolbar/NotesClone-mac.zip` | 完整本地adhoc严格验签通过；尚未启动/界面验收 |
| Android | `artifacts/unified-candidate04/NotesClone-android-arm64.apk` | debug/v2签名通过；仅arm64-v8a；25个随包OCR模型路径、大小、SHA全部一致 |

Mac源码冻结为 `d8f832e83349c7503b872e0e88853d1ab7b0713a`，279项列明输入。Android恢复构建冻结为 `3d55dbaaa7e87e74629bce8dc6f42b6167968e7d`，原279项逐项相同，仅增加五个取图工具输入。两者是不同的完整冻结，应用/插件/配置/依赖字节相同；不声称共用一份完整构建身份。文件SHA与本机保全核对见[交接记录](docs/verification/unified-candidate04/root-handoff/result.json)。

Android前三次失败原样保留：本地socket限制、wrapper意外分发下载后停止、真实variant缓存键缺失。最终只读补充缓存复用既有相同AAR，通过完整114项外部依赖解析后正式恢复构建成功；未手改原缓存BTree、依赖或产品源码。[恢复构建](docs/verification/unified-candidate04/android-recovery-01/README.md)七类输入及额外RO缓存/环境前后核验通过，无新增下载提示，临时离线配置已安全移除。

较早candidate03的[Mac附件与正常退出冷启](docs/verification/unified-candidate03-independent-01/README.md)、[Android保留数据升级](docs/verification/unified-candidate03-android-independent-01/README.md)均只对应其本包，不直接追认candidate04。Mac真实录音仍无文件或可听性通过，权限线索见[只读诊断](docs/verification/candidate03-mic-preparing-diagnosis-01/README.md)。

最新[candidate04 Mac恢复与实际OCR持久化](docs/verification/candidate04-mac-runtime-recovery-01/README.md)已通过精确安装身份核验、零结果→清空恢复、三行中文实际识别/插入及正常退出后的完整正文冷启恢复。内部document/session ACK未独立追踪，未强制断网，不将结果扩大为首次离线、全OCR、录音或像素通过。旧candidate03仅对精确无响应测试PID发一次SIGTERM，未保存内存状态未知，不能记作旧包正常退出。

candidate04已完成[Android精确安装保全](docs/verification/unified-candidate04-android-install-01/README.md)及[独立运行验收](docs/verification/candidate04-android-runtime-01/README.md)：实际键盘输入、系统选图OCR、26秒新录音保存及force-stop冷启恢复，新旧卡片播放/暂停等控制有限通过，三条原合成笔记/旧附件和音频保持。root逐文件核验159文件6615140 B。OCR实际在原heading前插入、开头空段令标题变为默认值，识别器移除末行一个空格，均如实记录。网络未关闭、未验正常退出/像素/实际可听；新麦克风音频导出被自动审批拒绝，未执行解码和非零音轨检查。没有复制整份数据库或音频到主机。

后续用户明确授权该条测试录音到项目内指定路径的本地复制；新的[音频检查](docs/verification/candidate04-android-audio-validation-01/README.md)核对candidate04包和附件前后同SHA，完整解码26.46秒、单声道Opus48kHz及非零采样通过。信号峰值−80.93dB、RMS−102.55dB，不能算可听或有效收音通过；未试听、转写或上传。root逐文件核14证据200087B，旧拒绝及冻结运行记录原样保留。

原生比例PNG取图工具已通过[独立源码审查](docs/plan/reviews/tools-lossless-window-capture-static-01.md)，并从主路径编译为独立工具。[前置Mac有限观察](docs/verification/candidate04-mac-runtime-01/README.md)已能读取原版窗口，原生取图因缺现有屏幕录制权限明确拒绝，未生成PNG；旧包退出和新包未启动属于当时检查点，后续恢复结果见上段。历史与本轮CUA截图实际编码JPEG，旧字节保持，不用于无损像素验收。原版与本批的同条件整窗像素仍未通过。

尚未完成的范围包括全页面/菜单/手势与材质像素校准、真实可听录音与暂停试听的设备验收、绘画及附件完整预览、Android更广OCR矩阵、完整文稿扫描主流程、标签设备验收、智能文件夹/数学/笔记链接和标准格式导入导出。标签候选04已通过[独立源码审查](docs/plan/reviews/app-003-tags-static-04.md)，合入主分支b598a74并完成[主线整合回归](docs/verification/app-003-tags-main-integration-01/README.md)：合法保存快照、活动组字保全、结束后停车和归档边界通过。旧候选02/03失败证据保留；当前安装包仍不含标签，原生系统输入法及像素未验。具体通过子用例和缺口以交付计划与独立报告为准。

## 运行与构建

本机已使用 Node 22.16、pnpm 10.15、Rust 1.97.1、Xcode/macOS SDK 构建。先执行：

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test:rust
pnpm test:schema
pnpm test:editor
pnpm test:native-toolbar
```

Mac 安装应用的开发与构建：

```sh
pnpm mac:dev
pnpm mac:build
open src-tauri/target/release/bundle/macos/备忘录.app
```

应用标识为 `com.local.notesclone`，与系统原版 Notes 不同；请用上面的完整应用路径启动，避免打开原版。

Android 需要 Android SDK、平台 36、Build Tools、NDK、JDK 17 与 Rust `aarch64-linux-android` target。本机脚本读取 `ANDROID_HOME`、`NDK_HOME`、`JAVA_HOME`；未配置或旧 NDK 路径不存在时采用本机 SDK/NDK 27.2.12479018、JDK 17 路径。其他电脑应明确设置这三个变量。

```sh
pnpm android:init                 # 只在原生工程缺失时初始化
pnpm android:dev
pnpm android:build --debug        # 默认 arm64 APK
pnpm android:build                # release；正式分发还需配置签名
```

首轮 debug 安装包在 `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`。默认只含 arm64，文件名中的 universal 是生成目录名，不代表已包含所有 ABI。debug 包保留 Rust 调试符号，体积约 300 MB，尚未作为正式分发包优化。原生工程中自定义了媒体权限、系统栏避让与输入法 resize；重新初始化后需核对这些配置。

浏览器预览可用 `pnpm dev`，但会显示“浏览器预览”标记，数据放在单独的预览存储中。安装版始终通过 Rust 保存，浏览器预览不作为正式数据或平台功能验证结果。

## 本地数据

- Mac：`~/Library/Application Support/com.local.notesclone/`。
- Android：应用私有数据根目录（本次模拟器验证为 `/data/user/0/com.local.notesclone/`）。卸载应用会删除此目录。
- 数据库：`notes.sqlite3`，SQLite WAL；附件：同目录 `attachments/` 下 UUID 文件。
- 富文档保存为 Tiptap JSON，包含表格、清单状态、绘画笔画、附件引用；按笔记串行保存与 revision 检查，保存失败保留待保存内容并提示重试。
- 本地锁定使用 Argon2 派生密钥与 AES-GCM 加密正文；标题作为列表元数据可见。锁定时启用 SQLite secure_delete 并截断 WAL。当前含附件的笔记明确拒绝锁定。
- `.notesbackup` 为版本 1 的 JSON 归档，包含文件夹、笔记、设置及 Base64 附件；加锁笔记保留密文，其他笔记不加密。导入遇既有普通文件夹、笔记或附件 ID 时创建副本并重写引用，保留本机当前内容；系统文件夹复用。归档设置完整恢复，过期选中项按明确规则重置。导入先校验完整归档，以新文件和恢复日志发布附件，数据库失败或进程中断后按已提交引用恢复；不覆盖已有附件。当前未实现 Apple Notes 原生文件格式互通。
- 归档限制为单文件 256 MiB、单附件 100 MiB、解码附件总量 128 MiB、实体 10,000 项；JSON 对象树分配前还限制值总数和层级。富文档按实际 Editor 的节点层级、内容数量、格式标记和应用属性契约校验；默认属性可省略，无效结构会在写入前拒绝。`pnpm test:schema` 使用生产编辑器的共享扩展校验 Rust 清单与文档样例，依赖或扩展改变时会检测规则漂移。超限会明确拒绝。导出采用同目录暂存后替换，失败保留已有备份；禁止覆盖应用数据库和受管附件。

## 首轮实现范围

已编写 Mac 三栏壳、移动端文件夹→列表→编辑器导航、搜索过滤、列表/画廊、置顶、移动、最近删除/恢复、文件夹管理、明暗主题、结构化富文本、清单、表格、媒体附件、手写笔画、录音面板、本地锁定、备份与独立窗口。录音、相机和全部附件平台链路仍需独立验证，不以代码存在作为通过证据。

当前已执行的真实验证包括 Mac `.app` 与 Android APK 构建、Rust 临时 SQLite/附件/加密测试，以及安装后 Android 中文/清单/表格→强制结束→冷启动恢复→重开编辑器→系统返回的自动化回归。首轮结果见 `docs/verification/app-001-selfcheck.md`。归档可靠性修复新增真实坏归档、文件/数据库失败与六个进程退出点回归，原事务机制已由独立 QA 复核。文档 schema 补修已通过独立复核，冻结证据见 `docs/verification/app-001-fix-00-schema/`。FIX-01 新增同窗图库展开、保留选区的移动端格式面板、七种绘画纸张、短划线列表与块引用、表格转文本及仅新空白笔记的首次纯文本粘贴规则；当前 Rust 测试为 16 通过、1 个子进程专用 worker 默认忽略（可靠性测试实际启动六次），另有 65 例真实前端 schema 对照，以及真实编辑器状态/历史的表格转换边界与一次撤销回归。新 Mac 与 Android 安装产物及开发者证据见 `docs/verification/app-001-fix-01/selfcheck.md`，FIX-01 待独立验收。

安装 debug APK 后，可重跑设备回归（会在克隆应用中新增一条测试笔记，不触碰系统 Notes）：

```sh
ANDROID_SERIAL=emulator-5580 node scripts/android-smoke.mjs
```

该脚本通过 Android WebView 的本地调试接口执行真实 UI 输入，读取 Rust 工作区作断言，将截图与文档证据保存到 `artifacts/android/smoke/`。不依赖 REA，适用于本机旧 Chrome 91 WebView。

FIX-01 独立验证发现旧 WebView 在真实键盘显示时遮挡格式工具栏；修正 Android 原生 IME insets 后，`node scripts/android-ime-regression.mjs` 使用 adb 原生触摸、系统键盘 Enter 与 Back 回归，调试接口只读取证。新证据见 `docs/verification/app-001-fix-01-ime/`，原 FIX-01 的 DOM 点击脚本不作为工具栏实际可触达的通过证据；本修正仍待独立复验。

格式面板打开时隐藏键盘附加栏，正文直接接面板自身标题与关闭按钮；X 返回键盘后恢复附加栏。独立 P2 发现与补修取证见 `docs/verification/app-001-fix-01-format/`，该补修仍待独立复验。

移动端纸张页进入时明确收起系统键盘并冻结底层正文，保留同笔记选区；取消、选样或关闭后恢复编辑能力，键盘保持隐藏。入口补修的原生触摸证据见 `docs/verification/app-001-fix-01-paper/`，待独立复验。

FIX-03将本地锁授权统一放在Rust进程会话，设置锁/关闭全部锁/删除/移除锁/导入前先通知所有真实窗口冻结并排空已登记保存，成功ACK后才提交。保存冲突、未确认内容、超时或窗口消失时取消操作并保留待保存编辑。成功后销毁对应编辑器与历史，旧读取/保存响应不能回填正文；启动和重新聚焦先遮挡旧内容并同步，同步失败继续遮挡并允许重试。拷贝/分享正文取实时Rust授权来源，已经由用户交给系统的副本不在撤销范围。正确密码解密后也复用真实文档schema和应用属性校验，合法旧富文档/绘画保持，非法密文正文拒绝发布钥匙。检查使用`pnpm test:access`、Rust临时数据库测试及单列Mac真双窗/测试适配器证据，生产与测试构建分开记录，当前仍待独立验收。Mac窗口菜单注册系统Window角色以提供真实窗口切换列表。

跨窗冲突时保留本窗口未保存内容，后台同步和普通“重试”均不能把旧正文重基线覆盖另一窗口的已确认版本。普通无附件笔记可明确选择“将本窗口内容另存为新备忘录”，真实持久成功后才释放原待保存内容；锁定或含附件笔记暂不支持冲突副本恢复，会保留内容并提示保持窗口打开。此恢复行为属于当前工程契约，仍待独立复验与原版交互对齐。

FIX-02 已把 Mac 主窗和独立窗顶部接入本地 AppKit 插件，使用真实原生搜索、系统符号和菜单；成功绑定后替换网页顶部，分栏与原生顶部共用实际宽度。该批Cmd+N、Cmd+F、Cmd+Shift+F由原生菜单定向到聚焦窗口，编辑命令恢复对应笔记的有效选区。新增原版证据已纠正目标：全局搜索应为Option+Cmd+F，项目源码已在444f03b最小更正，实际新包待验；历史续输通过不代表快捷键一致。源码、真实 Mac/Android 构建指纹、控制器回归与有限 GUI 自检见`docs/verification/app-001-fix-02/selfcheck.md`。原版/克隆顶部RGB对照仍未通过像素一致。Android长时间组词历史P1与诊断保留在`docs/research/android-ime-diagnosis/analysis.md`，后续FIX04有限修复与当前归因见最新计划，不将旧包状态当作最新候选结果。

## 早期已知缺口记录

下列条目保留早期实现边界；标签、智能文件夹、侧栏等后续进展以当前交付和交付计划为准。整窗像素、完整交互及真机覆盖仍未完成。

- Mac 顶部已使用原生控件和 SF Symbols；字形、中文格式标签、控件内部位置、材质、侧栏间距和画廊卡片仍有实际像素差异。网页内容区域仍含 Lucide 图标。图库双击同窗展开与返回已接入原生顶部，尚待独立验收。
- 移动端格式面板已改为替代键盘的底部面板，并按录屏排列七种纸张；整体尺寸、系统选择菜单、手势动画和图标仍需逐帧对照。X 恢复键盘与 Android Back 关闭面板并收起键盘属于项目交互约定，录屏没有证明这些触点。
- OCR文字宿主已接入candidate04双端，Mac和Android单张本地图实际识别/正文保存/冷启有限通过；Android使用force-stop，实际插入位置/标题与识别空格差异已记录。其他识别情况未验收。完整文稿扫描主App流程、转写、标签、智能文件夹、数学结果、笔记间链接、PDF/Markdown等格式导入导出仍未完成；相应需求F17–F19保持未完成。
- 清单自动归类/段落折叠、附件浏览器和原版菜单完整性仍有缺口。
- Android 仅已测现有模拟器 Android 11 / Chrome 91 / arm64；真机、多尺寸、输入法组合输入与新版 Android 的系统栏仍需覆盖。iOS 未建立可运行产物，不计入已交付平台。

原版参考素材和应用数据请分开管理。原始用户录屏已保存在 `references/mobile/original/`，该目录与构建产物按 `.gitignore` 留在本机，不提交到 Git。
# FIX04 Android composition status

FIX04 固定 `prosemirror-view@1.42.9` 并通过 `pnpm-workspace.yaml` 应用受控补丁。正式 Android 编辑器才启用真实组词保护：候选停留跨过原 5000ms 闲置回退时，仅在实际焦点、原生组词信号及预编辑文本节点仍有效的情况下保留该节点。默认关闭，Mac/浏览器不启用。恢复契约检查为 `node scripts/check-android-composition.mjs`，使用测试替身，不替代真实输入法验收。

开发实测长候选空正文约199秒、正文中部约20秒、快速候选、逐键取消与连续中英输入有限通过。随后4998e2b独立复验空段73.53秒/中部77.80秒、快速/删除/同Trime混输及一次冷启完整JSON六条通过，详见`docs/plan/reviews/app-001-fix-04-01.md`。原格式/后台可见及保存观察保持，FIX06新增普通平台同现证据与限制见`docs/plan/reviews/app-001-fix-06-platform-01.md`，不能将残留字符串直接归为应用独有错误或要求字符串回滚。旧包选择纸张保存失败转FIX07，e117也实际复现；之后5c46536/APK5dd6dfc8的原选纸失败点已独立有限通过，见`docs/plan/reviews/app-001-fix-07-android-02.md`。整体手机输入与像素一致性仍未验收。
