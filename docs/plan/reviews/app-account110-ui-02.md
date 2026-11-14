# account110 debug device-action delta review

2026-11-14（Asia/Shanghai）。结论：**PASS，无 blocking finding**。精确增量 `58b54da1baef35739bdc91973783b751a3843c41` → `29600b05acf7ec27fe7f92f04caec03e03c25296`；仅 `src/App.tsx`、`src/AccountSettings.tsx`、`src/debug/catalog.ts`、`src/debug/runtime.ts` 和既有 `account109-login-surfaces.test.mjs`。接续[前端模块审阅](app-account110-ui-01.md)，其 P3 调试语义命令覆盖缺口在此提交解决。

## Findings / source assessment

- **无剩余阻断。** App 的真实 account handler-map 注册两项命令；catalog 严格声明更名仅 `name`，设备动作仅 `deviceId` 与必需 `push|pull|both`。runtime 在 dispatch 前校验 UUIDv4、名称边界和未知/缺失参数；`confirmed:true`、owner、额外 deviceId 等不能绕过参数表。原 DEV+显式 debug 开关与 readiness/execute 双帧边界未修改。
- App handler 继续检查账户功能可用、Preferences/account 当前页面及真实 handle，再调用 `AccountSettings.run`，没有直接调用 native IPC 的新捷径。新增预填只更改真实 modal 的名称/方向；打开/取消不发 mutation IPC，仍须点击真实确认控件。既有账户/目标锁存、收据及 owner 检查保留。
- 新测试从真实 `App.tsx` 提取 handler-map AST 表达式执行，走真实 `registerDebug` validation → 真实 React handle → 确认；没有在 fixture 镜像新增白名单来自证可用。覆盖 list available、有限参数拒绝、错误页面拒绝、取消零 IPC 和准确确认派发。继承 fixture 不伪造传输收据的边界；未声称真实 native 网络传输。

## Independent verification / limits

作者树 `/private/tmp/cybernote-account109-cancel-pin-9e7c46d2` 在检查前后均为精确 `29600b05` 且 clean；只读独立执行：

```text
node --test scripts/verification/account109-login-surfaces.test.mjs scripts/verification/account109-status-dto.test.mjs
69 pass, 0 fail/cancel/skip/todo; exit 0
pnpm typecheck
tsc --noEmit; exit 0
git diff --check 58b54da1..29600b05
exit 0
```

独立 TAP `/private/tmp/account110-ui-independent-29600b05.tap`，SHA256 `f7b458c50bdd69757eb85e03426e8f2aba3bb574fadb39645053df13426da0fb`。仅在自己的 reviewer 树写本报告，未修改作者实现或主树。未运行 App、browser、network、ADB、账户授权、原库或 Cargo/native build；device-free React host 不证明真实 WebView 布局/事件路由。本结论不替代 native/server 整合和真实双端验收。
