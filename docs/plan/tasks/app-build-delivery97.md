---
id: app-build-delivery97
scope: build-delivery
status: done
depends-on: []
---

## objective

落实 docs/architecture/build-delivery.md 的版本/构建时间/源码指纹注入、双端可见版本信息和可复用发布标识/核验流程；维护 Mac/Android 功能对应表与唯一最新交付入口机制。此任务只准备源码与工具，最终准确双端打包在 FINAL101，不能声称提前完成完整交付。

## context

docs/architecture/build-delivery.md、docs/plan/cybernote-modernization-state.md、README.md 的现有产物、docs/ui/preferences.md。

## path

构建脚本/配置（vite、package、Tauri/Cargo/Android 版本）、新构建标识模块、src/Preferences.tsx/CSS 的版本信息、README 中交付入口及 docs/platform-feature-matrix.md、新构建标识测试。不改 App.tsx、Editor/TableControls/editor-actions、native-toolbar 或表格 CSS。需要其他路径先报告。保留主工作区所有既有功能和设计。

## verification

- 元数据来自真实源码/构建环境，不是硬编码 buildAt；源码变化导致指纹变化，生成文件/target/log 不改变指纹；过期发布标识拒绝。
- 双端设置真实渲染可见（390px、桌面、明暗主题）、包内前端元数据检查；版本源一致检查。
- 现有 pnpm build/mac:build/android:build 入口不被新流程绕过；标准构建与开发预览均可启动。
- 运行相关 build/设置回归，不重复 native 打包，不动 ADB 设备；独立审查后整合。

## implementation / development verification (2026-11-09)

- `package.json` 为应用版本源；`version:sync` 同步 Tauri/Cargo/Cargo.lock，Android 从相同文件派生 versionName/versionCode；构建自动检查版本漂移。当前版本保留 0.1.0，最终发布升版由 FINAL101 执行。
- 生产 Vite 构建注入真实 UTC 时间、Git revision 与产品输入 SHA256，并输出相同 `dist/build-info.json`。设置两端可见完整指纹；开发预览不伪造安装包时间。产品指纹包含未提交产品代码，排除输出、日志及 Tauri 自动生成的 Gradle 依赖桥接文件。
- 新增 `release prepare / verify-frontend / verify-package / publish`；包内核验要求 metadata 与生产 JS 的原始嵌入字节均存在于包内二进制。README 保留准确旧快照入口，只有两个同源包核验 manifest 才能统一发布新入口。
- `pnpm test:build-info`：21 项通过，包含真实生产 build、过期 stamp 拒绝、压缩嵌入检测边界、Mac/390px移动明暗设置渲染。证据为 `artifacts/build-delivery97/result.json` 与四张同目录截图。`pnpm version:check`、`git diff --check` 通过。
- 既有 `check-preferences-redesign.mjs preferences` 桌面/移动回归在库存失败重试断言处失败（`scripts/debug/preferences.mjs:138`）。暂时恢复基线 7ab23a07 的 Preferences.tsx/CSS，在相同 configFile:false 隔离环境重跑桌面仍同样失败；此前设置行为检查通过。基线证据为 `artifacts/build-delivery97/preferences-baseline/`，不扩改 DataManagement，也不称完整设置回归通过。
- 本任务没有 native 打包、安装或 ADB 操作；真实 Tauri 二进制嵌入检查、Gradle 编译、双端设备与最终同源安装包仍由 FINAL101 执行。合并/提交会改变 Git revision，最终必须重新 prepare/build，开发时 dist 不作为交付包。

## independent-review fix (2026-11-09)

- 修复独审 P1：Mac binary 必须与 Info.plist 实际 `CFBundleExecutable` 完全对应，并拒绝无效/缺失入口和逃逸链接；Android 固定依据 Cargo 主库名与 APK 实际单 ABI 路径核验，不再由调用者 basename 选择辅助库。manifest 增加 `packageEntry`。
- 独立 `node docs/plan/reviews/app-build-delivery97-probe.mjs` 自然通过两项；新增 `node scripts/check-release-entry.mjs` 18 项入口边界通过。原独审 probe 未改动。对应证据：`artifacts/delivery97-review/package-entry.json`、`artifacts/build-delivery97/package-entry-boundaries.json`。
- 只读核对历史真实 Android APK，确认为 `lib/arm64-v8a/libnotes_clone_lib.so`，主库字节比对通过；有辅助库但不会被当成主库。记录：`artifacts/build-delivery97/actual-android-entry.json`。这不追认该旧包具备本轮构建信息。
- `pnpm version:check`、`git diff --check` 通过；本修复仅改变核包边界，未重复 UI/native 构建，未安装或操作 ADB。待独立复审，FINAL101 的实际同源核包和设备运行仍待完成。

## accepted integration (2026-11-09)

- 9e9f764a 独立复审 pass，入口 F1 关闭，18 项入口边界、原 probe 及历史 APK 主库读验通过；未证明新 native 包。
- 将 7ab23a07..9e9f764a 的任务差异回填主目录，保留其他既有改动。主目录 `pnpm test:build-info` 21 项、`node scripts/check-release-entry.mjs` 18 项及与 TABLE95 组合 `pnpm build` 均通过。证据 `artifacts/modernization101/{delivery97-integration,release-entry-integration,combined-build}.log`。
- 本任务 done 仅指版本工具与界面源码；最终版本升级、同源 Mac/Android 构建/签名、包内核验、设备运行和 README 发布仍由 FINAL101 实施，完整目标保持 active。
