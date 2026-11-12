# 105 当前源双端候选包构建记录

2026-11-10。只执行本轮授权的串行构建、签名和核包；未安装、运行设备或更新 README。独立审核与后续运行/发布由父级另行决定。

交付目录：`artifacts/releases/20261110-modernization105/`。

| 项目 | 准确值 |
| --- | --- |
| 版本 | `0.1.0` |
| revision / dirty | `bf26dae17f972fc09276deb456b4599e1ebe5d67` / true |
| 产品输入 | 445 |
| fingerprint | `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9` |
| 同一 prepare UTC | `2026-11-10T01:08:57.822Z` |
| Mac builtAt UTC | `2026-11-10T01:09:35.707Z` |
| Android builtAt UTC | `2026-11-10T01:18:18.059Z` |

构建前约40.52GB可用；过程未接近2.5GiB停止线。共用 root `src-tauri/target`，jobs2、incremental0、`RUSTFLAGS=-C debuginfo=0`；先 Mac后 Android，没有第二 target。最终 `final-source-guard.json` 再核源与 stamp完全一致。没有修改产品或扩大输入排除规则。

## 候选文件与准确摘要

| 文件 | SHA256 |
| --- | --- |
| `CyberNote.app` 目录摘要（见 mac.json 的算法） | `027d7a2f1cfbc4f869be21a67d36d365e7cf509cbc80d210917218bc7c023964` |
| Mac实际 `Contents/MacOS/notes-clone` | `afc7dea70272ecd873369b99e95bad7b431d9f4089210661bf9ffc91cf3e9407` |
| `CyberNote-Mac.zip`，36,132,872B | `0424db7621d7a0f9a174e04ab1eac2068f0a8f8f03bdd959c49ce33329449020` |
| `android/CyberNote-Android-arm64.apk`，72,669,322B | `298b830711da80c9ea96dae79ca45126e1f8f2e1347720a5e925a3cc2c430a98` |
| APK实际 `lib/arm64-v8a/libnotes_clone_lib.so`，56,912,472B | `d77795fb4d3cae004a76a24825c6c4a125ffe9a1d3a26d3c1da2565eea3153a1` |

Mac采用本机 ad-hoc签名，`codesign --verify --deep --strict --verbose=2` exit0，未公证。Android16KiB对齐、v2/v3签名通过，与保留r2包证书SHA256相同：`e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。证据为 `mac-sign-*.txt`、`android-sign-*.txt`、`android-same-certificate.json`；未连接ADB核当前设备。

## 包内资源与字体

`stage-verify.mjs` 从本次前端builtAt+metadata/runtime识别真实codegen（不是mtime/旧hash猜测），复制到 `mac-codegen-assets` / `android-codegen-assets`，原路径与匹配资源见各 `*-assets-origin.json`。`mac-frontend` 与 `android/android-frontend` 均保留。`mac.json` / `android.json` 经最终签名与 lint后再次 exact-entry核验；Android复制主库与APK实际单ABI入口SHA相同，Mac入口由plist解析，且两端真实主入口都包含本批匹配metadata与生产runtime。

源字体SHA256 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`、16,437,364B完整序列在Mac入口出现两处（13868418、30331509），Android两处（2082356、18663083）。证据 `mac-font-embedded.json` / `android-font-embedded.json`，不声称只嵌一次。没有复制字体原件做交付旁置资产。

OFL与字体README（已有版权/来源/未修改说明）原样放在本批 `notices/noto-cjk/` 和 `android/notices/noto-cjk/`。MacZIP包含已签名app和notices，每个归档文件与最终stage逐字核对，见 `notices-manifest.json` / `mac-zip-content-check.json`；许可是分发附带文件，不是APK/app资源声明。父级发布时须保留完整分发目录及下载处可达说明。

## 本批实际完整 lint

在 root Android工程运行：

```sh
./gradlew :app:lintUniversalRelease -x :app:rustBuildUniversalRelease --max-workers=2
```

exit0、BUILD SUCCESSFUL in6s、139tasks中1executed/138up-to-date。这里真实执行完整lint入口并保留Gradle增量复用事实，不声称强制重做每个分析；没有baseline/新抑制。仅排除已由Tauri完成且准确核验的重复Rust任务，避免TauriRPC关闭后重新调用它。报告0Error、30Warning、1Hint；XML/HTML/TXT/SARIF已复制 `android-lint-reports/`。`android-full-lint-result.json` 记录本批 APK/mainlib摘要与命令；lint后APK摘要未变。

## 退出与范围

Mac cargo14200、Android cargo18532、helper18185均退出；本轮Gradle daemon18927经 `./gradlew --stop` 正常停止。`build-processes-exited.json` 检查Cargo/rustc/Gradle wrapper/daemon/helper均无进程，检查时可用37,914,202,112B。无缓存删除；没有停止无关持久app/Vite进程。构建负载已结束，性能任务是否运行由父级单独发gate。

本记录只证明新候选包身份、签名、包内字节与lint。104已有生产renderer中文SVG证据仍是源码事实，本批没做新的双端中文缩略图或其他UI实测。Android102原r2长按选字关闭格式面板的失败尚未解释/修复，诊断不复现不计修复；Mac旧录音授权/实体触摸板捏合边界也不因新核包变成通过。105 host/performance结论另列。r2/v2旧包未覆盖，本批未发布README，不称完整目标达成。
