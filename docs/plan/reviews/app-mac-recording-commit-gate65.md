---
id: app-mac-recording-commit-gate65-review
status: passed-with-scope-limits
source: 0079bae21338d05c2cd75cc4404754be4cf030b6
author-source: 24b6f45321367144fc684b0ef32a14738a7b0eba
---

# Mac recording commit gate65 independent review

结论：准确65补丁在独立验证的Editor commit与Panel投影边界内PASS，没有剩余阻断发现。此次结果用于保留65修复并进入66单主窗右栏重构；不代表Mac18真实runtime问题已现场复验通过，也不要求继续旧双模式或Mac19方向。

准确作者产品源 `24b6f45321367144fc684b0ef32a14738a7b0eba` 在独立树cherry-pick为 `0079bae21338d05c2cd75cc4404754be4cf030b6`。所有89个src及src-tauri/src文件逐字节等于作者提交，开始/结束HEAD相同。产品补丁仅App和DesktopRecordingPanel的28+/9-；独立没有改产品。原64和Mac18包身份独审证据仍保留，不能据它们宣称真实录音保存成功。

证据目录：`docs/verification/mac-recording-commit-gate65-independent/`。最终运行 `attempt03/result.json` 共11组通过，`source-binding-and-typecheck.json`及完整stdout/stderr证明独立pnpm typecheck exit0。该目录的独立index覆盖runner、review、所有保留结果和日志，排除Vite缓存。

## 实际挂载与源码边界

独立脚本AST提取准确App的SearchEditorHost、validateRecordingTarget与finishRecording，并在headless Chromium内挂载生产SearchEditorHost、生产NoteEditor/实际TipTap Editor、SearchEditorGate及useEditorCommit。没有复制或改写目标校验算法。trusted response、保存宿主及commit前调度可控；完整App、Store和原生窗口没有重跑。

- baseline实际校验在同步返回而Editor仍被门禁暂时设为不可写时失败，错误与现场相同，且没有等待commit；candidate登记控制器、等待真实useEditorCommit/Host layout，再成功清理控制器。
- 等待期间外部版本、Editor归属、access epoch或blocked目标变化，candidate仍拒绝保存；静态比较确认删除新增等待块后，原桌面校验所有安全谓词逐字未变。
- 实际finishRecording会abort等待控制器，不在关闭后继续保存；在真实useEditorCommit注册后、下一layout之前abort也拒绝并清理controller。
- 真实A Host在受控current-editor身份切到B后保持parked且不可写，等待完成允许正确原A目标。B身份在此为受控输入，不是挂载第二个完整B Host或完整App焦点验证。

Panel测试挂载未改写的生产DesktopRecordingPanel和生产RecordingView，验证使用原validRecordingState；capture、playback、Audio TimeRanges和投影interval为受控边界，没有采集任何音频。

- baseline独立复现elapsed0而最新sample200的invalid状态，以及paused预览70段ranges的invalid状态。
- candidate在波形回调早于独立投影tick时保持elapsed覆盖最后样本，全部已观测投影均通过原validator。
- 70段预览截到64段；负起点、超duration终点、Infinity、NaN和空区间输入最终得到合法 `[[0,10],[20,30],[40,50]]` 毫秒区间；paused和保存失败retry状态均通过原validator。

## 尝试和限制

`attempt01`的Host相关6组已过，Panel阶段因独审虚拟View模块缺.tsx扩展名而报JSX解析错误；`attempt02`继续通过波形及70段测试，但独审mock直接更新playback时漏默认错误字段，造成notice为undefined而被validator拒绝。两次均为独审宿主问题，没有产品变更；原始runner、failure和起始哈希全部保留。补全宿主后 `attempt03` 全11组通过，不能将前两次记为产品回归。

没有操作GUI、Mac18真实3秒音频/窗口、手机、麦克风、权限、签名或native编译。没有导出、复制、关闭该音频。没有扩展浮动/停靠双模式回归，没有用headless受控通过冒充Mac WKWebView、真实权限/音频、原生退出或像素验收。后续66须在新结构上重新验收暂停/关闭自动保存。

## 给66的只读建议

主App稳定owner/ticket持有session、累计PCM、候选File和RecordingRevisions；右栏挂在App根部，切A/B或隐藏时不能因React卸载而dispose。直接提交沿用原A bookmark、最新正文PM、SaveQueue、AccessGate、query committed及每revision固定File/op。当前validateRecordingTarget与submitRecordingRevision要求ticket.remote，finishRecording的remote早退属于子窗ACK特例；66应使用显式单窗desktop owner类型调整，避免伪造remote。

关闭先封新操作并记录关闭意图，等待在途checkpoint和准确final正文ACK/query成功后才移除右栏和释放stream。失败保持候选及可重试右栏。主窗关闭/quit统一走recordingLifecycle.close、flush、准确退出ACK，保留原A停车与现有编辑门禁；当前B的编辑、焦点和权限不能成为A音频的写入目标。
