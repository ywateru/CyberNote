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
