# Unified candidate03：构建准备，尚未冻结或执行

2026-11-04。native_ui_research 按 root 排期仅准备；等待 zero-result UI 与 recording-submit 父层保存 ACK 候选分别独审、合入后，由 root 给出最终精确 HEAD。这里没有 candidate03 源码身份、输入聚合、构建结果或运行验收；不得将当前可变主线当作已冻结候选。

## 最小串行方案

使用主工作区现有依赖、默认 features 和现有 `src-tauri/target`，不复制 target、不升级依赖、不安装 SDK，不重跑广域 Rust/媒体矩阵。获得最终 HEAD 且 root 串行借出 target 后：

1. `python3 docs/verification/unified-candidate03/build/capture-inputs.py <exact-HEAD> docs/verification/unified-candidate03/build/source-inputs-before.json` 冻结列明输入。脚本要求40位精确 HEAD、无已跟踪更改、无未跟踪构建源码，默认相关 flag 全部未设，并记录 Android 原环境和脚本实际回退路径。
2. `run-build.py mac <exact-HEAD>`：再次核同输入/环境与剩余空间，执行 `pnpm mac:build`。该命令为现有 `tauri build --bundles app`，含 beforeBuildCommand `pnpm build`，默认 release，不加 proof 或 features。
3. `capture-outputs.py mac`：复核 HEAD/全部列明输入未变，保全原 bundle、zip、可执行文件/全 bundle/dist 的 SHA，保留原签名严格验证结果。`seal-mac.py` 仅对另份副本做现有本地 adhoc 整包签名和严格 deep 验证，核原副本未变、差异只限签名字段/CodeResources，保存新身份。
4. 完成 Mac 产物保全后串行 `run-build.py android <exact-HEAD>`，执行 `pnpm android:build --debug`。现有包装脚本实际追加 `--target aarch64 --apk`，预期仅 arm64-v8a；`capture-outputs.py android` 再核输入，保全 APK、内嵌 .so/JS/CSS/HTML/config 和 dist 身份，运行已有 apksigner 只读验签。实际 ABI/签名结果以产物为准。
5. root 核验完整日志、三份输入清单、产物身份并保存；target释放。安装及运行交独立 verify，构建阶段不碰设备、GUI、权限或测试笔记。

4份准备脚本位于本目录，均已作 Python parse检查，未执行其捕获或构建主体。正式命令由 exact-HEAD参数和 source-inputs-before.json双重约束。每次构建保留 stdout/stderr合并完整日志、时间、命令、exit和阶段前后剩余空间；已有attempt日志/产物身份/保全路径拒绝覆盖。Android既有构建需临时本机通信服务，若当前执行权限再次拒绝，保留原失败后按同命令申请所需执行权限；不改配置/产品来绕过失败。

## 输入收集

以 `f07-audio-integration/build-candidate02/source-inputs-before.json` 的219路径为前集，合并最终 HEAD 已跟踪的 `src/`、`src-tauri/`、`scripts/`、`assets/`、`patches/`、native-toolbar插件及根配置/锁文件。保留前集已列明的生成 Android文件和 patched ProseMirror实际依赖文件；构建输出、docs和运行证据不列为源码。每项路径/字节/SHA和整体按 `sha256 + two spaces + path + LF` 聚合；这不是全体SDK/OS/依赖可复现声明。

准备时只检查路径存在，**没有生成 candidate03 freeze或hash清单**。当时 advisory union为229，前219以外新增10路径：

- `src/RecordingPanel.tsx`、`src/RecordingPanel.css`、`src/recording-clock.ts`。
- `src/attachment-submission.ts`、`src/attachment-target.ts`、`src/save-queue.ts`、`src/trusted-synchronization.ts`。
- 两项 attachment检查和 `scripts/check-recording-panel-browser.mjs`。

`src/App.tsx`、`src/bridge.ts`、`src/style.css`、两项focus插件源和原录音Session在旧219中已有路径，正式必须记录新内容hash。零结果UI、父ACK及其检查最终新增路径由tracked union自动纳入；最终count允许变化，不能预称229即最终输入。

## 现成工具和环境

准备时只读确认：Node22.16.0、pnpm10.15.0、Rust/cargo1.97.1 stable-aarch64-apple-darwin，已安装 aarch64-apple-darwin与aarch64-linux-android target；Apple CLT路径 `/Library/Developer/CommandLineTools`，clang21.0.0。JDK17.0.19和Gradle9.6.1已存在；SDK36/build-tools36.0.0/apksigner已存在。

原环境 `ANDROID_HOME=/Users/water/Library/Android/sdk`；NDK_HOME指向不存在的28.2目录，现有 `scripts/android.mjs` 因exists检查回退到已安装27.2.12479018，和candidate02成功日志相同，无需升级。JAVA_HOME指向现成 `/opt/zerobrew/opt/openjdk@17`，该bin/java实际可运行；系统java_home报告没有系统注册JRE不构成该脚本缺JDK。正式冻结会再次记录实际路径。

准备时 `VITE_ACCESS_BOUNDARY_PROOF`、`TAURI_CONFIG`、`TAURI_ENV_PLATFORM`、`CARGO_BUILD_TARGET`、`CARGO_TARGET_DIR`、`RUSTFLAGS`均未设。构建工作区为主目录，因此未设CARGO_TARGET_DIR时使用主现有target；不额外设proof或改默认features。Mac仍是本地adhoc副本，非开发者签名/公证；Android仍是现有debug配置，不声称公开发行签名。

## 路径和资源

- 构建Mac原输出：`src-tauri/target/release/bundle/macos/备忘录.app`；保全 `/private/tmp/notes-unified-candidate03-mac-<exe-sha8>.app` 和zip；另份 `/private/tmp/notes-unified-candidate03-mac-sealed.app` 和zip。
- Android原输出：`src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`；保全 `/private/tmp/notes-unified-candidate03-android-<apk-sha8>.apk`。
- 证据使用本目录，旧f07 candidate01/02包、sealed包、APK及证据不替换。

准备时数据卷约5.0GiB可用（99%容量）；主target9.2G，包括debug5.7G、Android2.3G、release1.2G，debug incremental约1.3G。现有Android build754M，node_modules171M。按旧包体积，新保全副本约APK0.3G与Mac不足0.05G，编译增量额外用量不能预先保证。采用单target串行增量，不复制，不预先clean，也不清旧包/数据。每阶段前重新检查，若低于2GiB则该阶段拒绝启动，保留已有输出，交root重新安排资源；本准备没有删除或清理任何缓存。

正式构建后仍仅能确认构建/输入/签名/产物身份。文件picker E2E、录音父ACK E2E、快捷键快速粘贴、零结果UI和像素分别由新包独立验证，不合并成一次“完全一致”结论。
