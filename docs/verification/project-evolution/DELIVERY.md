# 项目演进：实现、交付与后续建议

2026-11-17。产品源码固定于 `96f518ee8d174da10c132f009d1bb5f4dc3d5d2c`，源码指纹 `da00809888d9144e60217daa8438e64163953cd620e4769bfba12027401a30d6`（1743 inputs）。最终文档提交晚于该构建，不改变产物实际源码身份。实现边界、协议与布局规则分别以架构/UI文档为真源；此页记录最终运行和余项。

## 可用功能和入口

- MCP：`crates/notes-mcp` 使用官方 rmcp 3.10.0，经 stdio→私有 IPC→桌面宿主同一 Session/Store；不是第二个数据库写入器。设置→Agent 接入可启停、按物理目录授权读取/新建/更新、撤销并复制配置。用法见[Agent指南](../../agent-usage.md)，完整字段见[接口契约](../../architecture/agent-mcp.md)。
- 九工具：`notes_get_capabilities`、`notes_list_folders`、`notes_list`、`notes_search`、`notes_read`、`notes_create`、`notes_append`、`notes_update`、`notes_get_operation`。追加/更新使用 expectedVersion CAS，三类写入均使用 UUID 幂等键，保护当前编辑目标；锁定、回收站与未授权内容不暴露。
- 外观：Classic、Paper、High Contrast，分别支持系统/浅色/深色；配色、字号、导航布局、集合视图和密度独立建模。`src/themes` 集中语义token，`AppearanceV2`严格迁移，设置确认成功后发布。
- 呈现：桌面三栏/两栏/专注与列表/画廊，三档密度；移动列表/画廊，两档密度。设置→备忘录提供布局/集合/密度；`PresentationV1`和唯一resolver驱动永久Shell槽位，共用EditorSession/保存队列/录音owner。Android原生身份不因横屏或IME尺寸变成桌面。
- 交互：五档字号贯通、窄屏卡片动作收敛、分栏几何/键盘/取消、画廊键盘打开、设置失败保持；主题/布局不通过更换Editor key重建正文。

## 最终构建与身份

产物目录：`artifacts/releases/20261117-project-evolution/`。

| 产物 | 入口 | 核验 |
| --- | --- | --- |
| Mac arm64 | `CyberNote.app` / `CyberNote-Mac.zip`、`mac.json` | 默认生产构建，实际入口及包内metadata/runtime已独核；ad-hoc签名，未公证 |
| Android arm64 | `android/CyberNote-Android-arm64.apk`、`android.json` | 非debug包，最终APK提取so/资源核验；沿用本地Debug证书，不是商店签名 |
| MCP macOS arm64 | `mcp/cybernote-mcp`、`mcp.json` | 最终路径文件签名/摘要、SDK/lockfile/工具schema与真实harness核验；源码stamp为外部manifest，没有伪称嵌入 |

保留字体OFL、MCP第三方许可与实际依赖来源。Windows/Linux适配器未构建验收。桌面保持运行才能调用；Android不提供MCP宿主。DeepSeek由所用harness配置stdio，当前实际验证的是Codex CLI 0.167.0，不推断全部harness均已实测。

## 真实业务验证

1. 最终Mac应用内生成授权，最终签名adapter经真实Codex公开RPC执行九工具：107次调用，87个成功响应、20个预期拒绝响应；不是107次成功写入，也不是模型推理质量评估。
2. 新建/读取/追加/更新精确往返；并行CAS仅一方成功；原幂等回执/operation跨普通重启不变，变参同key拒绝；撤销、关总开关、关后重启、重启恢复权限均实测。锁定内容即使只在本地解锁仍不向agent暴露；create-only授权可新建/查本次operation，不能读取。
3. 20,000节点/779,987 canonical UTF-8字节真实create/read/update/read精确一致，20,001节点拒绝；当前活动编辑目标返回NOTE_BUSY而不覆盖正文。
4. 主窗/同笔记子窗实际显示MCP追加与文档更新；原生编辑、Undo、Redo和关闭保存保留结果。最终release没有debug ACK，视觉结果不冒充内部generation/ACK顺序证据。
5. 同一物理Mac两个独立资料库A/B与owned Android C手工配对（C经精确ADB reverse）；三端公开备份离线独核完整document、13共享字段、附件metadata/ref及PNG原字节相等。PNG为3167B，SHA256 `9257d9518c14c11097c340c087da89671ebc4e6096f9cae53896bf1310e93786`。不是账户同步、物理LAN、全媒体矩阵验收。
6. A/B实际停止同步后Agent仍本地create/append，B原生保存另一篇；B侧采样距其保存99.623秒仍无A新笔记，A侧距B保存59.179秒的观察亦无B新笔记，不宣称双向连续监控同等时长。B正常重启保留正文和停止偏好；恢复同步后双方显示完整对端正文。本补项只覆盖A/B暂停，不推断C暂停。

## 命令与单元验证

- 最终源码`96f518ee`实跑`cargo test --locked --offline --manifest-path crates/notes-mcp/Cargo.toml`：15 passed / 0 failed，exit0；嵌套stdio fixture另有16项通过，不与Cargo总数重复相加。
- Native定向19项：真实agent service11、WK profile3、presentation2、settings/archive3。使用近期`e5e66193`成功记录，已核到`96f518ee`仅六个docs变化、产品指纹及1743 inputs相同；不是声称本批重跑19项。
- 前端组合：typecheck/token、App108及9-path、reviewfix9、真实Store2、交互90、主题376（102状态/1959文字对/0失败）、AgentSettings12组、实际Preferences→Agent17。记录对应`e5e66193`同产品源码，不把它们重复计为最终native UI测试。
- [最终命令汇总](../../../artifacts/releases/20261117-project-evolution/command-verification/summary.json)、[Adapter日志](../../../artifacts/releases/20261117-project-evolution/command-verification/adapter-cargo-test.log)、[native19等价依据](../../../artifacts/releases/20261117-project-evolution/command-verification/native19-reference.json)。本轮没有重跑无变化全量native400/网络/64MiB；默认Clippy存在基线account never_loop，不能称全仓检查全绿。

后续命令复验入口（按变化选相关项，避免与打包任务并发占用同一target）：

```sh
pnpm typecheck
node scripts/generate-theme-tokens.mjs --check
cargo test --locked --offline --manifest-path crates/notes-mcp/Cargo.toml
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib agent_service::tests::
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib webview_profile::tests::
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib store::archive::tests::evolve115_
```

离线命令要求依赖已缓存；原生编译用自己的`CARGO_TARGET_DIR`串行运行，不复用正在打包的target。真实harness业务调用还需要运行桌面宿主并通过设置页授权，不能用测试fixture冒充用户资料库接入。

## UI验收移交与既有边界

用户于2026-11-17明确“UI 测试交给我来完成，重点用命令来测试功能和单元测试”。因此本轮交付门槛调整为源码实现、命令/单元/协议/真实宿主数据路径与产物身份核验；不再继续UI自动化，不用未执行UI项阻塞命令交付，也不将其标为PASS。此前已做的原生观察仍按实际环境保留。

准确Android非debug APK在owned API36/Trime已观察到实际中文候选提交、保存及force-stop冷启保持；主题、字号、格式面板、横屏和窄屏等记录以Android报告逐项为准。模拟器320dp不等于直接测量320 CSSpx；截图不证明PM内部composing span或控件对象身份。Samsung/WeType历史失败和物理Mic/触控路径不因本轮有限记录关闭。Mac实际主/子窗口刷新、Undo/Redo及正常退出持久化有原始证据，不扩张为全主题/全部输入法通过。

**保留一个实际UI问题（NATIVE-BACK-01 / P2）**：owned Android在320dp列表更多菜单打开时，一次系统Back使应用自行退出（EXIT_SELF/status0），随后正常启动恢复；尚未重复复现或定位，不称崩溃、不声称丢内容或已修复。用户手测优先核菜单打开/关闭两种Back行为。

用户手测建议：

1. 桌面：三栏/两栏/专注、列表/画廊与密度，键盘打开笔记、分栏键盘/拖动取消；切换主题/布局前后核对正文、选区、滚动和Undo。
2. 移动：首页列表/画廊，五档界面/正文字号，窄屏全部动作和安全区；主菜单、长按、返回的层级与焦点。
3. 输入：实际常用中文IME的长组字、选候选、Undo、键盘显示/隐藏及旋转；长按选字时格式面板保持，手动关闭后焦点/键盘恢复。
4. 媒体与手势：横屏/分屏中的音频卡、录音owner与保存，边缘返回与表格横滚、选字、速绘双指缩放竞争。
5. 外观：Classic/Paper/High Contrast × 浅色/深色/跟随系统，启动、设置、菜单、独立窗、附件预览；重开后偏好保持。AppKit仅核实际支持投影，不要求任意CSS配色。

测试使用本批准确产物，反馈附平台/系统/IME、包源码标识、操作步骤、预期和实际结果；避免将历史包的问题覆盖到本批。

## 建议的后续优先级

| 优先级 | 建议 | 完成标准 |
| --- | --- | --- |
| P1 | 整理性能基线与数据订阅 | 测1k/10k笔记后，把列表摘要/分页与按需正文分离；测量搜索、首屏、滚动，再决定中文索引/虚拟化 |
| P1 | 补实际设备与复杂输入矩阵 | Samsung/WeType、Mac中文IME、组字中旋转/分屏/外部写、物理触控与硬件采集分别验证，不以API36/Trime一次成功关闭历史缺陷 |
| P2 | 修复手工同步1970时间显示 | last_success为Unix秒，显示边界转换成毫秒；不全局改Date函数/协议时钟。已有基线同代码，非本轮新增回归 |
| P2 | 继续拆App职责 | workspace摘要/订阅、页面装配逐项提取，保留Session/保存队列/录音owner单一；不先搬整个Store或另建notes-core |
| P2 | 扩展Agent能力 | 软删除/恢复、受管附件、富文档局部编辑分别定义scope/CAS/文件提交边界；后台宿主及远程HTTP/OAuth独立阶段 |
| P2 | 扩展主题生态 | 先支持有界、版本化token JSON和对比度校验，不加载任意CSS/JS；AppKit仅声明实际支持的明暗/尺寸投影 |
| P2 | 检查入口治理 | core/UI/native/release分层；默认Clippy既有account never_loop另任务修，不称全仓Clippy绿 |

原始驱动失败与纠正说明均保留。历史安装包/原机/日常资料库未被替换或删除；本轮只操作隔离测试资料库及owned AVD。

## 证据入口

- [最终构建与三产物摘要](../../../artifacts/releases/20261117-project-evolution/final-build-summary.json)、[Mac manifest](../../../artifacts/releases/20261117-project-evolution/mac.json)、[Android manifest](../../../artifacts/releases/20261117-project-evolution/android.json)、[MCP manifest](../../../artifacts/releases/20261117-project-evolution/mcp.json)。摘要是publish前快照，`publishExecuted:false`保留其真实时点；后续[final verify回执](../../../artifacts/releases/20261117-project-evolution/final-verify-receipt.json)和[publish回执](../../../artifacts/releases/20261117-project-evolution/publish-receipt.json)均exit0。自动publish只更新双端包表，MCP使用独立manifest与README入口。
- [真实宿主报告及安全归档](../../../artifacts/releases/20261117-project-evolution/business-verification/mac/report.md)、[107调用记账](../../../artifacts/releases/20261117-project-evolution/business-verification/mac/rpc-call-inventory.json)、[三端重算](../../../artifacts/releases/20261117-project-evolution/business-verification/mac/post-mcp-ABC-readonly-recheck.json)、[暂停/恢复](../../../artifacts/releases/20261117-project-evolution/business-verification/mac/local-pause/acceptance.json)。
- [实现/组合验证状态](README.md)保留每个模块、独立审查与原始失败；最终包的业务证据不回写成所有历史测试均在本批重跑。

- [最终独立命令/数据证据复核](../../../artifacts/releases/20261117-project-evolution/business-verification/independent/review.md)：前轮360+12与差量143项离线证据核验、17新增/107累计真实调用；这些是证据检查，不是新增产品单元测试。UI问题与未执行项保留。
- [Android既有结果与待手测项](../../../artifacts/project-evolution/android-isolated-20261116T203629Z-dc8cf7db/release-native-20261116T225616Z-ec67e8/android-final-report.md)、[owned环境正常清理](../../../artifacts/project-evolution/android-isolated-20261116T203629Z-dc8cf7db/release-native-20261116T225616Z-ec67e8/final-owned-cleanup.json)：两测试Mac正常退出，Android reverse精确移除、显示/旋转恢复、emulator正常exit0及端口释放；隔离库与AVD保留，既有5037服务未重启。
