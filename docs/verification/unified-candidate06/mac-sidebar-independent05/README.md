# Candidate06 Mac sidebar-build05：不同作者封存产物独核

2026-11-04。**PASS：933 / 933 项检查通过，封存 Mac 产物字节与记录的源码、构建、签名来源相符。** 由不同于构建作者的核验作者执行一次只读脚本；本目录是新的兄弟目录，旧独核与旧构建证据未更改。源码审查由 verify_app 负责，本结论不替代源码审查或 GUI / 像素验收。

## 准确绑定

- sourceHead：`093986d170ef279fbce0f66e59891fd5f94aecad`；当前 HEAD 相同，238 个产品文件逐项匹配该提交的 Git blob。
- root authorization：`docs/verification/unified-candidate06/root-authorization-mac-sidebar-build05.json`，SHA-256 `10dc74c888702d06a7dfa568c13db8e18f5b9d56d0bf35a9a4147ce9dccb01bb`。已核精确 SHA，以及冻结内嵌授权、当前授权的来源、平台、输入路径和产品路径关系。文件内容作为待核证据；执行授权来自 root 的明确任务消息。
- freeze：`mac-sidebar-build05/input-freeze.json`，SHA-256 `1060739979cefa530c3f9a50debb32091c6e5f72e7da98c6294ba4b70e42d1fe`。
- 238 产品 aggregate：`c888cc902f9f05da636c827c2b030200732967bcfd4fb52743000e877333bc60`。
- 302 输入 aggregate：`aa8a862312b923f56bb4046dbacd780175a79bf080991647a38e5d121392ea28`。
- 准确 attempt：`docs/verification/unified-candidate06/mac-sidebar-build05/mac-attempt02`；build result SHA-256 `c17d4f8a5b5228003e5887e411136fefe3807127204f6a8d3a0cac5aa55cc1d8`；collection result SHA-256 `de4112837c1d56848b7440f48ac172dcd796e0ea3076b90e0a6a5386f4118aee`。
- 准确产物目录：`artifacts/unified-candidate06/mac-sidebar-build05/mac-attempt02`，只读取这里的 original / sealed app 与 ZIP，不读取移动中的 target 或缓存。

302 个当前输入逐项匹配冻结记录，238 个产品文件和产品 aggregate 相符，6 个冻结准备工具相符。四份构建 / 收集前后快照等于冻结状态；build nonce、准确 `pnpm mac:build` 命令、成功状态、已停止进程组、输入比较、输出隔离与新生成输出记录均与 collector 相互绑定。freeze-summary 的 FROZEN ONLY 字样仍按冻结阶段记录解释，不代替 root 的本次明确执行授权。输出来源在构建前为空的历史事件只核保存记录，没有访问 target 重构该事件。

## 产物字节

两份 app 的完整文件清单、模式、SHA 和 bundle aggregate 全部与 collector 相符。两份 ZIP 大小 / SHA 对应保存记录，无重复成员名，完整 CRC 读取通过，成员字节 / SHA / 模式与准确 app 完整对应。ZIP 在内存检查，未解压。original app 与本次生成输出清单和 buildOutputIdentity 相符。

| 产物 | bytes | SHA-256 |
| --- | ---: | --- |
| Original executable | 16089104 | `77e110e5446634671d4c6aa42f603f9b7b1e30e43630e8171514a9e77898029f` |
| Original ZIP | 4822038 | `943c9a2a82acddf3fc31e5429f6a447c0f9fae338778f0e6a20c1f3121c2e898` |
| Sealed executable | 16013696 | `333b356ab62a0f0c55a8f67c9d7bc51bf424eb1f37dccdcb40f4b9b140bc7be7` |
| Sealed ZIP | 4751569 | `ff3317642232bc1ae6aace93f910c5754b032ea086590649409790eb008d1898` |

Original bundle aggregate 为 `7e273d586958a34a3ffb5f2a6540103d1b0fd6847403e68152de0c3aa6421d4f`；sealed 为 `0951b9b384f2a1a5a8f3d31caed6ee3d203d815e92d13fd3efb446b9fd606820`。两者变化仅为 executable 及新增 `Contents/_CodeSignature/CodeResources`，与本次实际 sealingChanges 逐项相等，Info.plist 字节保持相同。

## 本次实际签名证据结构

先读取了精确 SHA 固定的新 collection，确认实际仍有 13 条命令及退出序列 `[0,0,0,0,0,1,0,0,0,0,0,0,0]`，再绑定脚本；没有机械继承旧轮失败假设。13 份完整原始日志逐项匹配命令记录，均有进程组已停止且无剩余成员。

本次 original 的第 6 条严格验证实际退出 1，原始信息为“code has no resources but signature indicates they must be present”，该失败保留。本次 sealed 的第 8 条记录本地 adhoc 签名，第 9 条既有严格验证实际退出 0，包含 valid on disk；签名命令准确参数、严格验证命令准确参数、三份 display 记录及日志相互对应。Sealed display 报告 Identifier=com.local.notesclone、Signature=adhoc、TeamIdentifier=not set。

这里是对**既有签名结果、原始日志和当前准确封存字节**的独立关联核验，没有执行新的 codesign 签名 / 验证命令，不作 Developer ID 或公证通过声明。Original 严格失败与 separately sealed 严格通过分别保留，不能互相覆盖。

## 脚本适配与实际执行

基础脚本是 `docs/verification/unified-candidate06/mac-body-independent04/verify.py`，SHA-256 `1240c70d609a8f1acf7f5804de9aed22dd1eb2ba23c4677a258a5eaedbc0129f`。它未被执行、导入或修改。新脚本用 14 个精确替换项更新兄弟目录、attempt、root 指定源码 / 冻结 / build / collection / aggregate 身份及 sealed executable / ZIP 大小和 SHA；替换前先核全部出现次数，避免旧轮曾发生的重叠替换问题。

保留原脚本全部断言，增加 4 项：授权文件精确 SHA、当前 HEAD、实际 13 命令退出结构、准确 sealed 签名 argv；授权文件另加入 sourceEvidence。`adaptation.json` 记录所有替换前后文本、出现次数、明确增加项及新旧脚本 SHA。新 verify SHA-256 为 `a912df32fc7d9bd09be6b2d55bbc59ccb5bfd0c8c7a599f8976a155bd5616c58`。`preparation.json` 保留执行前实际新 collection 观察，不改写成事后记录。

`command.json` 记录唯一一次实际执行：2026-11-04 10:31:59 UTC，退出 0、stderr 为空、933 项全部通过。`result.json` SHA-256 为 `9c14eb840e354075cef1e94dac3281afb26d3230bafc99db6fbd6ff89fd2492c`，包含全部检查、当前 bundle / ZIP 清单及 25 份来源证据身份。说明写入前再次核这 25 份来源记录身份不变。执行前空闲 75661877248 bytes，执行后 75661721600 bytes，均超过 2 GiB。

新结果用独立目录的独占新建写入方式保存，没有覆盖失败或旧结果。`manifest.json` 仅封存本目录 6 文件，self excluded；按排序的仓库相对路径 TAB bytes TAB SHA-256 NEWLINE 作 UTF-8 SHA-256 aggregate。源码与记录中清单 aggregate 的旧算法保持不变（SHA 双空格 path 换行），不混用两种 aggregate 定义。

没有执行 build / sign / 新平台 verify / launch，没有读取 target、Gradle 或其他缓存，没有 GUI、ADB、安装、依赖下载、产品修改、stage 或 commit。root 并行 Android 构建与本次 Mac 只读核验分别进行，本结果不宣称 Android / iOS、TCC、持久化、输入交互、正文几何或像素一致性验收。
