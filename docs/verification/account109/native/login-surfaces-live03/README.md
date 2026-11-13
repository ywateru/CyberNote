# 双登录入口的真实桌面取消与本地保全

2026-11-13 UTC。三条流程均 PASS；使用真实 macOS 候选进程、真实 UI handler 与原生账户 owner，由用户允许的命令调用驱动。每条流程均包含 localSave、authorizing、cancelledWindow、localEdit、restartWindow 五项检查，使用真实候选与合成笔记 fixture。独立复核 APPROVE，详见 [复核](review.md)。

| 流程 | 开始—结束 UTC | 取消后 / 重启后重复采样 | 两个自然退出 PID |
| --- | --- | --- | --- |
| browser | 12:48:57.805—12:49:11.289 | 7次/3014ms；7次/3016ms | 27510、27541 |
| embedded | 12:49:31.526—12:49:42.804 | 7次/3015ms；7次/3017ms | 27586、27600 |
| embedded → browser | 12:50:17.349—12:50:29.064 | 7次/3014ms；7次/3036ms | 27734、27760 |

每次使用全新隔离合成库；保存格式正文后发起登录，调用现有取消 handler，再继续编辑并用同目录自然重启。每个采样均断言健康 signedOut、disabled、无 profile/connected device，唯一笔记完整 document 深比较、plainText 全量比较及无附件。编辑前后 noteId 保持；重启正文与编辑结果一致。报告保存采样数量及预期完整正文哈希，不逐次保存七份正文。

保存/取消后的 document+plainText SHA256 为 `5e6c45164dc3cd218a1b76352d4f0017c618a44007a8b0cf4a5804f7b5b6108e`；编辑/重启后为 `c5602b097adca7fe896aed904c25f0a971849a030ab95c4ae236e665812ecd15`。六个进程 exit/close 均 code=0、signal=null、forcedSignals=[]；父级和独立复核均确认 PID 不存在。

## 精确身份与执行

- 产品源码：`72513d1296df4526a08834db65a3427957d3fb50`，沿用 [已核候选](../72513d12-platform-build-review01/README.md)。
- 二进制：`artifacts/account109/mac-72513d12-debug-e2e-01/notes-clone`，204326848 bytes，arm64；SHA256 `187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459`。
- 父级记录执行工作区 HEAD 为 `88b2dabe4bb898b0bf225e913883b43ed2cac865`。原始 result 不直接记录 HEAD；其中四个 runner 模块哈希逐字节匹配当前提交文件及 `352d0b7f` 的工具字节。两者不可混称为产品源码。
- 固定 callback 17897，无 endpoint override。未访问或更改原始桌面资料库。

```sh
node scripts/verification/account109-cancel-local.mjs \
  --binary /Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-72513d12-debug-e2e-01/notes-clone \
  --store /private/tmp/account109-cancel-local-surface-browser03-store \
  --output /private/tmp/account109-cancel-local-surface-browser03-out \
  --surface browser
```

embedded 运行使用同一二进制、独立 `embedded03-store/out` 及 `--surface embedded`；transfer 使用独立 `transfer03-store/out` 及 `--surface embedded --continue-in-browser`。三次先后执行，不共享测试库。

[receipt.json](receipt.json)记录父级执行身份、独立 PID 检查和原始结果校验和；[browser-result.json](browser-result.json)、[embedded-result.json](embedded-result.json)、[transfer-result.json](transfer-result.json)逐字节归档原报告。当前未清理这三组小型临时库/输出；总计约348KiB，保留至归档复核完成，旧失败及原库保持。

## 可证边界

三次均 `cancelViaWindow=false`。没有物理输入、实际托管表单可见性观察或用户关闭 NSWindow；AUTH-09 的关窗分支未执行。transfer 实测 native surface 从 embedded 转 browser，再取消；同 PKCE/state/deadline 的事务所有权仍由源码/native 检查支持，未读取授权 URL 或秘密来证明。未输入凭据，未证明成功登录/注册/重新登录，也不证明 Android 或真实账户三端中转。

本轮后续 Dock 访问两次 timeout；随后原生 Chrome 窗口访问成功，当前桌面可操作，不能据此称当前锁屏。Cloudflare DNS 随后已通过正确 profile 的现有会话配置，最新状态见 [域名回执](../../server/custom-domain-live01/README.md)。本次候选仍是 `72513d12` macOS，不能改标为新 Android 域名候选。
