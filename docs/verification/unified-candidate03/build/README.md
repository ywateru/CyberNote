# Unified candidate03：构建与保全完成

2026-11-04（Asia/Shanghai）。root 授权冻结并串行使用主 target；精确源码 HEAD 为 `c6594dbdfe8ee0313205a4b14bcdfeb37b819088`。Mac 默认 release 与 Android debug 已成功，产物已另存；共享 target 已释放。本轮没有安装／运行新包、操作 GUI／设备／笔记数据或验证真实媒体与像素。

## 输入与构建

最终冻结清单为 **232 项**，aggregate `499805fac0772a9602eb75765278eafb94b888761bdf4efd60338dd64b858470`。`source-inputs-before.json`、各 guard 及 `source-inputs-after-mac.json`、`source-inputs-after-android-attempt02.json` 的列明内容相同，HEAD 未变；相关 features／proof／target／Rust flags 均未额外设置。该清单包括已列明生成 Android 与 patched dependency 文件，不是完整 SDK／OS／全部依赖可复现声明。

| 阶段 | 实际原命令 | 结果／原记录 |
| --- | --- | --- |
| Mac | `pnpm mac:build` | exit0；`mac-build.txt`、`mac-build-exit.json` |
| Android attempt01 | `pnpm android:build --debug` | exit1；Rust 编译完成后创建本机 WebSocket 服务被环境拒绝 `Operation not permitted (os error 1)`；`android-build.txt`、`android-build-exit.json` 保留原始失败 |
| Android attempt02 | 同一 `pnpm android:build --debug` | 必要执行权限获准后 exit0；`android-build-attempt02.txt`、`android-build-attempt02-exit.json` |

重试包装脚本只另命名日志／exit／guard／identity 与 postbuild 清单，保留相同源码、环境核对及构建命令；`run-build-attempt02.py`、`capture-outputs-attempt02.py` 随证据保全。Android 现有包装器实际执行 `tauri android build --debug --target aarch64 --apk`，使用现有 NDK `27.2.12479018` 与现有 JDK。未安装或升级工具，未 clean／复制 target，未修改产品／依赖／默认 features。Vite 的大 chunk 提示在原日志保留，构建没有因其失败。

## 保全产物与身份

| 产物 | 保全路径 | 关键身份 |
| --- | --- | --- |
| Mac 原 bundle | `/private/tmp/notes-unified-candidate03-mac-149d7769.app` | 原 exe 15,648,560 B；SHA256 `149d7769cdd926f621642e586a83adf32d6bbdc0e32e8f7922e5a5c213591b5d` |
| Mac 原 zip | `/private/tmp/notes-unified-candidate03-mac-149d7769.zip` | 4,698,004 B；SHA256 `caf9ac888bc11e6696b57677a362fb331a05500207cd20ea048466fa80e8956e` |
| Mac 完整本地签名副本 | `/private/tmp/notes-unified-candidate03-mac-sealed.app` | exe 15,575,712 B；SHA256 `f11565151c018ae43173b2f2b1d5b223f0e29b2150fc179a34645a74cb0d3c56` |
| Mac 签名副本 zip | `/private/tmp/notes-unified-candidate03-mac-sealed.zip` | 4,630,240 B；SHA256 `800b7fb1b7d904997e997c13a42855b33b1a13bc84f25820da6c096f33e66362` |
| Android debug APK | `/private/tmp/notes-unified-candidate03-android-bd29ae0b.apk` | 302,064,554 B；SHA256 `bd29ae0b526cafa9b491d645587f5ae7b1254f0e56ad7fc7df309b2fed143477` |

完整身份分别见 `mac-build-identity.json`、`mac-derived-identity.json`、`android-build-attempt02-identity.json`。原 Mac bundle 与保全副本逐文件相同；原链接器 adhoc 签名没有资源封装，严格验证 exit1，原因原文保留于 `mac-codesign.txt`。只对另份完整 bundle adhoc 签名，sign／strict deep verify 均 exit0，原副本未变，Info.plist 未变；`mac-derived-codesign.txt` 保存结果。这是本地签名，不是开发者证书／公证／公开分发验收。

`mac-signature-payload-comparison.json` 是额外的窄说明：在两份临时可执行副本上去签名后，原始逐字节比较并不完全相同；仅剩 `__LINKEDIT vmsize` 字段中的两个字节不同（offset 3313、3314），该字段归一化后其余全文件相同。没有改动保全原包或签名副本；未继续扩展签名审计。

APK `apksigner verify` exit0，v2 签名，证书为既有 Android Debug；实际 ABI 仅 `arm64-v8a`。APK 内 `lib/arm64-v8a/libnotes_clone_lib.so` 为 150,008,520 B，SHA256 `887ac2eaf9d58ae78f2df47aa9deecf3718ea9c290b7adde1825308f67d23b36`。身份文件记录 APK 内 `.so` 与 `assets/tauri.conf.json`；本包没有单独 ZIP 条目的 JS／CSS／HTML，不声称已从 native 内嵌资源独立抽取这些内容。Mac 与 Android 的构建 dist 三项字节／SHA 相同，分别记录在各 identity；这也不替代运行时 WebView 所加载资源的独立核实。

## 交接

构建日志、每次 exit、输入清单、签名结果、产物身份及重试脚本均列入本目录 `build-manifest.json`（排除自身）。保全新包已交 root／独立 verify，构建阶段不触任何设备或用户数据。后续按新包身份分别验证文件选择器、录音父 ACK／冷启可听播放、搜索快捷键及零结果 UI；本报告不追认旧 candidate02 包含新实现，也不宣称已像素一致。
