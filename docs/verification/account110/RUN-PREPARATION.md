# 双客户端执行准备

本文件记录已审执行器的启动约束。它不是实际通过回执，最终结果另行归档。`cb91f4b8` 首轮已执行并失败，见[真实运行记录](native/device-actions-live01.md)；不得覆盖该输出或把该候选当成已通过版本。修复后的运行使用新的精确源码 SHA、包与输出目录。

- 执行器作者：`9f39d41a → 0e0c5193`；[独立复审](../../plan/reviews/app-account110-live-runner-02.md) APPROVE。主线已合入相同字节。
- 服务源码：`e220111362084d4c72b6d6fe2dada505b97a6df3`。
- 已部署 production：`dpl_8Fewyd8o8HHUouDYJDULDd6XSweY`。
- 服务结果文件：[registry-deployment01/result.json](server/registry-deployment01/result.json)，SHA256 `6eb360ff873b159683e9ae8ee2419ad4b2bd32b78be2c3b6b34da6e6b46414db`；[部署独核](server/registry-deployment-review01.md)通过。实际 run 前仍须验证该文件和批准的身份，不把任意 JSON/hash 当有效证据。
- 包必须从最终修复及 pins 通过后的精确 clean main 构建：`artifacts/account110/mac-<sha8>-debug-01/CyberNote-Account110-<sha8>.app`。不能用旧候选替代。`cb91f4b8` 已有[构建记录](native/mac-cb91f4b8-debug-build01.md)和[静态独核](mac-package-review01.md)，其运行失败不影响历史记录的保留。

执行命令模板，`FINAL_SHA` 只可填实际批准的完整源码 SHA：

```sh
FINAL_SHA='<最终批准的完整源码SHA>'
SHA8="${FINAL_SHA:0:8}"
ROOT='/Users/water/work/2026/Apple-Notes-Clone'
node "$ROOT/scripts/verification/account110-device-actions.mjs" \
  --run \
  --output "/private/tmp/account110-device-actions-${SHA8}-live01" \
  --source "$FINAL_SHA" \
  --package-receipt "$ROOT/artifacts/account110/mac-${SHA8}-debug-01/packaging-receipt.json" \
  --deployment-source e220111362084d4c72b6d6fe2dada505b97a6df3 \
  --deployment-id dpl_8Fewyd8o8HHUouDYJDULDd6XSweY \
  --deployment-receipt "$ROOT/docs/verification/account110/server/registry-deployment01/result.json" \
  --deployment-sha256 6eb360ff873b159683e9ae8ee2419ad4b2bd32b78be2c3b6b34da6e6b46414db \
  --authorization-timeout-ms 600000
```

不带 `--run` 的默认 prepare 不启动 App。实际输出目录必须不存在，由执行器独占创建；其中 `desktop-a`、`desktop-b` 分别是全新的独立资料库。先 A 后 B，遇到 `login-a/login-b`、`waitingFor: human-hosted-form` checkpoint 时，仅通过真实托管表单完成授权，执行器观察验证后的 paused 状态自动继续。密码和完整授权URL不进入参数或回执；600秒是每端授权等待预算，不把父级看到 checkpoint 的时间当成内部精确截止时间。

执行器经已存在的调试桥调用生产原生命令和正常保存流程；这不等于每个UI点击路径都在真实GUI执行。完整文档、附件引用与元数据、授权读取和磁盘原字节分别核对；持久收据与安全应用结果分别观察。失败保留首次证据。完成后由独立作者核验实际结果，再清理owned临时资料库/派生物；默认原库不参与。
