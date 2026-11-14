# account110 UI independent review

2026-11-14（Asia/Shanghai）。结论：**PASS，限前端模块；无剩余 blocking finding**。

审阅源码 `58b54da1baef35739bdc91973783b751a3843c41`，base `c4cb45ac2cf0913d9f105d3e6a087bbaf03f247b`。精确六文件：`src/AccountSettings.tsx`、`src/AccountSettings.css`、`src/account-client.ts`、`scripts/debug/account-fixture.mjs`、`scripts/verification/account109-login-surfaces.test.mjs`、`scripts/verification/account109-status-dto.test.mjs`。依据[设备契约](../../architecture/account-device-actions.md)、[UI 契约](../../ui/account-sync.md)及[任务](../tasks/app-account110-device-actions.md)。

## Findings

- **P2 / 原 blocking，已解决。** 早期 WIP 用 `startedAt !== baseline`，可能把较旧同目标收据判为本轮成功。最终 `AccountSettings.tsx:257` 要求大于既有 baseline，并同时匹配目标、方向、attempt/dialog revision 及有效目标。新增 100→90 负例通过；ACK、原收据、异目标/方向均不当成功。
- **P2 / 原 blocking，已解决。** 账户/本机身份变化后须锁存失效，恢复原状态不能恢复旧对话框成功资格。最终使用 `targetInvalid`、`!issue`、dialog revision；迟到成功和 rejection 共用 `ownsDeviceAction`（`AccountSettings.tsx:112`）。账户/本机切换恢复后的旧收据，以及 A 迟到 rejection 不写 B 错误的负例通过。
- **P3 / non-blocking，调试工具覆盖限制。** `src/debug/catalog.ts:182` 和 `src/App.tsx:3526` 的既有 account 语义命令白名单尚不含 `renameDevice`/`syncDevice`，直接 execute 这两个名字会被现有 runtime 拒绝。新增 fixture 分支不等于已注册语义命令。当前契约未要求新增这两个调试别名；真实 UI 控件接线存在，因此不阻塞本模块。后续若添加别名，应复用真实 UI handler/确认流程并校验有限参数，不能直接绕过确认调用 IPC。

## Source assessment

- DTO 严格限制 UUIDv4、重复 ID、64 行、必需 permission、摘要安全整数及空库时间关系；设备/摘要/操作未知字段拒绝，内部 transport ID/Noise key 不进入 renderer DTO。旧 mapping generation/age 保护保留。
- 选择远端稳定 ID 后再确认方向；账户 subject、本机 ID、远端存在性/在线/许可参与确认保护。失效锁存要求关闭重选，无恢复自动派发。自同步不开放；重名不合并；重试不自动重放旧目标动作。
- 真实按钮经 `run` → allowlisted `accountCommand` → `invoke("account_command")`；更名只传名称，设备同步仅传目标 UUID/方向。开启只发 `setEnabled`，刷新只发 `syncNow`，轮询只发 `status`。前端这一接线不能证明 native 的 `syncNow` 已停止无目标内容交换。
- 对话框沿用 `showModal`，初始取消焦点、Tab/Shift+Tab/Escape 与 opener 恢复有 device-free 覆盖。离线行隐藏历史摘要，未知与空库不同。成功文案限定本次持久传输收据，待应用与冲突单列。
- 五个新错误 code 使用固定文案及既有严格诊断分支；不显示任意 upstream message/URL。显式 JS fixture 仅本机更名；`syncDevice`/`syncNow` 不伪造收据、发现或传输，未接入真实 native 路径作为替代。

## Independent verification

作者树 `/private/tmp/cybernote-account109-cancel-pin-9e7c46d2` 在验证前后均为精确上述 SHA 且 tracked/untracked clean；只读执行：

```text
node --test scripts/verification/account109-login-surfaces.test.mjs scripts/verification/account109-status-dto.test.mjs
67 pass, 0 fail/cancel/skip/todo; exit 0
pnpm typecheck
tsc --noEmit; exit 0
git diff --check c4cb45ac..58b54da1
exit 0
```

独立 TAP 留在 `/private/tmp/account110-ui-independent-58b54da1.tap`，SHA256 `35ff9eac084989f6666260b2a37f7637ba0527568e3453cb9b3ef4647e25fcf9`。先前 reviewer 树切换后产生的 50 项结果不计入本提交证据。审阅文档位于独立分支 `codex/account110-independent-review`，基线 `542e2c3c6e7047a53062ba1fa7b906355048dd01`；已移除 reviewer 本轮创建的临时依赖 symlink，未更改产品实现或作者树。

未运行 App、浏览器、设备、网络、Cargo/native build 或真实账户/私有资料库。React host 不证明实际 WebView top-layer/hit testing/布局；本 PASS 不替代 native/server 新 API、命令枚举和方向限制整合审查，也不代表真实设备传输或数据应用通过。
