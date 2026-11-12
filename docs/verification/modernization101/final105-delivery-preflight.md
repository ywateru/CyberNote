# 最终同源双端交付预检（仅清单）

2026-11-10。本记录只读核对现有规则和工具，以下命令**尚未执行**；没有构建、测试、设备操作、产品修改或缓存清理。105 性能工具由另一作者负责，本记录不改变其冻结 host、样本或测量。

1. **冻结准确产品输入，再 prepare 一次。** 103 Manifest 修正、104 SVG 文字/字体已接受；105 任务当前记录为 revision `bf26dae17f972fc09276deb456b4599e1ebe5d67`、dirty=true、445 inputs、fingerprint `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9`。这是记录时源状态，不是最终包证明；执行时须重新核实际源，禁止用旧指纹覆盖新状态。确认最终 root 没有102诊断 hook/环境标志。版本源仍为 package.json 的 `0.1.0`，不靠重命名包提升版本。

   ```sh
   cd /Users/water/work/2026/Apple-Notes-Clone
   export FINAL105_ROOT="$PWD"
   export FINAL105_BATCH="$FINAL105_ROOT/artifacts/releases/20261110-modernization105"
   export CARGO_TARGET_DIR="$FINAL105_ROOT/src-tauri/target"
   export CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0
   export RUSTFLAGS='-C debuginfo=0'
   export JAVA_HOME=/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
   export ANDROID_HOME=/Users/water/Library/Android/sdk
   export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
   unset VITE_FORMAT102_DIAGNOSTIC
   pnpm version:check
   pnpm release prepare --out "$FINAL105_BATCH/source-stamp.json"
   export CYBERNOTE_RELEASE_STAMP="$FINAL105_BATCH/source-stamp.json"
   ```

   目录须是新批次；若已存在，应选新目录，不能覆盖旧现场。两端共用这个 stamp，`builtAt` 各自为真实 UTC。脚本包含 src/public/plugins/src-tauri（含字体/OFL）及指定配置/锁/脚本；精确排除 target、dist、artifacts 和确定生成目录。不得扩大忽略范围或清掉原有 dirty。prepare 后若任何产品输入变化，应停止并重新 prepare 双端，不能只重建一端。

2. **先 Mac，完成后才 Android，共享原 target。** 不开第二份 target，不同时抢 Cargo/Gradle；可用空间低于2.5GiB停止新增大文件并报告，不删除活跃缓存。

   ```sh
   CYBERNOTE_BUILD_TARGET=macos pnpm mac:build
   ditto "$CARGO_TARGET_DIR/release/bundle/macos/CyberNote.app" "$FINAL105_BATCH/CyberNote.app"
   ditto dist "$FINAL105_BATCH/mac-frontend"
   codesign --force --deep --sign - --entitlements src-tauri/Entitlements.plist "$FINAL105_BATCH/CyberNote.app"
   codesign --verify --deep --strict --verbose=2 "$FINAL105_BATCH/CyberNote.app"
   pnpm release verify-frontend --frontend "$FINAL105_BATCH/mac-frontend" --stamp "$CYBERNOTE_RELEASE_STAMP"
   ```

   保存该次真实 `target/release/build/notes-clone-*/out/tauri-codegen-assets` 到批次并记录 origin。须依据本次 metadata/runtime 与真实入口匹配定位，不能按旧 hash 或仅按 mtime 选目录。解析 staged app 的 Info.plist `CFBundleExecutable` 得到实际入口。Mac 完成并明确授权后，现有 root 专用 helper 可复用：

   ```sh
   CYBERNOTE_BUILD_TARGET=android python3 /private/tmp/cybernote-final101-android/build_sign.py \
     --stamp "$CYBERNOTE_RELEASE_STAMP" --out "$FINAL105_BATCH/android" \
     --mac-complete-and-parent-authorized
   ```

   helper 硬编码本项目 root，适合本次 root 构建；继承上述共享 target/RUSTFLAGS。它构建、核 frontend、复制 android-frontend、16KiB zipalign、以本地 Debug 证书签名并核签名/对齐；**不执行 full lint、精确入口核包或发布**。保留完整日志、实际 Android `aarch64-linux-android/release/libnotes_clone_lib.so`、本次 `build/notes-clone-*/out/tauri-codegen-assets` 及各自 origin；及时复制，避免后续覆盖。

3. **新 APK 实际 full lint，不能借用103旧结果。** `pnpm android:build` 的 assemble/vital 不等于 full lint。103 独立 full lint 的0 errors只是已接受源码证据。

   ```sh
   cd "$FINAL105_ROOT/src-tauri/gen/android"
   ./gradlew :app:lintUniversalRelease -x :app:rustBuildUniversalRelease --max-workers=2
   cd "$FINAL105_ROOT"
   ```

   该窄 exclude 仅用于本次准确 native 已完成、Tauri RPC 已退出后的重用，避免脱离 Tauri 再调用 Rust；不能排除 lint、加 baseline 或压制问题。保存命令、exit、HTML/XML与相应 APK/mainlib SHA，证明 lint 对应本批实际产品。若出现错误，保留失败并修源后重走双端 stamp，不发布失败包。

4. **最终签名后核真正主入口与嵌入资源。** 使用已保存的真实入口/codegen/frontend，不能拿辅助库或旁置 JSON 代替。以下占位路径需替换为上一步已记录的确切路径：

   ```sh
   pnpm release verify-package --platform macos --artifact "$FINAL105_BATCH/CyberNote.app" \
     --binary <该app实际CFBundleExecutable路径> --assets <本次Mac保存codegen目录> \
     --frontend "$FINAL105_BATCH/mac-frontend" --stamp "$CYBERNOTE_RELEASE_STAMP" \
     --out "$FINAL105_BATCH/mac.json" --validation-note <准确实际验收范围及报告路径>
   pnpm release verify-package --platform android --artifact "$FINAL105_BATCH/android/CyberNote-Android-arm64.apk" \
     --binary <本次复制的libnotes_clone_lib.so> --assets <本次Android保存codegen目录> \
     --frontend "$FINAL105_BATCH/android/android-frontend" --stamp "$CYBERNOTE_RELEASE_STAMP" \
     --out "$FINAL105_BATCH/android.json" --validation-note <准确实际验收范围及报告路径>
   ```

   Android 必须是实际 `lib/arm64-v8a/libnotes_clone_lib.so` 与提供主库逐字相同，且仅一个支持 ABI。两端都验证版本、源指纹、prepare批次、实际主入口包含匹配 metadata 和生产 runtime 编码字节。manifest digest在最终签名后产生；包之后变动需重新核验。

5. **104 字体与能力分别记录。** `verify-package` 目前不核字体，另保存只读字节证据：源 `src-tauri/fonts/NotoSansCJKsc-Regular.otf` 为16,437,364B、SHA256 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`；在上一步两个真实主入口中查完整字节出现及偏移，并核 APK成员确与该主库相同。`include_bytes!` 源码不代替最终主库检查。104已有实际生产renderer的中文/繁体/Latin/tspan及冻结50 SVG证据，可引用其源码验收报告；不能称为新 Mac/Android 包的实测。若本批没有新包中文缩略图/画廊定位观察，准确写未实测，不启动额外穷举。支持范围仍为有界横排 text/tspan，Regular近似粗斜体、缺字拒绝、无外部字体/资源，不声称完整 SVG 支持。

6. **字体许可最窄交付路径（无需改产品或105 host）。** 当前 `src-tauri/fonts/OFL.txt` 已有完整 OFL 1.1，同行 README 已有版权、原始来源commit/URL、SHA、未修改说明；字体自身保留版权/许可name metadata。仓库没有另一个集中 NOTICE/LICENSE 打包机制；`release.mjs` 也不会自动复制 notice。现有交付目录与 README 机制足以容纳：在新批次 `notices/noto-cjk/` 原样复制 OFL.txt 与字体 README.md（无需再复制16.4MB字体）；Mac分发 ZIP包含已签名 app和这两个说明，Android交付目录同样保留可达的说明，并在 README 最新下载区旁明确链接许可/来源与整个分发目录。不要把这些说明说成已嵌入 APK/app resources。ZIP另记最终 SHA/文件清单，原 `mac.json` 仍核精确 app；不得把 app manifest冒充ZIP核验。只有带完整许可与版权说明的交付组合才作为可分发对象，不把裸 APK脱离说明当作独立完整分发。此步骤属于 artifacts/README，不改 resources或当前产品指纹，不重建冻结105 host。

   `publish` 会整体重写 `latest-installers` 标记区，且只生成 app/APK链接；故许可/来源及 Mac ZIP 链接放在**紧邻标记区之外**，或发布后在其旁更新现有交付说明。保留一个“最新”批次入口，历史包继续标为历史。

7. **最后才更新唯一安装入口，保留102已知失败。** 完成签名、精确核包/full lint和真实范围记录后：

   ```sh
   pnpm release publish --manifest "$FINAL105_BATCH/mac.json" --manifest "$FINAL105_BATCH/android.json"
   ```

   publish要求恰好Mac+Android两个manifest、同版本/指纹/prepare批次、当前源仍有效及最终产物digest不变。更新功能矩阵/验收链接，准确附本机 ad-hoc 未公证、Android Debug证书。Android102原r2“长按选字后格式面板关闭”实际失败仍未解释/修复，诊断多次不复现不等于修好，必须继续保留醒目限制。Mac录音授权超时与实体触摸板捏合未实测等旧边界不能凭新身份核包变成通过。105性能报告另按其冻结样本/真实源范围陈述，不把host结果扩大为双端native基准。

可复用：现有 SDK/NDK/JDK/签名证书、pnpm依赖、共享 Cargo/Gradle活跃缓存、root Android helper、release工具与已接受源码证据。不能复用为新包：r2的stamp、frontend/codegen/主库/manifest/签名包；v1/v2诊断APK、诊断stamp或诊断原生trace（v2还保留旧full-lint错误）。这些仅供历史审计，不能发布成103/104最终产物。不得覆盖原失败、清用户数据或在此预检重试native variants。
