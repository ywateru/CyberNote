---
id: app-004-scan-plugin
scope: isolated-native-offline-scanning-module
status: in-progress
depends-on: []
---

## objective

为APP-004先实现独立的真实原生模块，与正在修改共享App/Store的开发串行集成。本任务是模块交付，不能被当作已接入应用、安装版或全功能通过。

在 `plugins/tauri-plugin-notes-scan/` 中完成Tauri2原生插件，包含Android bundled中文OCR、私有扫描会话、真实相机页与本地裁边/多页PDF结果，以及Mac本地Vision图片OCR。实现遵循APP-004和离线研究约束，不用网络识别、不用占位成功/虚构检测结果。先让静态本地图片OCR真实可运行，再完成相机/文稿模块，明确未集成的步骤。全部源代码/配置可复现，不仅修改gen/android。

原生结果只交受控session/file token及类型元数据，隔离取消、失败和空识别；目标note/选区由后续应用集成持有。模块提供会话读取/提交确认/取消/清理，不允许任意路径导入。文稿原图与四角/方向、校正图、页序和PDF均有真实数据。单独模块无法确证的硬件/界面状态保留unknown。

## context

- docs/INDEX.md、docs/plan/tasks/app-004-scanning.md
- docs/research/offline-media-scanning.md
- docs/ui/android.md、references/mobile/frames-2s/frame-041.png
- src-tauri/Cargo.lock（现有Tauri版本，只读）及现有Android环境（只读）

## path

**独占可写**：`plugins/tauri-plugin-notes-scan/`、`docs/verification/app-004-scan-plugin/`。插件自己的Cargo/Gradle/Manifest/capability/构建说明放在该目录内。不得改根package/Cargo/lock、src/、src-tauri/、共享README/architecture或其他开发证据。使用独立构建输出目录，避免与主开发的构建冲突。GUI/设备当前属于主开发，模块准备期间不得操作；需要真实设备时先交接。

## verification

开发者应编译插件本身与Android原生library、记录锁定依赖和实际model打包证据；以真实受控图像调用Mac Vision等无需GUI的API保存结果，错误/取消/过期token与会话限制做合理检查。不能用类型检查替代OCR实际运行。Android实际相机/离线首次识别须在后续独立设备交接后由verify执行。提交后由独立verify审查源码和模块检查；应用入口→插件→Rust受管附件→保存/重启的接入仍由APP-004-scanning完成。

2026-11-03进展：实现提交9340dba；独立报告 `docs/plan/reviews/app-004-scan-plugin-01.md`（2358901）结论为module-checks pass。真实Mac Vision、会话边界、Android强制离线重建/模型字节已验，Android设备运行、宿主copy_file_to实际执行和主App集成仍unknown。本任务继续补运行证据，不将模块检查升级为完整扫描验收。

2026-11-03实际运行补证：e6cc378宿主分块复制、失败清理与ack顺序已由独立verify真实复核通过。Android当前harness APK `6734d4b22f9d1395759e73a4136f2d53ffa4c5a487b164e993ad419dfe90e0ed` 首次安装/断网后，`ocr-first-offline` 与 `perspective-pdf` 均在SessionStore.begin→save→dir报“无效会话目录”；OCR checks为空、PDF尚未执行，构成P1运行阻塞。原始tar与补审由verify保全。native_ui_research在保存原生顶部模块阶段后负责最小修复，仍只写扫描插件及自身证据，不触碰共享App/FIX-03。

修复必须先证实真实私有目录的absolute/canonical路径差异；合法系统目录别名可规范到同一可信根，仍保留UUID/token归属、严格规范化子路径/普通文件/状态边界。不能直接删除防越界判断、任意放宽路径或把失败改成empty成功。增加针对实际根别名的有效回归，并在最终harness实际断网识别与透视/PDF自测后交独立复核；首次失败史和修后清洁状态分别记录，不能混称从未失败的首次通过。
