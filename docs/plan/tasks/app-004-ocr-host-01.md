---
id: app-004-ocr-host-01
scope: local-text-recognition-host-integration
status: pending
depends-on: [app-002-recording-submit-01, app-004-scan-plugin]
---

## objective

将已独立验证的原生扫描插件先接入主应用的文字识别真路径。此小批只交付用户选择本地图片/Android拍摄文字→实际离线OCR→预览确认→原目标选区插入→真实正文保存→重启保持。文稿多页/扫描集合长期存储、复裁与PDF另批实现，不将本项当APP-004完成。

## context

- docs/INDEX.md、docs/requirements.md F16、docs/architecture.md（OCR宿主接入待实现契约）
- docs/plan/tasks/app-004-scanning.md、docs/research/offline-media-scanning.md
- plugins/tauri-plugin-notes-scan/README.md及guest-js/index.ts
- docs/plan/reviews/app-004-scan-plugin-03.md、docs/ui/android.md、docs/ui/macos.md
- app-002原目标/真实正文ACK与取消边界，候选03实际结果另列

## path

主Cargo/lock/Builder/capability注册；src/App.tsx入口与父确认、必要的独立OCR控制器/预览组件和专用样式、typed guest调用接缝；已有插件仅在发现接入阻塞时窄修，不重写已审引擎。不得改编辑schema/归档格式、添加永久图片附件或触及录音预览与共享播放模块。依赖仅接入现成path插件，不升级版本。开发在主线最新基线的新worktree，先冻结录音preview候选，再串行接此任务。

## existing evidence and scope

遵循requirements F16、architecture已有原目标/授权/保存边界、ui/android录屏扫描入口、research/offline-media-scanning及plugins/tauri-plugin-notes-scan/README。复用现有插件execute/begin/get/pickImage/openCamera/recognize/finish/acknowledge/cancel，不复制OCR引擎。主Cargo path注册与capability显式接入；既有插件版本和模型保持锁定，不升级依赖。Mac原版不可用的连续互通入口保持实际可用条件；本地图片识别入口明确表达其用途，不将其称作原版连续互通。

## host contract

打开前固定noteId、Editor、完整文档/版本、bookmark、access stamp和单次operation身份；普通及原生入口同路径。可信focus同步仅在既有严格目标身份条件仍成立时重新绑定renderer代次。目标切换、正文/选区失效、锁定/删除、窗口关闭或取消，拒绝晚到插入；不能回落到当前笔记。

会话和处理状态归一个控制器，区分选择取消、识别中、recognized、empty、failed、确认中、正文已保存、待清理；不能用空文字表示失败。预览显示实际OCR文字，确认按钮只对可插入非空结果可用。重复确认复用同一次文档事务和保存Promise；保存失败保留同结果/原操作，不再次插入。只有saveDoc真实ACK后才acknowledge插件会话；ACK后插件清理失败单列可重试，不重插或误报正文未保存。取消先封入场，再等待已发原生工作终态，按插件原session安全取消；ACK过的正文不得反向删除。

正文仍采用现有schema的普通文字/段落，不增加扫描节点或新持久索引。保留换行，作为一次编辑事务，沿用生产保存队列和Undo/Redo。会话暂存由插件负责，禁止WebView任意路径输入或新增大资源Base64往返；Mac受限已选图按现有ingest上限。文本模式不发布永久图片附件。

## UI structure

```text
已选目标 → 扫描文本入口
  → 本地选图 / Android相机
  → 识别中（取消）
  → 实际文字预览（取消 / 插入）
  → 正文保存中 → ACK → 返回原笔记
  → empty/failed/目标变化：明确结果，保留旧正文
```

原录屏没有展示OCR完成预览，此预览属于工程实现；不得标原版像素一致。录屏已见入口/相机界面继续照其坐标规格，不能把现有占位提示保留为已完成功能。

## verification

开发定向覆盖实际控制器、插件边界与App确认回调：选择取消、空图、原生失败、目标切换/锁定、重复确认、正文失败同操作重试、保存成功但cleanup失败、取消与处理中交错、晚返回及资源归属。完成typecheck/build，受影响schema/Rust检查只按实际改动运行。冻结源码后独立review。

统一新包独立实测Mac图片→真实Vision和Android图片/相机→bundled OCR，真实正文ACK/UndoRedo/正常退出冷启。使用合成中文文稿，保全源图、实际OCR文本和保存前后文档。实体相机质量、无GMS和未见原版预览继续未知；不要求清空用户主应用数据来证明首次离线，已有插件隔离首次离线证据与主App离线运行分开记账。
