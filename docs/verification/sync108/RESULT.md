# 当前源码同步验收结果

日期：2026-11-12，macOS 26.4 / arm64，三星SM-G9500 / Android9 / arm64。用户要求的工作区整理、同步实现阅读、双桌面独立数据目录、少量ADB安卓三端实测已完成。完整双桌面最终run07为35项通过，三端run05为4场景通过。早期失败与后续更正分开保留。

[最终独立审阅](../../plan/reviews/app-sync108-final-independent.md)接受这两次正式结果，确认三项工具P2关闭，当前审阅范围没有新增P1/P2阻塞。其独立核验覆盖450项源blob与分帧指纹、实际执行工具、DB/WAL内存重建、完整正文/原附件、续测身份、清理receipt及归档哈希；结构化证据保存在 [independent/](independent/)。这属于独立只读复核，没有冒称另一次设备运行。

## 产品调整与实现结论

同步链为真实React编辑器→Session/SQLite→版本向量、heads/inbox→Noise加密WebSocket→对端真实quiet协调与正文/附件提交。附件按原文件SHA验证，配对后的workspace一致而各端device独立。此次实际场景未确证需要修改版本向量、网络同步或冲突算法；没有为通过测试更换这些实现。

已补齐桌面启动边界：`--data-dir /绝对路径`，规范化目录、进程生命周期持有的排他文件锁、不同数据根派生的媒体缓存和asset读取范围。缺值、相对/空路径、重复/未知参数在打开业务库前拒绝；同目录及其别名第二实例拒绝，原实例退出后可重新打开。未传参数仍用平台默认目录，Android使用应用沙箱。用法见 [sync-usage.md](../../sync-usage.md)。

## 实际结果

| 层次 | 本轮结果 | 证据 |
| --- | --- | --- |
| 原工作区回归 | typecheck/build、schema96、编辑器/工具栏/构建身份/版本、画廊及菜单/表格/视频定向检查通过 | [工作区检查](WORKSPACE-COMMITS.md) |
| Rust | 作者完整227通过、4项既有ignored；同步网络harness23通过；独立启动9通过 | [启动独审](../../plan/reviews/app-sync108-startup-independent.md) |
| 原生启动 | 两目录同时启动、同根/别名拒绝、退出重开、参数/路径/缓存隔离检查通过 | [startup](startup/README.md)、[startup01](startup01/README.md) |
| 两个原生桌面App | 最终run07完整35项通过；四个owned PID均自然exit0，无协议失败/强制信号 | [最终桌面结果](desktop/DESKTOP-RESULT.md) |
| 三端 | 最终run05四场景通过，原run02的A/B数据根和A/B/C身份保留，非清库重配 | [三端结果](three/README.md) |
| 浏览器定向复验 | 启动17桌面＋4移动；同步设置桌面/移动各56通过，清理后才写通过结果 | [浏览器结果](browser/README.md) |
| 工具故障回归 | Node17通过：原生驱动12、Android独占锁2、浏览器清理3；Python启动清理另5通过 | [Node记录](tool-tests.json)、[Python记录](startup01/tool-only-cleanup.json) |

双桌面覆盖已有笔记合并、双向中文完整document/plainText与格式、普通/智能文件夹、标签/置顶/移动/纸张、双向附件原字节、图片解码、删除恢复、离线重连、并发冲突确认保留全部、同根重启身份与待同步保存、重复同步幂等。退出后只读DB/WAL/SHM副本：两端integrity均ok，notes=6、attachments=3、projection=8，inbox/dirty=0；projection一致，原数据库/WAL/SHM文件hash前后未变。

三端拓扑为B↔A↔C，B/C不直连，手机通过本轮owned ADB reverse访问A。四场景分别是A→B/C格式正文与PNG、C真实UI新建→A→B、B→A→C普通文件、C后台进程回收并正常重启后的自动补齐。比较完整document/plainText、正文附件引用与完整原文件长度/SHA，手机实际打开编辑器核对document；没有只看标题、数量或连接状态。PNG为3677 bytes、SHA256 `3cab9ba707426dcea5e90bc86e8e90db7998a45c2f92e0bd65d040c800ae823a`；普通文件298 bytes、SHA256 `932b45ce935d2d7efef0b5d83bf36d18cc323f62baa60a02691afb596dce0277`。

## 构建与真实边界

最终桌面测试binary SHA256 `771bed664a3793938b7dc18d6dd07a4cbb63cb088808174c44062d2fb49fd723`；450项产品输入指纹 `e0718b71cde5440dce56d62ca43416891da77fe8db4f696fe5bf770455381b00`。主工作区产品文件与冻结构建根逐字节相同。静态debug前端沿用既有构建，摘要 `ac755157f95eebd047f0f2830c0877abcecb72780f5f1ec5036d77be4fa82dc6`；其内嵌build-info较早，报告没有把它冒称最终Rust源的一次重新前端构建。新Ready模块由真实native PageLoad Finished门控，继续等待实际App idle与启动层解除；没有固定延时放行、修改inert或伪造保存/quiet ACK。

原生驱动只在 `sync-e2e`＋`debug_assertions`＋desktop编译条件且 `NOTES_SYNC_E2E=1` 时启用，通过owned进程stdin调用真实WebView/App处理器，无生产IPC命令或额外网络后门。默认debug及release排除是明确compile cfg；本轮没有另做release编译。桌面文字是语义处理器，附件是合成FileList进入真实保存管线，不宣称物理键盘和系统文件选择器实测。

安卓为独立 `com.local.notesclone.sync108` 测试包，APK SHA256 `e13efeefefa45752388218ebb91466f5c8253278810384d54e9b815dce440af5`，准备基线447项产品指纹 `f34853c6cf8687b880ab0c088085b4af89e2ae8a695bbce7f0cac88c96e9dc84`。新增桌面startup/测试模块与Android构建配置差异分别记录，不能称同一binary或完全相同平台构建。测试包写入使用真实CDP Input；IPC仅只读观察。原正常应用未读取、停止、覆盖或清数据。

DESK-11只证明目标编辑器打开时真实prepare/commit与恢复可编辑；没有确定制造本地保存/IME合成和远端提交重叠。该加强时序用例明确为部分覆盖。局域网发现、VPN/防火墙、长时间后台常驻和所有异常网络组合不在本轮范围。

## 失败、工具更正与保全

原生早期轮次保留disabled身份断言错误、错误忽略WAL、Ready超时等失败；三端早期保留新建导航和Ready失败。修复的是测试工具的身份前置、导航归属、生命周期等待、WAL取证和最终通过计算。浏览器font gate相互等待、reset未等启动层解除、过时的统一44px断言也均保留原始失败。没有用旧轮部分通过替代最终完整结果。

工具独审指出的native shutdown尾帧fatal、Android重复close删后继锁、浏览器通过JSON早于cleanup均已补最小修复与反例检查。原工作区静态审阅另记录的媒体HTTP超时、Mac外部附件副本预算和大附件准备风险仍为本轮范围外开放项，不宣称已修复。

测试binary和APK保存在主工作区ignored `artifacts/sync108/`，不提交大产物或数据库。测试数据、原失败与证据保留；原生App退出、ADB映射/连接清理逐项见各运行报告。仓库没有Git远程地址，本轮提交保存在本地main，未推送。
