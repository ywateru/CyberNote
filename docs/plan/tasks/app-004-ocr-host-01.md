---
id: app-004-ocr-host-01
scope: local-text-recognition-host-integration
status: in-progress
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

主Cargo/lock/Builder/capability注册；src/App.tsx入口与父确认、必要的独立OCR控制器/预览组件和专用样式、typed guest调用接缝；已有插件仅在发现接入阻塞时窄修，不重写已审引擎。不得改编辑schema/归档格式、添加永久图片附件或触及录音预览与共享播放模块。依赖接入现成path插件；唯一获准兼容例外为scan build-dependency tauri-plugin精确2.6.3→主线已有2.7.2，runtime/模型不变、无下载。开发在主线最新基线的新worktree，先冻结录音preview候选，再串行接此任务。

## existing evidence and scope

遵循requirements F16、architecture已有原目标/授权/保存边界、ui/android录屏扫描入口、research/offline-media-scanning及plugins/tauri-plugin-notes-scan/README。复用现有插件execute/begin/get/pickImage/openCamera/recognize/finish/acknowledge/cancel，不复制OCR引擎。主Cargo path注册与capability显式接入；既有插件runtime版本和模型保持锁定，build-dependency兼容例外及lock精确变动见architecture。Mac原版不可用的连续互通入口保持实际可用条件；本地图片识别入口明确表达其用途，不将其称作原版连续互通。

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

## scheduling

录音preview已冻结dc33152并转独审，本任务从主线新建独立worktree `/private/tmp/apple-notes-ocr-host-01` / `task/app-004-ocr-host-01`。只实施本地OCR文字宿主路径，不触preview候选。若其独审出现阻塞，优先回原preview工作树修复，OCR保持独立未交付状态。构建/设备由root串行排期，开发先源码/定向检查，不抢占独立运行的GUI/设备。

## source candidate 01

基线8bc8ae2f712ebf85ec0cd79453318563e3d83a8b，隔离工作树实现。产品接缝：OcrHost/ocr-native/OcrPanel、App原目标/保存ACK/唯一close/访问失效、notes-ui Rust与guest的recognizeImageText及native-toolbar-state、主Cargo/Builder/capability。notes-scan原生引擎和guest字节保留；没有触录音preview/共享播放或编辑schema。

开发检查：实际App闭包/生产控制器与typed guest/bridge/SaveQueue/PM共27项；实际挂载工程预览7项；录音父20项、工具栏13项，typecheck/build及附件回归见候选报告。主Cargo Mac/Android目标metadata --offline --locked通过，仅解析不编译；scan独立Mac解析通过。源码、日志、截图和限度保存在docs/verification/app-004-ocr-host/source-candidate-01/，冻结后交独立复核，禁止自合并。

主App真实Vision/Android OCR、原选区/正文ACK/UndoRedo/冷启、物理相机与原版像素均未由开发受控检查证明，须新包独立验收；本项仍pending-review，不标APP-004完成。

## source candidate 02

候选01 `2ad1e89423d1be6e872c248bfcae92ff2abade62` 独审被一项P2阻塞：失效及正常完成后React OCR预览明文未清。原候选/证据保持，完整独审见主文档plan/reviews/app-004-ocr-host-static-01.md。本次仅App同步清预览及Host真实终态清文字/错误，不改Panel/CSS或原生层。

prepare/clearSensitive/卸载先封回调并立即清UI；未ACK正文与原operation/session保留，prepare失败→abort后可经原通用保存重试；ACK后清理失败只重试原session。真正cancel/acknowledge完成后Host结果也清空，正常finish清React状态并释放owner，防无主明文。37项包含原27和新增10组实际accessHandler/clearSensitive/close闭包及新旧owner隔离，独立原两份repro原样复跑通过，Panel原7与父20/附件23+8、typecheck/build均通过，精确身份/原始日志见verification/app-004-ocr-host/source-candidate-02/。

独审对320px截图底部截断/重复画面的观察仍未知，本次不据此改CSS或标视觉通过；同一7项DOM几何通过不替代截图/像素验收。新候选继续待独立复审，未原生构建、设备或GUI运行。

## independent acceptance and main integration

独审02在独立detached树对5b707ae重放两原失败脚本原字节、37生产闭包与typecheck/diff均通过，关闭01 P2；报告见app-004-ocr-host-static-02.md。主c9fe811/cd7c94e合入14产品hash相同，6个preview文件保留e01c90a原字节，主build/OCR37/preview16/父20/toolbar13通过。详见verification/app-004-ocr-host/main-integration-01。源码接入已接受，真实主App平台/持久化/像素仍未通过，任务整体继续in-progress。
