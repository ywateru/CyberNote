# account109 UI 阶段性检查点

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

账户截图已查看 320/390/1280、浅深主题、极大字号：长账号折行、正文独立滚动、手机固定标题/返回/完成，未发现横向溢出，触达尺寸检查通过。完整账户五档字号、所有迟到回跳/生命周期组合、真实原生认证与跨端收敛均尚未验收。旧 Preferences 定向组覆盖自身五档字号。

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
