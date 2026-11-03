---
id: app-001-search-zero-ui-01
scope: mac-zero-result-list-title-subtitle-and-section
status: ready-for-review
depends-on: []
---

## objective

修正candidate02独立实际对照中已明确的Mac零结果列表差异：原版标题“搜索”、副标题“无结果”，下面保留“备忘录”分组和水平分隔线；克隆显示“搜索结果 / 0 个备忘录”，缺分组且列表中央额外显示“未找到备忘录”。仅修这组可见文案/布局，不改变已通过的结果选择/停放Editor/clear/历史与禁用动作协议。

## context

docs/plan/reviews/unified-fabafcf-mac-independent-02.md、docs/verification/unified-fabafcf-independent-02/mac/pixels-zero/原始original-zero.png和AX/roi-definition.json；docs/ui/macos.md、app-001-search-results-01.md。219输入fabafcf对应sealed exe5e948ad9。新源码必须从本任务排期时已合入的主HEAD开始，不能覆盖当前附件App owner的WIP。

## layout and contract

```text
Mac 原生列表标题区         列表滚动区
┌─────────────────┐     ┌─────────────────┐
│ 搜索            │     │ 备忘录 ───────── │
│ 无结果          │     │                 │
└─────────────────┘     │  无note行/中央提示│
                        └─────────────────┘
```

仅非空Mac搜索、`view=list` 三栏列表、可信加载完且实际结果为零时应用本次已证状态。可信加载须有实际同步发布成功的正向事实；启动订阅失败后finally结束loading不能视为已加载。loading、同步中/失败或授权遮挡时不显示已确认“无结果”。原生标题/辅助标题与可访问文字一致；非原生桌面回退按同语义。移动搜索、画廊零结果、普通空文件夹、多结果/唯一结果文案与排序未获本证据的部分保持原有契约，不用本任务重设计。分组/分隔线按照实际原图在列表起始位置绘制，不复用与原图不同的日期组文案/位置来冒充已匹配。该view边界经root明确：当前原图只证明三栏列表，不扩展到未补证的画廊。

不重建Editor或写空正文，不改result filter/选择、SearchEditorGate、权限、保存、附件、录音。不得为像素评分遮掉文字、光标或系统浮层，不因原版有iCloud侧栏而加入本地无效账户/协作UI。

## path and scheduling

必要App列表展示分支、Mac native toolbar标题计数字符串呈现、相关列表CSS与定向检查。按实际最小字段接线，避免为了静态文案另建宽泛协议。允许src/App.tsx、src/native-toolbar-state.ts及真实native state类型/校验仅确需部分、plugins/tauri-plugin-notes-ui/macos/toolbar.m、src/style.css对应列表段；禁止其他native action/search焦点/权限和媒体源。当前attachment-submit占App，recording-state占录音样式；必须待App owner冻结、独审通过且主合入后再开始本任务，不同时修改同App或相同CSS段。

## verification

typecheck和受影响真实顶部/搜索契约检查，独立审查展示条件没有改变真实编辑/动作目标。新包真实Mac唯一→零→clear smoke检查正确文案/分组/无中央提示并保持停放/恢复语义。像素复采先把克隆调整到与原版相同逻辑窗口大小、分栏、屏幕位置、主题/语言/焦点，记录原始PNG/逻辑映射，再输出同区域原图/叠图/原值差异和metrics。

上一批两窗1392×903与1088×660，仅公共crop且不等条件，保留为失败观察、不当作严格校准基线。无法取得同条件时明确unknown，不能把不同高度导致的居中位置差异当产品绝对偏移。顶部蓝/金焦点颜色、快速OptionCmdF后paste异常和整页像素另列，不由本任务关闭。

## 开发候选 01（2026-11-04）

App纯展示谓词仅已确认桌面主窗列表零结果时生成“搜索 / 无结果”，原生复用folderTitle/count/query呈现辅助文字，列表独立分组“备忘录＋横线”替代中央提示。未加协议字段或改F07/焦点/媒体/授权/Editor。typecheck、新实际App展示14组、原搜索选择7组/顶部12组通过；24文件与15保护片段未改。未编译原生或使用target/GUI/设备，真实同几何像素待新包。候选报告：[源码候选01](../../verification/app-001-search-zero-ui-01/source-candidate-01/README.md)，4源码aggregate `2881c002bb9e0e7d8e15ad1e910847184f398a46e65ab2fdeeaab415729af8fa`。独审01发现P2：启动subscribeAccess拒绝后loading=false但同步未调用，初始空工作区被误报为已确认零结果；旧候选与失败证据保留，由候选02修正。

## 开发候选 02（2026-11-04）

按独审01 P2新增workspaceLoaded正向事实：初值false，实际synchronizeRef的成功publish完成后才为true，仅用于desktopSearchZero展示门禁。订阅拒绝或首次工作区加载失败不能满足；成功加载后无关动作error不影响该展示，后续同步失败仍由现有同步门禁遮挡。没有修改订阅/同步返回协议或F07/附件/录音保护区。真实App启动effect、初始化、hydrate/同步赋值和生产TrustedSynchronization执行5组通过；App实际展示16组、原搜索选择7组/顶部12组及typecheck通过。24整文件与15保护片段不变，候选01的12项报告/证据逐字保留。

[源码候选02](../../verification/app-001-search-zero-ui-01/source-candidate-02/README.md)，5源码aggregate `3b1e23c8ec0eb87ef594759644a7e2ac02436615e206402607e6767e9465e86b`，等待第二轮独立源审。没有新原生构建、GUI、设备或像素验收。
