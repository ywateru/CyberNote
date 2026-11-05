---
id: app-recording-presentation55
scope: desktop floating/docked recording view with one persistent capture session
status: ready
depends-on: [app-recording-interactions50, app-mac-recording-access52]
---

## objective

按用户最新原图和补充，实现录音机浮窗/当前主窗右侧展开双模式，切换不打断同一录音或试听，仍可同时编辑/切笔记；无听写。以docs/ui/recording-desktop.md“浮动与当前窗口展开”为准，覆盖早期只允许独立窗的呈现限制。

## context

阅读docs/INDEX.md、docs/ui/recording-desktop.md、docs/ui/recording-mobile.md、docs/architecture.md。50/52已整合主线5a147d2，Mac15真实非模态/编辑Undo/Redo/隐藏恢复有限通过；第一次真实Start原生30s超时，其后约177s系统事务迟到结算，实际重试待验。Android09首构建发现desktop-only unminimize编译失败，先单独合入106204窄修再创建55隔离树。

## path

必要src/RecordingPanel.tsx/CSS、提取共享纯RecordingView、src/RecordingWindow.tsx、src/App.tsx、recording-coordinator/window-transport及必要受控检查脚本；src-tauri/src/recording_window.rs与专用capability只用于带身份的模式可见性/控制协议。保持Session52、插件权限、后端数据库/附件journal、通用保存和菜单/侧栏不变。不得在主窗创建第二Session/Audio或搬运真实音频。必要扩张先报告具体原因。

## verification

先固定产品SHA，开发/独验分人。必要实际共享视图+Panel/Session/Owner/PM受控链验证：默认浮窗、浮→展开→浮反复、准备/录制/暂停/试听/seek/错误/保存中一致性，同一Session/流/Audio/operation，真实child控制回执，过期/错身份/未知与非法seek/sample拒绝，模式切换失败原视图可见，主窗关闭先恢复浮窗，原A保存一次且B焦点/文字保留，手机sheet回归。浏览器串行，无新依赖或旧矩阵复制。

root整合后串行准确双端构建，Computer Use核Mac真正双模式/背景采集/真实播放与A/B保存重开，ADB保数据核手机回归。源、准确包、有效音轨与原图像素分别记账。证据仅docs/verification/recording-presentation55/和-independent/，保留前次失败和包，不删用户/合成数据、缓存或worktree。

用户再次明确本需求重点为“录音的同时可以操作备忘录其他功能”。验收包含采集中当前A编辑/Undo/Redo、切换/新建B、搜索及格式工具；两种呈现均不得以背景遮罩、inert或覆盖层锁正文/原生工具栏。仅显式Quit等待允许沿50冻结；不能把使用其他应用的后台测试替代备忘录内并行操作。
