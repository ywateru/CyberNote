---
id: app-final101-package-review-r2
scope: final101-package-identity
status: r2-package-identity-accepted-runtime-format-failure-blocks-completion
reviewer: media99_research
---

# FINAL101 r2 独立核包审查

2026-11-09/10。Mac 与 Android 最终包的当前源码、真实启动入口、内嵌资源、版本与本机签名完整性核验通过；两端同源、同 prepare，实际 build 时间分别记录。parent 本地 publish 后，README 唯一最新入口另经只读复核通过。两份原生运行报告的有限证据审查见 [runtime r2](app-final101-runtime-r2.md)：其余范围已审，Android 格式面板因正文长按而消失已确认实际失败，阻塞完整验收；r2包身份的历史核验结果不变。首批 superseded 结果保持在 app-final101-package.md 和原始证据目录，本报告不覆盖其历史状态。包身份审查不替代 UI、ADB 真机或完整六项功能验收。

## 核验范围与结果

批次：`artifacts/releases/20261109-modernization101-r2/`。独立脚本、完整 JSON 和命令退出码/原始签名日志：`artifacts/final101-package-review/r2/`。脚本 `review-macos.mjs` 调用生产核包工具，另外直接校验当前输入集合、codegen origin/copy 清单、真实启动入口内的编码字节及解压后完整 frontend JS 字节。未构建、未签名、未修改产品/作者 manifest，未发布或触碰 Android 构建输出。

| 检查 | 独立结果 |
| --- | --- |
| 当前产品输入 | 437 项路径/SHA256 全等 r2 product-inputs.json；该清单未登记逐文件长度，独立结果已记录实际长度 |
| 当前源标识 | revision `bf26dae17f972fc09276deb456b4599e1ebe5d67`，dirty=true；指纹 `1c99f39a70e9a00399e40cd8b298b0531929dd9ed518007a44602875bf5efb7f` |
| 与首批输入的差异 | 完整集合比较只有 `src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml` 的 SHA 变化；无输入增删 |
| 共享 prepare / Mac build | `2026-11-09T14:41:44.278Z` / `2026-11-09T14:41:51.600Z`；stamp、frontend、包内元数据、作者 manifest 一致 |
| 实际入口 | plist CFBundleExecutable=`notes-clone`；realpath 精确为该 app 的 Contents/MacOS/notes-clone，Mach-O arm64 |
| 名称及版本 | CyberNote；bundle short/version、frontend、stamp 均为 `0.1.0`；identifier=`com.local.notesclone` |
| 最终目录 SHA256 | `3459a376f989304e5f473edf0b3300399bfcaabd2985299eee703d95c63aed78`，独立审查前后及作者 mac.json 一致 |
| 真实入口 SHA256 | `775625ae022895ecf89183f839a5e3af443d518b411d66ea5fd65edbc074663f` |
| codegen 来源 | mac-assets-origin.json 的 origin、copy、buildLog 路径均核对；copy 的全部 12 文件路径/长度/SHA256 精确等于当前实际 origin。缓存可包含历史资源，接受的两份 witness 必须另外匹配本次 frontend 和实际启动入口，不能以清单匹配代替字节证明 |

## 实际入口中的准确资源

| 资源 | 实际内嵌 witness | 完整解码验证 |
| --- | --- | --- |
| metadata | offset `13338237`，223 B；编码 SHA256 `0ccd75d95f108d3776f00fa137a90668ed41de149789507fe1e5bfc85e7f00b6` | 376 B；准确等于本次 mac-frontend/build-info.json，含 r2 指纹、prepare、Mac builtAt |
| runtime | offset `13366261`，343819 B；编码 SHA256 `c257f87c5c96ff655b7bb9c4c86503210bd0b0efcecaa71cc007c1c4aa4f78fd` | 1221780 B；逐字节等于本次 mac-frontend/assets/index-BGgWbK5k.js；解码 SHA256 `ffe789ffd708f6b9966445559fe55bca2e895c7910c8cfdaad5ae0642e861d19` |

两份 witness 与作者 manifest 的编码 SHA 一致。核对对象为 plist 实际启动入口，非旁置 JSON、旧 frontend、任意缓存或辅助二进制。

## 签名与限制

独立执行 `codesign --verify --deep --strict --verbose=4` 退出 0，valid on disk / satisfies Designated Requirement。显示为 ad-hoc 签名，TeamIdentifier 未设置，CDHash=`7f26fdc60509f9207d9cea25d8c03bfdbb18c5b8`；Apple Events entitlement 已登记。

`spctl --assess --type execute --verbose=4` 退出 3、rejected。本轮接受本机 ad-hoc 完整性，不能称 Developer ID、notarization 或 Gatekeeper 默认允许。真实 Mac UI/运行验收由 parent 单独记录，核包结果不替代功能验收。

## Android 与双包核验

收到 parent 明确 Android 构建完成 gate 后，独立运行 `artifacts/final101-package-review/r2/review-android.mjs`。完整输入清单、准确字节 witness、签名/对齐/manifest/network 命令及退出码保存于同目录 `android-dual-review.json` 和 `android-*.log`。只读取 stage、原始 codegen origin 和原始主库；核对完成后已通知 parent 不再依赖原 target，以允许其清理已完成构建缓存。

| 检查 | 独立结果 |
| --- | --- |
| Android 最终 APK | `artifacts/releases/20261109-modernization101-r2/android/CyberNote-Android-arm64.apk`，38475914 B |
| APK SHA256 | `6d75b1613cd07909de52ecc5c722cd453186c1dd47c3ad63645befb17758adf4`；核验前后、android.json、origin mapping 一致 |
| 真实主入口 | 依当前 Cargo lib 名定位 APK 的唯一 `lib/arm64-v8a/libnotes_clone_lib.so`；不能选择其余 3 个辅助库代替；原 APK entry、stage 主 SO、原 target 主 SO 字节全等 |
| 主 SO SHA256 | `fcfefc12b97c073c2ef3e9873daf1c9ca13be77ccdbcc4b3efdc6f1c022e54fa` |
| 版本 / 实际构建时间 | APK manifest versionName=`0.1.0`、versionCode=`1000`、包名 `com.local.notesclone`；frontend builtAt=`2026-11-09T14:47:14.179Z` |
| source / prepare | 完整 437 项当前产品路径/SHA 再核对一致；与 Mac 同 revision、指纹 `1c99…` 和 prepare `2026-11-09T14:41:44.278Z`，未把不同平台实际 builtAt 混为相同 |
| codegen origin | origin mapping 的 sourceCodegenAssets 与保存的 android-codegen-assets 全部文件路径/长度/SHA 相同；前端、主库、APK 路径映射另核实 |
| metadata | 实际主 SO offset `1615710`，编码 222 B；SHA256 `d9ab34463c45199b63f8265ca301de15d53fc0e6fd847217f6bab911a3952e34`；解码 378 B，准确等于该次 Android frontend/build-info.json |
| runtime | 实际主 SO offset `1617771`，编码 343817 B；SHA256 `ae46cad01054e41f7fc331b1194196a5c6c97a611e2968fb0dfa33d96f610d53`；解码 1221780 B，逐字节等于 android-frontend/assets/index-BZaqM9KN.js |
| 签名 | SDK 36.0.0 `apksigner verify --verbose --print-certs` 退出 0，v2/v3=true，一位签名者；Android Debug 证书 SHA256=`e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`；不称商店生产签名 |
| APK 对齐 | `zipalign -c -P 16 -v 4` 退出 0 |
| Mac 产物保持 | 再次计算 Mac 最终目录摘要仍为 `3459a376…`，与上节已验签版本一致 |

Android 的 runtime 解码 SHA256=`70fa51cec3459cf5fd9ca66156c4f84835360d22adb5525eedd624dab069abed`。两端运行时内嵌的平台/时间不同，因此 JS 字节不同是预期结果；相同源码依据是当前完整产品输入和共享 prepare，不要求两个平台的完整运行时文件相同。

## Android release 网络策略与 lint

独立从最终 APK manifest 读取 networkSecurityConfig=`0x7f120007`，再从实际资源表解析到混淆路径 `res/8G.xml`，使用 `aapt dump xmltree` 直接反解析该 APK 文件。未以源 XML 或旁路说明替代包内检查。结果：base-config cleartext=false；只有一个 domain-config 允许 cleartext，其唯一 domain 为 `127.0.0.1` 且显式 includeSubdomains=false。manifest 的 usesCleartextTraffic=false；未发现 Android debuggable=true 配置。

反解析结果逐字等于保存的 packaged-network-security-config.txt；独立资源映射记录保存在 `android-network-resource-map.json`。保存的 lint-results-universalRelease.txt 为 `No issues found.`；本次 android-build.log 记录 `Finished 1 APK at:` 指向 release unsigned APK，之后是签名验证。该日志没有 Gradle `BUILD SUCCESSFUL` 字样，不将其虚构为已记录的日志行。对最终签名包的签名、内容、对齐和网络策略已另行直接验证。

## 发布边界

README 在审查时仍指准确标识的上一轮历史包，本批尚未 publish。两份作者 manifest 的最终候选路径均真实存在，版本/源码指纹/prepare 一致，双端包身份已接受；README 最终更新需 parent 在运行验收后执行，并另核其唯一最新入口准确性。本 reviewer 未执行 publish、ADB、安装或 UI 操作。源输入或最终签名字节改变时须重新核验。

### 本地 publish 后的独立复核

parent 随后执行本地 `pnpm release publish`，只修改 README，没有远程发布。2026-11-09T15:56:06.857Z，本 reviewer 运行独立 `artifacts/final101-package-review/r2/review-readme.mjs`，结果保存于 `readme-review.json`：

- README 只有一个“最新安装包”标题和一对 latest-installers 标记，区内恰好两行；Mac/Android 路径精确等于各自 r2 manifest，真实文件存在且不是指向其他位置的 symlink。
- README 的版本 `0.1.0`、各自 UTC builtAt、revision 与产品指纹前缀均精确等于已核验 manifest；不是把两端构建时间合并。两端保持共享 prepare `2026-11-09T14:41:44.278Z`。
- 当前 437 项产品路径/SHA256 再次全等冻结清单，源码指纹仍为 `1c99…`；Mac 最终目录摘要仍为 `3459a376…`，Android APK 仍为 `6d75b161…`，均未在 publish 后改变。
- 邻近说明明确 Mac ad-hoc 未公证、Android Debug、本次 Mac 麦克风授权超时和实体触摸板捏合未实测且不计通过，未用核包结论掩盖这些边界。

本次复核只接受唯一最新安装入口与包身份一致，不重做 encoded 资源检查，也不从 README 的运行报告链接推定原生功能已通过。两份原生运行报告待 parent 明确完成后另作有限证据审查。审查时 README SHA256=`87db09dac5e94591d3225456fe0edc30383c1181f6d01dd1ce89b436c9030139`。
