# 统一候选 f4d3a02：最小独立安装验收计划

日期：2026-11-04（Asia/Shanghai）。执行者 verify。状态：**PREPARED / 等待开发构建、有限自测后的正式包与设备交接；当前未操作 GUI、设备或构建 target。** 本文件是计划，不是通过记录。若实际 source aggregate 或产品输入变化，以新的实际冻结身份单独建目录，不把 f4d3a02 当作不变构建标签。

## 范围与所有权

先 Mac F07 的唯一→零→clear、真实焦点/历史；再 Android 既有 66 秒 Opus/WebM 的 AudioPlayer、共享宿主导航和一个纸张选区 smoke。只在必要时补 Mac 正常有限 metadata 音频 smoke。开发独占构建与有限自测；verify 在正式回交之前只准备文档和只读资料，不同时操作 Mac、Android 或构建 target。

旧 dba83641 的权限、纸张、录音取消与保存 bytes 证据继续保留，但不能算新包通过。新包不重复首次权限、录音、声音、完整旧 IME 矩阵、Store 新候选或无关附件事务。SOURCE-READY 的 F07/static-02 与 Audio/static-01 是安装验证的起点，不是替代品。

## 交接时固定输入

开发提供实际提交、生产文件清单与聚合 SHA、Mac .app 和 Android APK 绝对路径/SHA/size、构建命令/退出码、已安装包身份、当前 PID/页面、开发自测证据目录、其自有转发/观察工具的清理状态。独立先只读重算身份；任何实际输入不一致先记录，不对未匹配包执行成功结论。

Android 约束：emulator-5580 / PID3197 / 原 session73263 保持；不得停止、重启、wipe、uninstall、clear data 或重置已准许 RECORD_AUDIO。host microphone OFF，不启用宿主麦克风。旧安全断点 physical1080×2280 / density440 / 无 override，app 旧 PID7137 仅是交接参考，新 PID以实际读取为准。开发已被正式告知 Android 可由其接手，Mac 由 root 统一调度。

媒体身份：note `a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3`，attachment `cb3fa001-9d73-4580-b959-38481fbba90b`；429547 bytes；SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`。实际管理目录路径 `attachments/cb3fa001-9d73-4580-b959-38481fbba90b.webm`，不是 files/attachments。独立 ffprobe packets 时间线66.064秒；平台有限 duration 可能为66.004秒，不要求二者逐位相同，但须披露差异并合理接近。不得把 ffprobe 数字写回播放器作为通过依据。

纸张测试 note `1a0718dd-c71c-4192-89b6-bd58cb9ba475` / `QA-PAPER-INDEPENDENT-20261103C`，原完整正文标题+Alpha **Beta** Gamma，paper grid-large；新包如开发已创建其他明确隔离 fixture，以实际交接和只读基线为准，不接触私人正文。

## Mac：一个真实编辑历史序列

1. 记录新 .app 路径/哈希及实际进程身份。使用交接的两篇合成 A/B；如无合适 fixture，再通过应用正常输入创建，分别有唯一检索标记。保存完整 A/B JSON、实际宿主 Editor/View/DOM 和真正 note/session/epoch key 的只读基线。
2. A 输入一个可识别的短后缀，记录完整正文与选择。实际观察到的 pending / saved 状态如实写；若输入已保存，不声称该次验证了 pending queue。
3. 使用真实原生搜索字段输入唯一 B 标记：B 是实际结果和活动 editor；A 停放/不可写；搜索框保有 field editor 焦点，正文没有被自动抢焦点。记录 AX、截图、DOM activeElement/selection 及真实实例身份；不通过 CDP setEditable/focus/命令替代 UI。
4. 修改搜索为零命中：编辑区无日期/正文和目标 editor，格式/清单/表格/附件/共享/更多禁用，全局新建及搜索仍有效；A 完整正文/历史和实例仍保留。记录原生控件状态，不能只根据 JS toolbarState 判断。
5. 用真实 clear 或 Escape 清搜索：恢复 A；完整正文、Editor/View/DOM/真实父 key 和历史未被临时空文档替换。先记录实际焦点；只有用户正常点正文后才执行 Undo，确认短后缀被撤销；Redo 恢复短后缀。快捷键和光标/选区路由必须落在正确控件，不能把搜索框文字撤销误记为正文 Undo。
6. 以正常 UI 返回测试安全页面，记录完整 fixture JSON 与存储状态。功能序列不声称全页像素一致或复现两种授权时序；零结果的有限像素比较单独按下节执行。

## Mac：F07 零结果公共 ROI 像素比较

在开发交回 Mac 后取证，使用相同中文／浅色主题、相同零结果 query、窗口逻辑尺寸和分栏。原版既有证据为 `docs/research/original-search-zero-result-01/03-zero-match.png`（2782×1806 raw）及其 AX；query 固定 `QA-NO-MATCH-20261103-2301-ABCDEFGHIJKLMNOPQRSTUVWXYZ-NEVER-EXISTS-7f62c83e9d4a`。只用合成/零结果内容，不增加私人查询。原版既有报告明确未测逻辑 bounds/DPR，**不能只据2782×1806反推pt或DPR2**。

如果现有原图无法确定与新 clone 的坐标关系，有限补采原版同场景，并独立记录两窗口位置、逻辑frame／content尺寸、raw像素尺寸、DPR测量来源、屏幕缩放、活动态、语言主题、分栏宽度和捕获时间。取图后恢复原版空搜索及已知合成folder/note。Mac暂不可用或DPR仍未可靠测得，则保留原图事实和限制，不捏造等尺寸条件；只报告可明确对齐的公共 ROI，不能给整页一个通过分数。

`mac/pixels-zero/` 保存 original.png、clone.png、50% overlay.png、absolute diff.png 和 metrics.json。原图先保全再裁剪；ROIs 预先定义为零结果列表/空编辑区（必要顶部公共组件单独列），保存两图原始坐标和逻辑映射。相同 raw 尺寸时直接按窗口/内容边界对齐，输出 exact mismatch ratio（任一通道不等的像素比例）、mean channel absolute error、max channel error；透明通道/合成规则明确记录。任何重采样、平移或屏幕材质差异必须披露，重采样结果只作辅助图，不代替原始差异。没有为降低误差而自动优化对齐的隐含过程。

报告分别写“功能结果”和“pixel结果”；白色正文为空也不能替代列表、标题、disabled工具等公共组件对照。数值不是自动豁免阈值，非零差异不宣称像素完全一致；活动态、不同屏幕位置和材质限制按实际证据说明。

## Android：同一旧媒体、有限播放器序列

1. 正式回交后先确认 installed APK、API/WebView、主 mic OFF、无残留 API wrapper/observer 和外部操作。只读保存完整 MEDIA02 / QA-PAPER fixture JSON、revision、附件 metadata 和实际 bytes SHA；不读取完整私人 DB。
2. 如果开发当前页面/状态已稳定且允许独立 app-only 冷启，则仅 force-stop/reopen `com.local.notesclone` 一次，不动模拟器和数据；记录 PID前后。原生导航到现有66秒音频。尽早观察实际主 audio currentTime/paused、UI、加载/错误与 React 播放状态；最多等待生产15秒解析截止再加有限调度余量。主元素必须初始暂停且在未操作时保持0；若开始观察时解析已完成，明确证据只证明解析后位置0，不冒称捕获了之前所有事件。
3. 时长成功：summary 约1:06、range max 为来源于平台的有限值，actual main audio 的 duration 如仍Infinity则原样披露，区分 controller 解析时长和主元素 metadata。不出现伪0:00、自动播放/自动跳进度。若平台未能解析，应是“时长未知”+可重试错误；这证明错误可见，但仍不能验收 Android 有限时长成功。遇一次真实失败立即冻结证据，不循环点重试取得通过。
4. 原生播放1–2秒→暂停；记录 main currentTime 进展、paused、按钮与错误，无可听音频验收。之后保持暂停，展开进度，通过真实 range 拖动至约30秒，依次 +15 / -15；每次记录控件值与真实 currentTime 接近。以 near-start -15 到0、near-end +15 到有限上界，验证 clamp。无需完整66秒播放结束，也不将未测 ended 标为通过。
5. 正常返回列表再打开该音频笔记：确认新共享宿主没有把其他 note.id 的正文/附件带入；最终停止播放。全过程完整保存 document、revision、attachment metadata/bytes不变；若因开发自测基线已有合法变化，只对本轮实际 baseline 比较。

## Android：一个共享宿主／纸张选区 smoke

从音频笔记→纸张测试笔记→返回音频→再纸张测试笔记，检查正文/媒体归属与实际 note/session key；不重新跑七态或短屏矩阵。通过真实长按选择 Beta，格式面板打开/关闭后 More→纸张→Cancel→重新打开确认 grid-large→Back。比较完整文档、selection、当前 Editor/View/DOM、真正父 key；面板时无IME且不可写，返回恢复编辑性。若需要临时改一个纸张样式，仅改该合成 note，保存并恢复 grid-large；不把旧包七态证据当新包通过。

## 有限 Mac 音频正常路径

若交接已有测试有限音频，使用该 fixture 做 metadata/display/未自动播放 smoke；否则通过正常 UI 给合成 note 添加独立2秒有限WAV，保存前后记录，仅测试正常metadata路径。该步骤不触碰原版 Notes 真实笔记，不开启麦克风。没有可用且必要的 fixture 时留 unknown，不从离线Chrome156证据推成macOS实际应用通过。

## 证据与停止边界

正式开始后在本目录分 `mac/`、`android/` 保存身份、原生 action log、完整测试对象、关键截图/AX、实际媒体和编辑器只读观察、result、README、manifest。UI动作只走原生控制；CDP仅作读取或只读事件观察，不包装平台媒体API、不调用产品方法、不人工写React/ref/editor/焦点/selection。任何受控故障注入必须另列，不用它冒充真实用户路径。

一次实际异常保存完整状态、必要取消/暂停/关面板，停止该失败路径，不重复直到成功。结尾清自有转发/remote handles/临时观察，恢复本轮临时设置，保留模拟器运行与host mic OFF。若Mac锁定则停GUI并报实际状态，不反复让用户解锁。声称结果只覆盖确切包/平台/序列；Store候选须另待native交接并独立静态审查。
