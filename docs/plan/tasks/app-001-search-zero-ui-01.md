---
id: app-001-search-zero-ui-01
scope: mac-zero-result-list-title-subtitle-and-section
status: ready
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

仅非空Mac搜索、可信加载完且实际结果为零时应用本次已证状态。原生标题/辅助标题与可访问文字一致；非原生桌面回退按同语义。移动搜索、普通空文件夹、loading、多结果/唯一结果文案与排序未获本证据的部分保持原有契约，不用本任务重设计。分组/分隔线按照实际原图在列表起始位置绘制，不复用与原图不同的日期组文案/位置来冒充已匹配。

不重建Editor或写空正文，不改result filter/选择、SearchEditorGate、权限、保存、附件、录音。不得为像素评分遮掉文字、光标或系统浮层，不因原版有iCloud侧栏而加入本地无效账户/协作UI。

## path and scheduling

必要App列表展示分支、Mac native toolbar标题计数字符串呈现、相关列表CSS与定向检查。按实际最小字段接线，避免为了静态文案另建宽泛协议。允许src/App.tsx、src/native-toolbar-state.ts及真实native state类型/校验仅确需部分、plugins/tauri-plugin-notes-ui/macos/toolbar.m、src/style.css对应列表段；禁止其他native action/search焦点/权限和媒体源。当前attachment-submit占App，recording-state占录音样式；必须待App owner冻结、独审通过且主合入后再开始本任务，不同时修改同App或相同CSS段。

## verification

typecheck和受影响真实顶部/搜索契约检查，独立审查展示条件没有改变真实编辑/动作目标。新包真实Mac唯一→零→clear smoke检查正确文案/分组/无中央提示并保持停放/恢复语义。像素复采先把克隆调整到与原版相同逻辑窗口大小、分栏、屏幕位置、主题/语言/焦点，记录原始PNG/逻辑映射，再输出同区域原图/叠图/原值差异和metrics。

上一批两窗1392×903与1088×660，仅公共crop且不等条件，保留为失败观察、不当作严格校准基线。无法取得同条件时明确unknown，不能把不同高度导致的居中位置差异当产品绝对偏移。顶部蓝/金焦点颜色、快速OptionCmdF后paste异常和整页像素另列，不由本任务关闭。
