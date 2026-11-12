# Startup 工具清理判定修复

针对 `/private/tmp/sync108-startup-independent.md` 的工具 P2，仅修改 startup 验证脚本，不修改产品、不重编、不操作其他测试进程或 Android 库。

`stop_owned()` 保留首次清理前退出状态、实际发送的信号、SIGTERM 超时、是否实际发送 SIGKILL、最终退出码和错误；重复调用返回首次事实，不把 SIGKILL 写成 SIGTERM。提前退出、强杀、超时和清理错误均不能通过。用例检查、每个子进程停止、日志/缓存/临时目录清理汇总完成后才计算顶层 `passed`，失败返回非零；lsof 子命令 timeout 最多 3 秒且受剩余 startup deadline 限制。

新增 `--binary` 仅让工具可验证现有测试产物；保留 `--app` 用法。子进程移除 `NOTES_SYNC_E2E` 环境开关，本轮只测 startup，不启 stdio driver。

## 本轮执行

```sh
python3 -B scripts/verification/sync108-startup-native.py \
  --binary /private/tmp/cybernote-sync108-target/debug/notes-clone \
  --out /private/tmp/sync108-startup01/native-startup.json
python3 -B scripts/verification/sync108-startup-native-tool-tests.py \
  > /private/tmp/sync108-startup01/tool-only-cleanup.json
```

- `native-startup.json`：通过、工具 exit 0。使用的是现有 **sync-e2e feature binary**，SHA256 `11b2f4041b77cce3c83a81ac7f03f28ebc7e3e6dcf8feccda077f8fe29f147d4`，不是历史 production-source startup `.app`。两个新目录同时运行、同目录/别名拒绝、退出重启均通过；三个 owned PID 的 preExitCode 均为 null，实际仅发送 SIGTERM，最终码 -15，无超时、强杀或错误；缓存/临时目录已移除。这里 SIGTERM 只证明 OS 回收资源，不宣称运行了 Tauri 正常退出回调或 Rust 全部析构。
- `tool-only-cleanup.json`：通过、工具 exit 0。Python 短子进程验证普通 SIGTERM、忽略 SIGTERM 后真实 SIGKILL、提前以 7 退出，以及清理错误注入和最终汇总失败条件。强杀分支确实记录 `SIGTERM, SIGKILL` / final -9 / cleanup passed false；重复 stop 保留原事实。**这些是工具回归，不是原生产品通过证据。**

旧 `startup/native-startup.json` 和独审报告未覆盖。本次不重新解释历史 SIGTERM 为自然退出，也不将脚本缺陷追溯写成旧产品启动失败。
