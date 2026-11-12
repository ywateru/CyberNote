---
id: app-final101-package-review
scope: final101-package-identity
status: superseded-candidate-not-final
reviewer: media99_research
---

# FINAL101 独立核包审查

2026-11-09。旧候选的 Mac 半批源码、准确入口、包内字节、版本及本机签名完整性核验通过；该候选随后被标记为 superseded，不接受为最终交付。Android 产物尚未提交本审查。不将本记录计为 UI、真实设备或完整六项需求验收。

## 候选失效通知

parent 在本次 Mac 审查后通知：Android actual release lint 因 NetworkSecurityConfig 的精确 127domain 缺少显式 `includeSubdomains` 属性而阻塞。计划经独立开发/审查补 `includeSubdomains="false"`，不扩大网络范围、不关闭 lint。该产品输入变化要求重新 prepare 和构建双端；本记录的 `7adb…` stamp 与 Mac 包均退出最终候选范围。此为构建 lint 阻塞，不是运行崩溃证据。原始 macos-review.json、签名日志和旧产物字节证据保留，不篡改为新候选结果。

## 批次与证据

批次：`artifacts/releases/20261109-modernization101/`。独立执行脚本及完整 JSON：`artifacts/final101-package-review/review-macos.mjs`、`macos-review.json`；同目录保留 codesign、file、spctl 原始命令及退出码。审查只读取产物和源文件，不重打包、不重新签名、不修改作者 manifest，不接触 dist/target 的构建输出，不更新 README。

| 检查 | 独立结果 |
| --- | --- |
| 当前源码 | revision `bf26dae17f972fc09276deb456b4599e1ebe5d67`；dirty=true，437 个产品输入的完整集合、每项长度/SHA256 均与 product-inputs.json 一致 |
| 产品指纹 | `7adbdbf72ee4418d413537b67170e6fa6f1fb2f23d3f36197bc6b98046717944`，当前 sourceIdentity / shared stamp / frontend / 包内元数据 / 作者 manifest 全等 |
| 共享 prepare | `2026-11-09T13:47:52.582Z`；Mac frontend 实际 builtAt `2026-11-09T13:48:04.134Z` |
| 真正启动入口 | plist 的 CFBundleExecutable=`notes-clone`，realpath 为该 .app 内的 `Contents/MacOS/notes-clone`；Mach-O arm64 |
| 产品版本 | CFBundleName=`CyberNote`；ShortVersion / BundleVersion / frontend / stamp 均为 `0.1.0`；identifier=`com.local.notesclone` |
| 最终目录摘要 | `edc9348142666f9f4cc85bcfa2901f7f09b8c15990c0af649017ff3f62b93116`，独立审查前后及作者 manifest 一致 |
| 真实入口 SHA256 | `1998cf6987db3a0f7ad3a2b4012a2332d919b28d92396e17a5348694b6655099` |
| codegen 溯源 | mac-codegen-assets 的 8 个文件完整路径/长度/SHA256 清单均等于 mac-assets-origin.json 指向的实际 Cargo out 目录；不是另选旧缓存 |
| README | 审查时唯一 latest 区仍准确标识上一批历史安装包；本批未发布，不能提前计 README 交付完成 |

## 准确内嵌字节

除调用现有 verifyPackage 外，独立脚本直接读取实际启动入口，定位原始编码资源，并核对解压后的真实 frontend 字节。

| 资源 | 实际入口中的位置与编码 | 解码后验证 |
| --- | --- | --- |
| runtime JS | offset `13338996`，343815 B；SHA256 `9f7176bc0d0036d4f5c0089c326881adb00c46a51a5f1d85e971d5628b1dde6b` | 1221780 B，逐字节等于 mac-frontend/assets/index-CX7Z0hCO.js；SHA256 `84ef00e9b15f53016d506d09748784a79774780adae7f1896b1176e286736625` |
| metadata JSON | offset `13685319`，227 B；SHA256 `b71934d7334c84488a25b85009572fa8505923f7c6ecbbbe25519067256ee998` | 376 B，结构准确等于 mac-frontend/build-info.json 和 origin.info，包含上述实际 builtAt、共享 prepare 和源指纹 |

因此证据来自实际启动入口内的准确编码字节，并非旁置 build-info.json 或任意辅助二进制。

## 签名范围

`codesign --verify --deep --strict --verbose=4` 退出 0，报告 valid on disk / satisfies Designated Requirement。展示结果为 `Signature=adhoc`，TeamIdentifier 未设置，CDHash=`c309b17e283a1bf478f730652ee4592215676c1c`。签名 entitlement 含 Apple Events 自动化权限。此次独立审查没有重新签名。

`spctl --assess --type execute --verbose=4` 退出 3，报告 rejected。该结果与 ad-hoc 本机包范围一致；本审查只接受签名完整性，不声称 Developer ID、Apple notarization 或 Gatekeeper 默认允许。Mac 实际 UI/运行证据由 parent 单独验收。若交付范围要求免提示外部分发，此包尚不满足该范围。

## 待完成

等待修正独审后的新共享 stamp、双端最终签名产物、真实入口、各次 frontend/codegen origin/copy 与 manifest；对新批次重新核验同一产品输入与 prepare，不复用旧候选的接受结论。README 候选路径和最终双端发布检查保留，不提前接受。后续若任一产品输入或最终签名字节变化，须重新核验受影响身份和产物。
