# SYNC87 最终 native shared dependency 窄独审

2026-11-06。**PASS-NARROW-FINAL-DEPENDENCY-REVIEW，无 blocking。** 审阅冻结产品 `16ce577907b3aa2dcd04b834cb00b887cfd6d99a`、作者证据 `5f0fd4df`；只审最后 shared dependency 映射、对应准确产品输入和已有单 peer 退出证据，不覆盖另一 reviewer 的双 App 矩阵或实际 Android 验收。

独立 [audit.py](audit.py) 完成 **17 项只读审计，完整外层 519ms、内部 487ms，自然 exit0**。其中另起独立 host-only [dependencies.mjs](dependencies.mjs)，**6 项正负检查，自然 exit0，完整外层 189ms**；没有启动 Rust、browser、DesktopPeer、ADB 或设备。[原始进程](audit.execution.json)、[逐项结果](audit.json)、[dependency 原始进程](dependencies.execution.json)、[dependency 结果](dependencies.json) 均保留，stdout/stderr 原件同目录。

## 映射与检查强度

以下三个实际文件与 `b08c77289203691c30026ce673116721c5ca5a59` 的 git 对象逐字节相同，当前摘要也与 DesktopPeer constant 及作者 before/after 相同：

| 文件 | SHA256 |
| --- | --- |
| `scripts/debug/runtime.mjs` | `f6d84cfc6b48a33b4d8c12c98e84e8635dd093b507ccdca87539b12c4b092618` |
| `scripts/debug/rust-backend.mjs` | `3df944b85e2e65e10a4a1eaaae5b23c6b107b73ecfd9ed071bd8de9b2f988d0f` |
| `scripts/debug/sync-rust-dom.mjs` | `b8fe79058842c73303b4019e172842cd6ab74803a09f83f365d5ad6cfed62ff7` |

独立比较 `16ce5779` 与其父对象：只改 DesktopPeer constant/sourceCommit 及对应 README。去掉 constant 值、sourceCommit 字面量后，整个 peer 源码完全相同。逐文件 `assert.equal(SHA, expected)` 仍执行；open/close 都调用 verify，receipt 的严格字段／root 授权／绝对直接路径／可执行和 hash 检查以及自然退出、binary/frontend 不变检查未放宽。

6 项独立检查分别是：完整三 entry 映射；当前 candidate 入场且 sourceCommit 精确 b08；完整 byte-identical owned copy 入场；每个 shared 文件分别翻转中间一 bit 后必须以 `ERR_ASSERTION`／`Frozen DOM dependency changed` 拒绝。没有重用作者保存的检查脚本文本，未在产品源码里注入 fault；owned 临时 copy 在 finally 清理。

## 双包输入与 immutable11

Mac27、Android17 两份原始 manifest 各有 **321 项唯一输入**，inputBefore/inputAfter、作者保全的 actual/before/after 和本轮实际文件逐项 size/SHA 相等；两份平台 manifest 的选定输入也完全相同。独立使用 git cat-file 批量读取准确 candidate `16ce5779`、Mac 源 `8b855420ef7f97bc618ee6b1fdf83caf7156e468`、Android 源 `5e552c563bf63364943d1cc41efec9ba8caf3cec`，每项实际字节均匹配这三个源对象。两个 package head 不相同的事实如实保留。这是产品输入身份核对，不冒充重新核包、签名或设备运行。

作者 17 项 frontend/tool before/after source map 全部与当前文件及 candidate git 对象一致。本轮直接重算 **153 项 source fingerprint**，前后 clean、不变，精确 `6b143fb87d3cbf6b5ca8b44e912c2a21a0e857d817a8569ff05bea09178105f9`，也等于作者内外层记录。

作者 receipt 与根授权 `/private/tmp/sync87-peer-final11/receipt.json` 全字段一致，且独立调用实际 `reviewedPeer` 入场函数成功检查了直接可执行路径与实际文件 hash：

- authorizedBy：`root-sync87-peer-review`。
- binary：`/private/tmp/sync86-transport-build11/notes-current-attachment-transport`。
- SHA256：`333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`。
- backend source：`cd334bc88513a89c490788d2e2e27c7967575f4a`，build11。

未启动它，未编译或复用 target。已审 Android receipt `/private/tmp/sync87-apk-final17/receipt.json` 的根授权、Android17 label 和 sourceCommit 与该平台原始构建 manifest 一致；本轮未执行任何 APK／设备动作。

## 作者单 peer 自然退出证据

独立阅读实际 smoke 源码、原始 stdout/stderr、processes、result 和单独 lifecycle。作者此次 **10 项 single actual App smoke 自然 exit0，完整外层 9.546326625s**；原始 stdout 的 PASS／10 对应 result，stderr 空。实际源码通过 React/Tiptap 处理器生成 host／邀请／文本／FileChooser 附件并 stop，邀请只保留内存，关闭 secret UI 后才观察；非合成 pass-list。这是被审阅的原运行，没有在本轮重复，也不替代双 App 网络收敛。

Rust PID **29268** 自然 code0／signal null、forcedOrFailed:false，5 个事件、page errors0，immutable11 及 frontend unchanged。browser PID **29270** 的 `browser-process-exit` code0／signal null、`stdioDestroyed:true`；context close、browser disconnected、BrowserServer close code0 及 cleanup 的五个记录全部 terminal:true。cleanup 180.557ms 和内部 peer 9.368245542s 分别保留，没有替换完整外层耗时。result.lifecycle 与独立 lifecycle 原件完全一致。本代理未向历史 PID 发信号，也未凭当前 liveness 推断其历史退出。

## 初次 helper 失败与范围

独立 helper 首次把 Node AssertionError 的整条 message 当成单行常量比较；产品已经正确拒绝 tampered runtime，Node 在 message 后附带 actual/expected hash diff，导致 helper 自己失败。原始完整脚本、stderr、自然 exit1 与外层 561ms 均保存在 [helper-failure01](helper-failure01/audit.execution.json)。只把 helper 判断改为 `ERR_ASSERTION` 加第一行精确匹配，产品、依赖 constant、退出检查均未改；随后最终 17+6 检查自然0。初次失败未重写成通过。

本轮不重复既有 82／43／33、DOM／双 peer／网络矩阵，不做任何 main 写入、构建、ADB、安装／启动 APK、设备生命周期、真实麦克风或用户 Store 操作。原约13秒未保存录音现场未触及。实际 Android 验收和另一 reviewer 的双 App 结论继续由根按各自门禁整合。
