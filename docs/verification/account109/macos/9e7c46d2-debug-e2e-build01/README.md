# GUI startup-handoff candidate 9e7c46d2

2026-11-13。**构建、实际嵌入身份及有限资源核对通过；未运行 App。** 精确 source `9e7c46d2fcc8ed31bf1210ce4272f73edffe9143`，tree `01a62268e019b982dc2bb67e08a48b32a54dfe3b`。新干净 detached checkout：`/private/tmp/cybernote-account109-gui-startup-9e7c46d2-01`。

候选：`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-9e7c46d2-debug-e2e-01/notes-clone`。

**Binary SHA256 `3fa9a3851e610348352f5594f976f145e2d344fd97a9f0d27124566f458ce65c`**；203,967,312 bytes，Mach-O 64-bit arm64 executable。原 920fa9cf 及其他旧候选、store、draft、历史证据均未改动。

## 构建与来源

精确复用 [920fa9cf controller](../920fa9cf-debug-e2e-build01/build-controller.py)，仅替换 root/source/out 三处；原 controller SHA256 `065e8e7e1c6538412e1f98ac0633ca90a00cbdeed23fed29851afa61ea4d97ee`，本次 controller SHA256 `122aa95ae4fc6d252b881080eb4c017165bdddbab74ae887577d3880062c45d5`。另由独立 disk supervisor 监控低磁盘暂停线，未修改 controller 的命令或构建逻辑。

| 步骤 | Exit | 秒 |
| --- | ---: | ---: |
| `pnpm build` | 0 | 8.957 |
| `node scripts/debug/account-native-capability.mjs` | 0 | 0.464 |
| `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline` | 0 | 25.749 |
| 实际 binary 的 `scripts/publish/package-identity.mjs` | 0 | 0.574 |

构建环境与旧方法一致：NODE_ENV=development、VITE_NOTES_DEBUG=1、CYBERNOTE_BUILD_TARGET=macos；共享 target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`；jobs=2、dev/test debug=0、incremental=0、CARGO_NET_OFFLINE=true。HOME 等系统变量仅继承原值，未覆盖。无 headless、dotenv、account override 或依赖安装。

source fingerprint 前后均为 `9dc2c6a3985c7226dc83a20e5d1b0276fa53617c27c35d8f62803253e71ff450`，1,654 个输入，sourceDirty=false。四份 lockfile 前后相同，并逐份与此 commit 的 Git blob 字节核对相等；最终 checkout 干净。完整 argv、环境 pin、工具链、来源身份及日志 hash 在 [build-record.json](build-record.json)。原 frontend/native 日志留在新候选 artifact 目录，包含原有 frontend chunk-size 和 native warnings，未删改或复制成大份报告。

## 实际嵌入与 DEV 诊断

[embedded-identity.txt](embedded-identity.txt) 验证实际 binary 内 Brotli 编码身份载荷与本次 clean source/regenerated dist 相同；解码身份 SHA256 `d36d45b2415e0084240f7c9cdee6ebdc8d49fa0fada0ffa41edb57d6b38e20bf`。不是仅核对 sidecar。Vite identity 的 mode=production 是 build 命令标签；NODE_ENV=development 与 VITE_NOTES_DEBUG=1 保留本候选的 DEV/debug 分支。

[compiled-capability.txt](compiled-capability.txt) 报告 **24 checks**。另外运行只读 [verify-assets.mjs](verify-assets.mjs)：9 个 dist 文件记录 SHA，8 个必需 JS/CSS/JSON/SVG 资源均能匹配 Tauri 编码资源、解码后与当前 dist 完全相等，且编码字节实际位于 binary 的可读加载段。入口实际包含 `__CYBERNOTE_STARTUP_DIAGNOSTIC__=Object.freeze({schema:1,gates:...)` 赋值及 debug runtime 的动态 import。execute 的两个 `await frame()` 与其 rAF 等待函数保留。详见 [resource-identity.json](resource-identity.json)。

HTML 单独记录 hash 并核对引用资源；不声称经过 Tauri 转换的 HTML 与原 dist 逐字一致。不以编译 marker 声称运行时已初始化诊断、已 paint 或已通过 Native Ready。未重新运行 parent 报告的 Node 214/214 或独审 native 测试；本回执只记录上述构建与静态身份检查。

普通 production 构建诊断全局 marker 的 2/2 JS 剔除结论仍保留在 [startup-handoff-fix01](../../native/startup-handoff-fix01/README.md)，与本次显式 DEV 候选分别记录。

## 磁盘、target 与验收边界

磁盘监控最低可用 19,105,775,616 bytes（约 17.8GiB），未触及 10GiB 暂停线；[disk-monitor.json](disk-monitor.json) 保存采样摘要。仅复用原 shared target，不新建 native target、不 clean cache。**完成资源核对后 target 已释放，此后未再读写 target**。新 checkout/dist 为独立 package review 保留；没有删除旧候选、原库、draft 或证据。

controller 的每个 subprocess 均已 await；退出码全为 0。未启动 App、UI、浏览器、auth、ADB、网络或原 store；无部署、发布或外部配置写入。本候选还需独立 package review 与 parent 精确候选实跑，不能将静态通过归为账号、同步或 live01 根因已验收。

本目录 SHA256SUMS 覆盖全部归档文件（自身除外）；artifact 目录另有包含实际 binary 与原日志的 SHA256SUMS。两者通过同一 build-record、日志 hash、binary hash 和资源 hash 形成回执链。
