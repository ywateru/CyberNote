# d69 双平台实际包独立复核

结论：接受下述冻结源码对应的 **macOS arm64 本地 production 候选和 Android arm64 unsigned release 候选的静态交付检查**。限定范围内无新增 P1/P2。审阅日期为 2026-11-13；机器可读的实际文件摘要、ELF 清单、features 与锁文件 SHA-256 见 [checks.json](checks.json)。本目录仅为过程证据，不加入公开源码导出清单。

| 对象 | Exact identity |
| --- | --- |
| 原始 source snapshot | `d69ffbce2ad1284e6c7ce830f6840ba083148aab` |
| 独立净化 root | `d7f3e2a9431f80ae5711a6a8f3fb3c55b86e3cbd` |
| 净化 tree | `dd810c45833ffb999a292a1ffc8bbe9a9df9fd27` |
| source fingerprint | `3f3b76ebfe6c8a146cb35ffad5b4daeff2696c05612dc8846a55a2d450de2058` |
| Mac 作者 / main 证据提交 | `97cd013cb9192bacfda00f0ce5be1ee12349232b` / `3459539ffaa69943e43a7157bf24985163f340b5` |
| Android 作者 / main 证据提交 | `bb4d4ef3548abb22bebecebad3ade27d8f56adc7` / `9141133ceea51745a940c468b05be036655ad533` |

净化基准目录为 `/private/tmp/account109-source-snapshotd69-prepared-20261113-01`。Mac source/target 分别为 `/private/tmp/account109-sourced69-macos-source-20261113-01`、`/private/tmp/account109-sourced69-macos-target-20261113-01`；Android source/target 分别为 `/private/tmp/account109-sourced69-android-root-20261113-01`、`/private/tmp/account109-sourced69-android-target-20261113-01`。正式复制件位于主工作区 `artifacts/account109/{macos,android}-sourced69-production-candidate-01/`。

## 实际包与身份

| 实际正式文件 | Bytes | 独立 SHA-256 |
| --- | ---: | --- |
| `CyberNote-macos-arm64.zip` | 51,958,444 | `f92854f452d21a6772f7496b1d2f8196d56e0656f5774b26b9ea7074e5c2dd76` |
| `CyberNote-android-arm64-unsigned.apk` | 51,613,687 | `82f79f7e306fd60f2148132eae1f727efb7876fdcfb0bc1b7b59087d1565145d` |

独立读取正式包，而非仅信任 sidecar。两平台各四个正式文件（package、notices、receipt、checksum）均与各自 source 的 `release-packages/` 逐字节相同；包及 notices 的重算 SHA 与 receipt/checksum 一致。ZIP entry 唯一。

从实际包提取 native bytes，仅作内存读取；其包含当前 Tauri codegen 的 Brotli build-info payload。解压后的 JSON 与 dist、receipt 一致，再调用生产 `validatePackageInfo` 对当前 clean source 重算核验。两包均为 schema=1、version=0.1.0、mode=production、各自 target、sourceDirty=false、inputCount=1619、releasePreparedAt=null，revision/fingerprint 为上表身份。Mac builtAt 为 `2026-11-12T21:18:07.723Z`，Android 为 `2026-11-12T21:20:28.376Z`。

Mac 实际入口为 thin arm64 Mach-O MH_EXECUTE，bundle ID 为 `com.local.notesclone`，版本 0.1.0。Android 实际 native 与 release target 的 `libnotes_clone_lib.so` SHA 相同；全部五个打包 `.so` 均验证 ELF64、little-endian、ET_DYN=3、AArch64=183、header version=1/size=64，未只依据目录命名。provider 的实际包内 bytes 与 retained runtime asset、manifest path/hash/size pin 相同。逐库大小和 SHA 在 JSON 中。

## Android 实际 unsigned 与 compiled manifest

对正式复制件运行冻结 production helper 的 `require_unsigned_apk`：无 JAR 签名标志、无 APK signing block footer；实际 SDK build-tools 36.0.0 apksigner 返回 exit 1，stdout 为空，stderr 恰为：

```text
DOES NOT VERIFY
ERROR: Missing META-INF/MANIFEST.MF
```

这满足已审的精确 unsigned 诊断，未把任意非零退出当成功。运行实际 `aapt2 dump xmltree <copied.apk> --file AndroidManifest.xml`，生产 helper 的 namespace/name/framework ID 绑定检查通过：package=`com.local.notesclone`、versionName=0.1.0、versionCode=1000、minSdk=26、targetSdk=36。application 未出现 debuggable/testOnly，使用 Android 默认 false；不是因文本改名漏掉属性。实际 callback filter 恰一份，scheme=`com.local.notesclone.auth`、host=`callback`；DEFAULT/BROWSABLE、Android VIEW 与 ChromeOS VIEW action 保留。

原三 P2、parser 最后一项绕过及生成配置的 exact-commit 独立复核见 [Android staging review](../android-stage-review/README.md)。该记录包含 8 tests 和真实 aapt2 改名保留 ID 反例。本次没有重跑 stage suite 或反例，不改写旧 root 结论；此处补足最终 root 的实际包检查。

## 默认入口、features 与构建证据

分别解压实际 native 中的主 JS Brotli payload，核对其与当前 dist 的完整字节相同。两个包的实际代码均保留 `function bp(){return!!(globalThis||window).isTauri}`、`hv=bp()||!1` 和 `if(!hv)` native command guard。仅在隔离 JS context 执行该纯 helper：isTauri=false 时不可用、true 时可用。未执行整包 JS、native 或 App；静态结论是默认 production 原生入口存在且无需 `ACCOUNT_NATIVE` 构建开关。

已核对作者 build/retry helper 的环境白名单，无继承 VITE/TAURI/NODE_ENV/RUSTFLAGS 开关。实际 Cargo fingerprint 的产品 features 为 `[]`，无 `sync-e2e`、`access-boundary-proof`；Tauri 有 `custom-protocol`、无 `devtools`。Mac 同时检查被打包 binary 对应的 fingerprint，避免将旧缓存另一个 fingerprint 当作证据。主 JS 未出现 ACCOUNT_NATIVE/debug/UI 环境标志及所查 debug hook marker。

Mac 日志包含实际 `--release --locked --offline` 成功构建。Android 实际 Tauri release 构建成功，前置 metadata 使用 `--locked --offline`，构建环境为 `CARGO_NET_OFFLINE=true`；其 Tauri build argv 未显式传 Cargo `--locked`，本记录只确认四个锁文件构建前后及最终 bytes 均未变化。Android 初次 APFS 克隆缓存尝试因旧 Tauri Kotlin codegen 路径失败，定向清理自有 tauri cache 后 retry02 成功；tracked source 与锁文件仍保持冻结状态。此项是已恢复的本地构建历史，未隐藏为首次成功。

## Notices、锁文件和隔离范围

两份 notices ZIP 分别有 1200 个条目；名称集合及每个实际 payload 均与冻结 manifest 经生产 `notice_payloads` 得到的已核 SHA bytes 一致。包括 9 份 Rust direct license、Rust provenance 和 1138 份 SDK license bundle 文件；总数之外也逐字节验证。四个锁文件在 pristine、两份实际构建 source、各自 committed HEAD 及记录的构建前后摘要一致，精确 SHA 见 JSON。

已完成的 final-root 独立检查确认 1770 个 retained 文件、95,104,733 bytes，只有七个既有 hash 刷新；policy、SDK/runtime/notices pins 未改。实际两份 build source 的 1770 个 tracked 文件与 pristine 相同。重算 clean source identity 与上表一致，`verifyNewRoot` 确认一份无 parent 的 main commit/ref、无 remote/保留历史。过程文档未导入公开 root。没有因 ignored target/dist 变化伪报 source mismatch。

旧 source5d30 Android APK、source5d30 Mac ZIP/notices/receipt/App 主程序及 ad18 Mac ZIP 的原摘要保持不变；JSON 记录了保留路径与摘要。最终 Mac ZIP 在 Android 审阅时再次实核也保持不变。

## 有限接受边界

本复核接受上述 exact bytes 的本地候选构建、静态架构、嵌入身份、默认入口、构建 features、notices 与源码/锁文件隔离证据。Android 使用本地 macOS Homebrew OpenJDK 17.0.19，workflow 使用 Ubuntu Temurin 17；未宣称实际 GitHub Actions 执行或可复现构建。features/build 环境依据保留日志、helper 和 Cargo fingerprint，并非可验证构建签名。

本次未编译大包、安装、调用 ADB、运行 App/UI、访问用户库、登录或进行远端操作。未验证设备 callback、手机 smoke、账户/同步、发布部署、Developer ID/notarization、分发签名或商店资格。Android 仍需分发方签名才能安装。Singer 的独立 debug/手机工作不属于本 production 包审阅结论。
