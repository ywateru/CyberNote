# account109 UI 阶段性检查点

## 当前行为：原生默认开放账户入口（2026-11-13）

基于已合入 native `account_command`/runtime 的 `main 0d499676` 收口能力门控。Tauri 默认显示“账户与同步”分类；`VITE_NOTES_ACCOUNT_NATIVE` 未设置或为 `1` 均开放，为 `0` 时关闭原生能力分支。普通浏览器默认隐藏该分类，生产浏览器即使同时设置 debug/account fixture 标志也不能开启。这里只改变入口可用性，不自动登录或开启同步，设置初始外观页保持现有行为。

开发 fixture 仍须同时满足 `DEV`、`VITE_NOTES_DEBUG=1`、`VITE_NOTES_ACCOUNT_UI=1`。浏览器 debug 平台会模拟 Tauri 标记，因此 runner 在 Vite 开发服务器和独立编译测试包中显式固定 `VITE_NOTES_ACCOUNT_NATIVE=0`，通过 `--account-ui` 单独启用合成 IPC；此固定值仅用于测试 runner。真实客户端仍只调用已注册的 `account_command`，无 token/授权 URL 注入或生产 fake fallback。

验证结果：真实 client 的 Vite compiled capability **24/24** 通过，覆盖 native 未设置/`1`/`0`、浏览器与 Tauri、生产 fixture 隔离和开发 fixture 必需标志；`pnpm typecheck` 通过。默认 Preferences **146/146**、0 page error，确认五分类且不发账户 IPC；显式 fixture 在开发服务器/独立编译测试包两条路径均显示六分类，切入账户页后取得合成 signedOut 状态，0 page error。

```sh
node scripts/debug/account-native-capability.mjs
pnpm typecheck
pnpm debug group preferences --out docs/verification/account109/ui/recheck-native-default-preferences
```

本地 ignored 证据：`native-default-capability-01.log`、`typecheck-native-default-01.log`、`native-default-preferences-01/`、`native-default-fixture-smoke-02.log`。小探针首轮漏切账户页导致状态等待超时，修正探针后两路径通过；失败 `native-default-fixture-smoke-01.log` 保留。日志、截图及 HTML 不进入本提交。

**验收边界：**compiled capability 仅编译真实 client 并替换环境值/Tauri 检测标记，不执行 native IPC。Preferences 和两路径探针是浏览器 JS IPC fixture，不证明真实授权、常驻 Runtime 或跨端同步。本轮没有启动原生 App、操作设备/外部账号、发布或部署；产品真实验收仍待完成。主代理维护的 ACCOUNT-TEST-CASES.md 未修改。下文保留历史阶段记录，其中“默认关闭”“native 尚未注册”描述仅对应当时基线，以本节为当前行为。

## 历史阶段记录

分支 `codex/account109-ui`，基线 `737a9dcc`。本次保存账户 UI 开发成果，**不代表登录或账户同步已经可用**。当前主线尚无 Rust `account_command`，本次未实现或修改 native、服务端、CI、根依赖，也未操作实际设备或外部服务。

默认能力关闭：仅同时满足开发模式、`VITE_NOTES_DEBUG=1` 和显式 `VITE_NOTES_ACCOUNT_UI=1` 时开放账户页；debug runner 使用 `--account-ui` 显式设置该能力。生产构建始终关闭。默认桌面设置仍打开“外观与字号”，保留五项分类，不挂载账户组件、不请求账户 IPC。测试显式开启后，账户为第六项分类中的首项，原设备同步入口保留。

保存的实现包含安全 DTO/命令包装、授权等待/取消、profile、开关和合并说明、同步请求/设备状态、归属错误、退出确认及原冲突页入口。UI 仅轮询原生安全状态、提交命令，不创建账号 Runtime。冻结 DTO 未变更，无 token/URL 注入和生产 fake fallback。

独审三项 P2 已修复并添加小用例：取消失败时保留仍在途的登录事务互斥；取消/退出仅在 `signedOut` 且无 profile/error 时提示成功；后台权威状态恢复 ready/paused 后清除旧命令错误与过期登录 retry。

| 检查 | 结果 | 本地证据目录/日志 |
| --- | --- | --- |
| 最终 typecheck / build | 通过；build 仅有包体积提示 | `typecheck-final.log`、`build-final.log` |
| 账户 fixture 桌面，含三项 P2 | 27 项通过，无 page error | `account-p2-04/` |
| 账户 fixture 手机，含三项 P2 | 28 项通过，无 page error | `account-p2-mobile-04/` |
| 默认 Preferences 桌面 / 手机 | 146 / 159 项通过，无 page error | `preferences-03/`、`preferences-mobile-03/` |
| 默认 sync-settings 桌面 | 56 项通过，无 page error | `sync-settings-02/` |
| 生产 debug 隔离检查 | 通过 | `production-01/` |

初始检查点截图已查看 320/390/1280、浅深主题、极大字号：长账号折行、正文独立滚动、手机固定标题/返回/完成，未发现横向溢出，触达尺寸检查通过。当时完整账户五档字号、迟到生命周期矩阵尚未执行，恢复阶段的补验结果见下文。真实原生认证与跨端收敛仍尚未验收。

早期失败保留在本地：`preferences-01/` 是异步受控复选框被即时 uncheck 断言误判，改为等待真实保存后断言；`preferences-02/` 是旧焦点断言未包含已有“界面细节”末尾控件，截图确认焦点正确后更新断言；`sync-settings-01/` 是生成的 HTML 证据触发 Vite HMR，debug watcher 已排除 verification 目录；`account-p2-03/` 检出取消失败后等待界面消失，已随事务互斥修复。上述失败未删除，复跑结果如表。

只归档本文和本目录的忽略规则。日志、JSON、截图、HTML 等过程产物留在 ignored 本地目录，不进入提交。

复跑命令（在指定 worktree 中执行；不运行旧全套、不打开安装应用）：

```sh
pnpm typecheck
pnpm build
pnpm debug group account-settings --account-ui --out docs/verification/account109/ui/recheck-account
pnpm debug group account-settings --account-ui --mobile --out docs/verification/account109/ui/recheck-account-mobile
pnpm debug group preferences --out docs/verification/account109/ui/recheck-preferences
pnpm debug group preferences --mobile --out docs/verification/account109/ui/recheck-preferences-mobile
pnpm debug group sync-settings --out docs/verification/account109/ui/recheck-sync
pnpm debug check-production --production dist --out docs/verification/account109/ui/recheck-production
```

**Fixture 边界：**浏览器运行真实 React App、事件处理器、账户 IPC 包装和 DOM；`scripts/debug/account-fixture.mjs` 仅提供显式 JS IPC 状态/ACK。它不执行系统浏览器授权、Logto 换票、JWT 校验、Vercel/Redis/CyberGrid、Rust 常驻 Runtime、真实设备发现/传输或笔记合并。返回状态和设备均为测试数据，不能作为这些能力已交付的证据。

## 恢复阶段：状态与生命周期补验

合入 `main deafcfbd` 的提交为 `532ba1f7`，UI 写集保留；真实执行短用例已独立提交为 `75e0ed84`，见 [ACCOUNT-TEST-CASES.md](../ACCOUNT-TEST-CASES.md)。当前 DTO 与架构及 Native 的类型草稿字段一致，无字段变更；草稿不代表原生命令已经注册，生产能力门控仍关闭。

新增修复：认证完成、取消和退出移除当前焦点按钮后回到有效账户控件；不会抢走设置页头或分类焦点；新增安全状态的 polite/atomic 播报；旧登录 retry 在权威状态已变为 authorizing 时改为查询状态；后台确认退出后清除旧错误/确认；认证回跳 `state_mismatch` 不再误分类为资料库归属错误；失效授权时禁用同步开关；登录前可见首次合并说明。

补验结果：`pnpm typecheck` / `pnpm build` 通过；账户桌面 **119** 项、手机浏览器 **120** 项通过，0 page error；默认 Preferences 桌面 **146** 项、sync-settings **56** 项通过。运行命令仍为上方定向组，不运行旧全套。

- 两端账户组各包含 20 个可控迟到 IPC 组合：signIn/signUp × 取消/切分类/关闭重开/renderer reload × 旧成功/旧失败，及 status/syncNow × 旧成功/旧失败的退出/重开边界。断言旧 profile、错误、成功提示不可覆盖新权威状态，关页不会发出 cancel。此处 renderer 生命周期是浏览器重载，不能代替 native 进程重启或 OAuth 回跳校验。
- 两端各执行五档字号 × 320/390/1280 × 浅深 × signedOut/ready，共 **60** 个布局组合；检查水平溢出、28/44px 触达、页头可达和最后操作可滚动触达。查看了极小/极大字号截图及接触表，未发现溢出或被遮挡的登录操作。所有像素和设备状态来自合成库。
- 本地证据：`matrix-desktop-02/`、`matrix-mobile-02/`、`preferences-resume-01/`、`sync-resume-01/` 和 `typecheck-resume-01.log`、`build-resume-01.log`。`matrix-desktop-01/` 保留了刻意挂起 IPC 时错误等待全局 idle 的驱动失败；矩阵已改为等待明确 DOM 状态后释放响应。

待接线缺口：已提交并注册的 native `account_command`、Pauli 认证、server enrollment 和可追溯候选 App 就绪后，才切本分支真实能力并按短用例执行隔离双桌面验收。当前没有使用外部账户、操作 Android、启动用户已有资料库或将 fixture 结果描述为自动同步成功。

## Enrollment 独立复核（2026-11-13）

只读审查主工作区尚未提交的 `account-enrollment.ts`、`account-profile.ts`、`account-config.ts` 与账户定向测试。原 P2「签名入口未接共享限流」已接受修复：POST 在验 JWT 前扣 source 30/min，确认身份后扣 issuer/subject/canonical product 的 owner 60/min；不同前缀及 SHA-256 key 经同一 `coordinator.store.rate` 原子 Redis 实现；超限返回 429 / Retry-After 60，公钥 GET 不扣额度。未发现新增 P1/P2；授权、严格输入和账户/device/Noise 签名绑定维持有限接受。Native 固定 origin 取公钥、完整 proof 校验及 Noise 私钥持有证明仍待真实验收。

独立复跑 **8/8 通过、0 skip**，包含两个 handler 实例共享真实本机 Redis 的 source/owner 配额及 owner 隔离；未重跑全套。首轮因 PATH 缺少 Redis 失败，指定本机已有二进制后通过，分别保留 ignored `enrollment-review-rate-02.log` / `enrollment-review-rate-03.log`。在主工作区 `services/coordinator` 执行：

```sh
REQUIRE_REDIS=1 REDIS_TEST_SERVER=/private/tmp/cybergrid-redis-build/redis-7.4.3/src/redis-server node --import tsx --test test/account-enrollment.test.ts test/account-profile.test.ts
```

这些服务测试使用本机临时 Redis、临时签名密钥和合成 JWT，不是浏览器 JS IPC fixture，也没有访问实际部署或外部账户。主代理报告的 live PKCE/profile/enrollment 成功及负向 401/400 未由本作者执行，不替代双桌面自动同步验收。复核时主线尚未注册 `account_command`，继续保留生产 UI gate。

## Native IPC 接线候选（基于 main 4183af8b）

只读审查 Singer `92c6ffb9`（SDK `4c498298`）的 `account/types.rs`、`account/mod.rs`、`lib.rs` 注册及相关 adapter/transport。限定结论：IPC/安全 DTO/同步开关与 UI 兼容，未发现该范围新的 native P1/P2；不代表完整 native 安全审计或真实端到端验收。命令严格拒绝未知字段，可信主窗口来源由 native 核对；状态字段 camelCase、可选字段省略、最近成功时间毫秒值与 UI 校验一致；token/proof/私钥不进入状态 DTO，命令错误使用静态安全映射，UI 继续屏蔽原始 IPC 拒绝内容。

新账户 bind 后 `paused/enabled=false`，UI 不自动开启；确认“开启并合并”后才发 setEnabled(true)。连接失败可返回 `enabled=true/state=error`，UI 保留权威开关值并展示错误，不将开启或 syncNow ACK 当作同步成功。setEnabled(false) 暂停且保留 profile；退出只有 signedOut/无 profile/无 error 才显示成功。补齐 `account_cleanup_required`：有无 profile 均提供显式退出确认，禁用同步动作，不推荐重新登录或重试连接，旧命令 retry 先查询状态。

新增 **默认关闭** 的真实 native 构建能力 `VITE_NOTES_ACCOUNT_NATIVE=1`，且必须由 Tauri 承载才显示账户页。主代理合入上述 native 注册/runtime 和本 UI 补丁后，可为隔离候选执行 `VITE_NOTES_ACCOUNT_NATIVE=1 pnpm mac:build`；该变量会传入 Tauri 的前端构建。未设置时维持外观首项/五分类；普通浏览器即使设置变量也不开放真实入口。原 `--account-ui` 仍仅为开发 fixture，无生产 fallback。本作者只编译前端候选，没有构建、启动或认证真实 App；不要为缺少 account_command 的旧 native 构建设置变量。

检查：typecheck、默认生产构建及显式 native 开关的前端构建通过（仅常规包体积提示）。`node scripts/debug/account-native-capability.mjs` 对真实 client 进行 Vite 编译并核对 10 个能力组合；只替换环境值和 Tauri 检测标记，不调用 IPC，不证明 native 可用。首轮因 Vite lib 输出为数组的测试驱动错误失败，已修正，失败保留 `native-capability-01.log`，通过见 `native-capability-02.log`。账户 desktop/mobile 与 Preferences/sync-settings 的定向结果见下方；这些组仍是显式 JS IPC fixture，真实两库 App 登录、暂停/恢复、撤销及自动收敛待主代理执行，不修改其维护的 ACCOUNT-TEST-CASES.md。

本轮账户桌面 **126** / 手机浏览器 **127** 项、默认 Preferences **146** 项、sync-settings **56** 项通过，0 page error。新小用例覆盖 cleanup 有无 profile 的退出/确认/禁传输，以及 native 首次 paused 状态不自动开启和开关确认前不发送命令；既有字号和迟到矩阵一并通过。已查看 320px 深色极大字号截图。最小证据保留在 ignored `native-contract-desktop-01/`、`native-contract-mobile-01/`、`native-wire-preferences-01/`、`native-wire-sync-01/`，编译日志为 `typecheck-native-wire-01.log`、`build-native-wire-default-01.log`、`build-native-wire-optin-01.log`；复跑使用原定向命令和上文能力检查脚本。
