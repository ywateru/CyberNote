# 三端原始证据归档

此归档包含当前可定位的全部三端 attempt：run01–03。**目前只有 run02 的 3P-01 实测通过，尚无四个 case 全部通过的正式结果。** `summary.json` 明确记录此缺口，不把部分通过或协议测试作为正式三端通过证明。主目录 README 的最终状态由协调者更新。

| 文件 | 内容 |
| --- | --- |
| `summary.json` | 每次 attempt 的原始绝对路径、SHA256、状态、case 和清理结果；已通过 3P-01 的正文与附件字节 hash。 |
| `run01.result.json`–`run03.result.json` | 与原始 result.json 逐字节一致的归档，不改写原失败。 |
| `attempts.md` | 原失败步骤、工具原因及已做修复的解释。 |
| `continuation-proof.json` | run02 原双根、workspace/device、拓扑及 run03 对原始结果 hash 的引用。 |
| `android-apk-preservation.json` | APK 原路径、主 workspace 保全路径、大小、SHA、包身份及源码指纹。 |
| `archive-manifest.json` | 本目录证据文件 hash 清单。 |

run02 原双根为 `/private/tmp/sync108-three-20261112-02/store-A`、`store-B`，手机保留相同 C 身份和配对。run03 虽采用这些根及 continuation 元数据，但在 A Ready 就超时，尚未完成运行中的身份复核；不能把这份 continuation 元数据称为恢复后通过证明。后续续测必须复核原 A/B/C workspace/device，不 clear、不重装、不重建 workspace 配对。

run02 3P-01 的完整 document/plainText 规范化 SHA256 为 `c9cab2d79f99211201ea5d136724d4e60e9e2a876f9106fc87d5124b5924356b`。三端 PNG 原字节均为 3677 bytes，SHA256 为 `3cab9ba707426dcea5e90bc86e8e90db7998a45c2f92e0bd65d040c800ae823a`。完整断言和实际 C editor 检查在原 suite 中执行；此处 hash 仅索引原证据，不替代执行。

唯一 Android 准备 APK 已复制至主 workspace 的 ignored 路径 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/sync108/sync108-android-test.apk`，大小 343695163 bytes（约 327.8 MiB）。原件和副本重新读取所得 SHA256 均为 `e13efeefefa45752388218ebb91466f5c8253278810384d54e9b815dce440af5`。旁边保存 `.apk.json` 元数据；APK 不提交 Git，副本不依赖 Android worktree 的存续。本次归档未构建、安装或操作手机。

未归档包含完整合成笔记的私有诊断 workspace/screenshot；未读取原用户 App 内容，未记录邀请。原始目录和合成数据均保留。
