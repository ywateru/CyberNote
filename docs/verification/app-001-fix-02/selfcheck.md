# APP-001-FIX-02 开发者自检与候选冻结

2026-11-03。正式 Mac 宿主已接入原生顶部插件；这是待独立复验的候选。**像素一致明确未通过，Android 长时间中文组词 P1 仍存在。** 此记录不替代独立验证，不表示整应用通过验收。

## 身份与构建

实际输入清单为 [source-inputs.json](source-inputs.json)，89 个源文件/配置的 SHA256 有序聚合为 `45e6b4a386580e49351b0b1a755e06922f1a9c8119479b53fe4c40fa892dd73a`。以既有生产清单为起点，补入真实宿主/插件及 Android 原生配置；构建期间父任务有文档提交，因此以输入字节冻结，不声称整个 HEAD 与二进制可重现映射。产物完整路径、大小和 SHA256 见 [artifacts.json](artifacts.json)。

| 产物 | SHA256 | 状态 |
| --- | --- | --- |
| 正式 Mac notes-clone | `4118f77f25ca990eb06b8e9d02c59c7da4bcc59af7d18ca559524e3db6ad88b6` | `.app` 内与 release 可执行文件同 hash；实测 PID 80986、主窗 66690 |
| Android arm64 debug APK | `0aac2d7390e6369841c34c0b7359600f57ea978d1d63534cbdd1214ca52071c4` | 300,954,018 bytes；本轮构建完成，新安装独立 smoke 待执行 |
| FIX-04 已知失败基线 APK | `44b6b16d8b6afdb19f08d1a7eafb733a760deba61870339090e6da598f9082d5` | 旧 final20 原字节另存 `/private/tmp/notes-final20-ime-baseline-44b6b16d.apk` |

Mac 使用 `com.local.notesclone`，真实主应用路径为 `src-tauri/target/release/bundle/macos/备忘录.app`。最终 release fingerprint `notes-clone-29a7fa566064265e/bin-notes-clone.json` 的 features 为 `[]`，时间 18:39:46，与 release/bundle exe 时间相邻；没有使用 access-boundary-proof 测试功能。之前的 proof fingerprint 仍在构建缓存，不能将它误当当前产物。独立插件示例没有用于正式宿主取证。

主应用 Cargo.lock 仅新增本地 notes-ui 包，dialog 2.8.4 / fs 2.7.1 / rfd 0.17.2 保持。插件构建依赖及独立锁由 tauri-plugin 2.6.3 对齐到宿主已有 2.7.2。本轮修改了 toolbar.m 搜索祖先显示生命周期；既有 9f4d61b 插件报告不覆盖新输入，必须独立复审。

## 已运行检查

| 检查 | 实际结果与范围 |
| --- | --- |
| `pnpm typecheck`、`pnpm build` | 通过；生产 Vite 构建仅有已有大 chunk 提示 |
| `pnpm test:native-toolbar` | 12 通过，运行生产控制器与投影；早到事件、语义去重、串行合并、搜索 ACK 竞争/缺失事件/composition、旧身份拒绝、销毁异常清理、有界错误、各布局与表格状态 |
| `pnpm test:access` | 16 通过；不等于新增原生事件的全 GUI 授权竞争矩阵 |
| `pnpm test:editor` | 65 个 schema corpus 及真实编辑器表格转换、选区、Undo/Redo 边界通过 |
| 主应用 `cargo check --offline` / `cargo test --offline --locked` | 通过；29 pass、1 默认忽略的专用子进程 worker（可靠性测试实际调用 worker） |
| 插件 `cargo test --offline --locked --lib` | 10 pass；使用共享 target 编译新的 2.7.2 与 Objective-C 输入 |
| `pnpm mac:build` / `pnpm android:build --debug` | 真实构建完成；Android 构建需本地打包连接权限，重跑后成功 |

## 有限真实 GUI 自检

原版为本机 Notes 4.13 / macOS 26.4。UI 操作通过 CUA，窗口元数据另用只读 helper 读取，不读取用户正文。测试使用合成文件夹与合成笔记；用户可能在旧 Timing20 测试笔记内手动操作过，未删除或重置该内容。

早期候选 `59c4a48…` 的实际原生搜索在输入、ACK 或 focusSearch 响应后失去 field editor，列表仍能过滤。失败截图和记录保留在 `runtime/initial-search-focus-failure.*`。发现 layout 先隐藏所有组再显示当前组，information 也触发布局；已改为只在末尾隐藏真正未使用组。中间修正候选的 `search-ack-continuation.ax.txt`、`native-format-open.png`、`native-format-bold.ax.txt`、`gallery-browse.png` 只作为当时观察，不能假称全在最终 exe 上采集。

| 实际动作 | 观察/证据 |
| --- | --- |
| 最终构建 Cmd+Shift+F，输入“每日”，重复快捷键后追加“ TODO” | 最终 query 为“每日 TODO”，2 条真实匹配，原生输入仍聚焦；`final-search-query.ax.txt` / `final-search-continuation.ax.txt`。最后清空搜索恢复文件夹 |
| 原生搜索获焦时 Cmd+N | 创建真实新笔记，转回编辑区域；当时修正候选观察，最终复验仍需覆盖 |
| “FIX02 原生工具栏”笔记选择 ABC，原生格式菜单加粗 | 仅对应 ABC 加粗；Cmd+Z 撤销、Cmd+Shift+Z 重做；真实保存后重启保留。格式截图为中间候选，最终宿主有额外 editor 所属笔记守卫 |
| 画廊浏览→双击→同窗展开→返回 | 对应原生浏览/展开组变化，展开保留返回、标题与计数；最终 pair-clone 截图没有多余浏览选项溢出 |
| 最终构建侧栏拖动 228→250pt | DOM 与原生标题/返回同步移动 44 物理像素；`sidebar-drag-250.png`；已恢复 228pt |
| 最终构建隐藏侧栏、溢出菜单恢复 | 实际恢复侧栏，布局重新对齐；没有作为完整窄窗矩阵 |
| 最终构建卡片菜单“单独打开” | 创建真实 `note-f9bc3877-85de-4436-8eda-4793aa735fc5` 窗口，640×600pt；无全局搜索/侧栏/返回 |
| 最终独立窗 Cmd+F 后切回 main | 仅独立窗出现笔记内查找；`independent-find.ax.txt` 与 `main-after-independent-find.ax.txt`，主窗无该查找 |

中文搜索采用粘贴，只证明实际 value/ACK/焦点链路；没有真实中文 marked composition Mac 设备结果。媒体动作、所有格式/表格状态、全部窗口尺寸、完整授权竞争、所有激活状态仍 unknown。无每项完整 GUI 录像，表内未保存截图的观察须由独立验证重跑。

## 实际原版/克隆 RGB 对照：FAIL

完整原图 `runtime/pair-original.png` / `pair-clone.png` 均为 2176×1322px、1088×661pt、2×。同一合成正文“每日 TODO / 记录每一个想法 / 今天的计划 / 整理需求与交互 / 完成本地保存”，明亮外观，画廊展开。原版 6 篇，克隆 1 篇，计数/标题/侧栏不纳公共 ROI。采集前后两 app 都失活，前台为 Codex，见 `pair-before-capture.json` / `pair-after-capture.json`；没有采集中每瞬间 key-window 标志。原版位置 (160,185)，克隆 (153,100)，屏幕背景不同，材质因果无法由本对截图隔离。

`python3 scripts/compare-fix02-toolbar.py` 对共同新建/编辑/分享/搜索条的绝对像素区域 `[1096,8,2168,104)` 做原始 RGB 差分，无配准、缩放、颜色归一或掩膜。排除系统共享标记、正文/光标、日期和不同计数。完整参数、输入 SHA 和指标见 `runtime/roi-metrics.json`；ROI、50%叠图、绝对差图和亮度×4差图均保留。

| 指标 | 实测 |
| --- | --- |
| RGB MAE（0–255） | 9.1324432525 |
| RGB RMSE | 34.2408860482 |
| 任一通道非零变化像素 | 74.56856343% |
| 最大通道差 >8 的像素 | 6.53470927% |
| 最大通道差 | 224 |

原版“格式”中文与克隆 Aa、动作内部墨迹位置、搜索占位/图标位置、前景与材料存在差异，左侧文件夹/侧栏组也未匹配。**这是有限失活公共 ROI 的失败基线，不是全页分数，不支持调整材质常量或推定所有状态匹配。** 后续离线可执行校准建议可参考 `docs/research/macos-toolbar-host-deltas/`，该研究独立提交，不纳本候选功能通过项。

![公共顶部原版与克隆叠图](runtime/roi-overlay.png)

![公共顶部绝对 RGB 差分，亮度×4](runtime/roi-diff-x4.png)

## 交接与未完成项

独立 verify 应先核对 manifest，再检查正式 Mac 当前路径/唯一进程及最终 APK。Android 不能复用旧已安装 APK 的验证结果；新包先最小安装 smoke，再交回 FIX-04 输入法修复。FIX-04 基线已保留原 APK，不复制用户私有数据库。Mac 原生顶部的像素校准与未知矩阵继续留待后续任务，冻结候选不表示 FIX-02 目标已全部验收。
