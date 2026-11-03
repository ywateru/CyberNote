---
id: app-001-fix-04
scope: android-inline-composition-preservation
status: in-progress
depends-on: [app-001-fix-03]
---

## objective

修复独立真实Android中文候选测试发现的长停留预编辑重复内容，阻塞手机输入正确性交付。先冻结当前FIX02正式Mac候选及其最小搜索焦点修复，再串行修改共享Editor/主应用边界；不要求先把FIX02所有像素场景验完。不得让该新P1被快速候选通过覆盖。

失败基线为20c3014默认APK（44b6b16d…），emulator-5580/API30/WebView91，Trime3.3.13随包luna_pinyin_simp与真正“编辑中文本”内联预编辑。快速约2.8秒输入nihao、选择“你好”有真实composition事件且可正常替换；长停留后观察到view.composing=false、compositionNode仍含`ni hao‸`，选词后出现拼音与汉字并存。原始证据在`docs/verification/qa-android-ime/`，正式独立报告/精确持续时间以verify冻结结果为准。

e352541已冻结独立报告`docs/plan/reviews/app-001-android-ime-01.md`：长停留按实际动作边界估计约35秒，失败残留在真正冷启后仍保存；快速轮次只替换本轮新增后缀，不抹掉旧失败。未捕获长轮完整事件，不声称精确5秒触发或保存重载因果。实际选区/单字粗体/Undo/Redo及JSON冷保全有限通过。原四项系统输入设置已精确恢复LatinIME，Trime模式Disable且不在启用列表中；FIX04开发/复验须显式重新配置与最终恢复，不能假定IME仍启用。

2026-11-03 19:24前后FIX02候选34223af已冻结，旧失败APK另存`/private/tmp/notes-final20-ime-baseline-44b6b16d.apk`保持44b6b16d…。新0aac2d73…APK已由独立verify完成源/安装hash、真实ASCII输入保存及force-stop/COLD后完整文档保全的有限smoke；该路径没有重跑Trime，不覆盖原长停留P1。Android现交develop做本任务，verify只操作冻结Mac4118f77f…；本任务不得覆盖该Mac包。新APK也先保留字节与身份，再构建诊断/修复包。

1. 用真实软键盘拼音和候选保持预编辑生命周期。用户暂停输入、等待自动保存、再选词时，候选应替换同一段预编辑，不残留临时拼音/光标符号，不重复汉字，不跳光标或丢相邻正文。
2. 原有快速组字、取消/删除预编辑、连续多段中文与中英混输继续可用。不能只增加一个更长固定超时来推迟故障，不能通过伪造候选/输入事件、清空正文或覆盖整份文档来得到通过。
3. 保存/外部同步、原生与手机格式动作、切笔记/后台/返回的提交与取消边界明确。自身保存不能提前结束真实IME组字或重建正在组字的DOM；若跨笔记/授权变化必须收束，不让旧组合写到另一个note。修改不得绕过FIX03授权或冲突基线。
4. 保持Mac原生格式选区/Undo、Android格式面板与纸张入口已通过行为。必要依赖适配/受控版本补丁须固定输入版本并记录理由与原有缺失compositionend的回退边界；不无关升级/降级编辑器或Tauri依赖。

## context

- docs/INDEX.md、docs/requirements.md F03/F04/F14
- docs/ui/interaction-matrix.md、docs/ui/android.md
- docs/research/android-ime-verification.md、docs/research/android-ime-readiness/
- docs/research/android-ime-diagnosis/analysis.md 与 inputs.json（20源码及锁定PM的只读候选机制，不是根因已证）
- docs/research/android-ime-diagnosis/upstream-notes.md（维护者闲置兜底历史、相似用户报告及已包含的单个历史修复；不构成当前根因或升级解法）
- docs/verification/qa-android-ime/（仅合成内容；独立原始候选/内联/快速/长停留事件与截图）
- docs/plan/reviews/app-001-android-ime-01.md（e352541独立实际P1与有限通过边界）
- docs/plan/reviews/app-001-fix-03-mac-01.md、app-001-fix-03-android-03.md（已通过有限安全边界不得回退）

锁定prosemirror-view 1.42.9本地源码存在Android 5000ms的scheduleComposeEnd→endComposition→clearComposition路径；clearComposition可置composing=false而暂留compositionNode，真实DOM compositionend另清node。与现象匹配但目前只是可追溯候选机制，不能将它或自动保存重载未经时序实证写作已确认根因。开发须先核完整独立事件和真实调用边界。

## path

src/Editor.tsx、必要composition适配模块、src/App.tsx中直接相关保存/同步/选区边界；若确有需要，限定pnpm受控依赖补丁及其锁文件；README/architecture的必要契约与独立验证记录。不得混入媒体/扫描/高级功能或任意修改SQLite/锁协议。原失败APK、事件和截图不覆盖。

## verification

2026-11-03本轮已冻结f3071f3，APK及重新安装base.apk均为d5c6f59b79031d1e103f418450e6cbd9d7fa8e8fc085263fab3d23d6b3e04d21（300954658B），保留`/private/tmp/notes-fix04-candidate-01-d5c6f59b.apk`。91输入聚合105aef1b…，不声称全部输入均提交或完整HEAD可复现；精确清单见`docs/verification/app-001-fix-04/source-inputs.json`。开发自测和已知失败见selfcheck/artifacts。原输入设置与Trime Disable已恢复，Android明确交独立verify有限复验主路径；本任务partial/in-progress，FIX06与paper失败不因拆分而解除手机交付阻塞。Mac原4118包保留，root另接入顶部/关闭窗口改动构建新的正式候选。

开发冻结修复源码、APK及安装内hash，再交独立verify；不以浏览器预览或直接输入汉字代替安装版的真实IME路径。

4998e2b独立报告`docs/plan/reviews/app-001-fix-04-01.md`已完成：91输入80git+11generated与实际安装SHA匹配，空paragraph73.5297s/正文中部77.7964s后真实候选精确替换，快速/五键取消/继续中英混输及一次force-stop/COLD完整JSON共六条有限路径通过。未新增独立P1/P2/P3，继承格式/后台P1与选择grid-large后的选区P2，整体仍partial/blocked。设置已恢复本轮实际起始值，Android归还后交develop进行FIX06有限平台对照；Mac本轮未测。

- 原环境/同输入法/同内联模式：实际软键盘输入拼音，捕获compositionstart/update、候选可见、原生实际marked range/只读View状态；分别快速选词及无按键停留跨过原故障边界后再选词。时间戳、preedit、candidate、输入事件和最终JSON对应，不能只看最后标题或用固定延时推断保存ACK。
- 长停留至少两种位置：新段落和已有正文中部；候选替换精确、前后文字不变，无临时拼音/光标符号。再真实取消/删除组字、继续另一段输入、中英混输。
- 选区格式、Undo/Redo、提交后的真实保存、切笔记、后台恢复与强停冷启核完整文档；组字期间导航/返回的收束边界单列，未做继续unknown。
- Mac实际编辑/格式选区/Undo及必要controller/access回归；仅对修改边界追加必要测试，不能把Mac通过升级为Android输入通过。
- 测试结束恢复原输入法和临时更改设置；不清应用数据、不导出私人目录。输入法工具及其候选窗口不是原版UI像素通过，模拟器不冒充实体手机。
