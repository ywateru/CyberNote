# Isolated GUI interactive preflight 02

**PASS** — 2026-11-13 05:18:21–05:18:25 UTC（北京时间 13:18:21–13:18:25）。本次只验证旧 GUI 候选在新 store 的当前可交互性，未登录、未扩展测试。

运行前二进制 SHA-256 与已归档 `macos/full-native02/result.json` 完整 hash 一致；运行后再次一致：

- Binary: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-39c1420d-finite-diagnostics/notes-clone`
- SHA-256: `b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2`
- 当前工具 checkout: `ca08c3b548a50a15f9349a07c9ec4b38d724c906`（不是此旧二进制的 source identity）
- Existing driver: `scripts/verification/sync108-native-driver.mjs`，SHA-256 `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2`
- Existing account helper: `scripts/verification/account109-desktop-helpers.mjs`，SHA-256 `67a2651b92d5311c6a0382a752b9e13aa408c599870ceea9ddb57fb3ff3bb943`

只创建并使用 `/private/tmp/account109-gui-access02-FRESH/store`。运行前整个 FRESH 根目录不存在；本次未打开原账户库或默认库，新临时 store 保留在该路径，不复制进 repo。

调用现有 `NativeApp`，设置 `NOTES_SYNC_E2E_SLOT=left`，并按旧 runner 对该 owned 子进程将 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY` 及其小写变量全部置空。Driver 设置 `NOTES_SYNC_E2E=1`，启动参数为 `--data-dir` 指定 store。未改系统网络设置、产品或 runner，未创建新测试代码文件；通过一次 Node stdin invocation 调用现有接口。

| 步骤 | 有限结果 |
| --- | --- |
| `app.ready(45000)` | version 1，native true，main window，**interactive true / startupDetached true**；约 3.3s |
| `app.state()` | busy false，hasError false，0 notes / 0 attachments，preferences closed；save 字段按有限投影记作 `otherOrStructured`，未据此增加保存断言 |
| `nativeAccount(app, 'status')` | **signedOut**，enabled false，无 profile / error / devices / connected devices |
| `app.close()` | 正常 shutdown；exit code **0**，signal null；**naturalExit true** |
| owned PID 核对 | **83452 不存在**；forcedSignals **[]**；桌面测试进程独占已释放 |

唯一账户调用为原生 `account_command` 的 `status`。没有 signIn、relogin、setEnabled、syncNow 或 signOut。没有额外 UI、ADB、网络探测或其他桌面应用操作。Driver 收到的 58 stderr bytes 只计数，未保留或打印原文；stdout noise 为 0。报告不含 note 内容、授权、账户身份或任意上游日志。

本次成功表明指定旧 WebView 候选在当前新 store 的可交互 preflight 可用；不归因此前失败，也不代表原库、登录或真实同步已通过。本次到此结束，不自动继续测试。仅写本归档及新临时 store，其他 agents 的既有 dirty/untracked 归档保持不动，未提交。

`result.json` 保存精确步骤时间、有限状态、工具/二进制 hash 和 owned lifecycle。`SHA256SUMS` 绑定 README 和 result，文件均可普通 Git 收录。
