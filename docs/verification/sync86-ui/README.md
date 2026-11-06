# 设备同步设置86：develop 交付

状态：产品源码冻结，待独立 verify 与根主线整合。2026-11-06。此报告不是网络同步完成声明。

产品/调试源码提交 `a9221a0e83b666d47b7fde3bd26a18ea63834a01`，基线 `037d9a7693c8021acbc2d036887fe24cab95bbe5`，分支 `codex/sync86-ui`。工作目录 `/private/tmp/apple-notes-sync86-ui`。

规格沿用 `docs/ui/sync-settings.md`，外观沿用82共同设置壳。系统字体、既有 paper/grouped/line/secondary/accent 变量，设备同步放在数据总览备份之后、文件详情之前，共用一个滚动容器；分类详情不展示该块。首轮文件统计失败仍保留备份和同步入口。

## 实现边界

- `src/SyncSettings.tsx/.css` 为真实 React 产品组件。涵盖默认关闭、设备名称/端口、开启服务、加入、邀请生成/复制/到期清除、停止/继续、人工同步、设备撤销与两种冲突解决确认。先显示明确本地确认，再调用变更 IPC。后台查询不禁用正在输入的控件、不移动焦点。
- `src/sync-client.ts` 为严格产品包装。调用 `invoke("sync_command", { command, expected: accessGate.expected() })`，正文 `type` discriminant 与规格一致。对返回状态、peer、冲突版本、计数/时间/boolean/digest/未知字段逐层检查。optional 字段采用省略而非 null；Rust 适配器须采用 `skip_serializing_if`。请求只重建 allowlist 字段。没有 native bridge 时明确要求已安装应用，产品无假同步分支。
- `status` 不启用服务、不创建身份。UI 只在用户操作时发送 startHost/pair/createInvite。`pendingCount > 0` 优先展示“已接收 N 项，等待安全应用”，idle 不替代待应用提示；`lastSyncAt` 仅标“最近传输”，没有把 durable/inbox 当业务已应用。
- singleflight 约束变更指令；读状态可与新变更交叠，但 generation 禁止较旧读状态覆盖后续变更。切换标签、分类或关闭后，旧回包不能重新展开邀请。邀请/粘贴串不写 localStorage、不进 inspect/命令结果/aria-live/错误文案；secret 只写 input DOM property，HTML debug 快照不序列化 value attribute。
- App 仅新增组件插槽、handle、debug busy/state 与十条真实 handler 映射。DataManagement 只有 optional ReactNode 插槽。没有改 Rust、Store、原录音或保存逻辑。
- `sync.revoke` 与 `sync.resolve` 调试命令打开真实 inline 确认，使用 `dom.click` 或 DOM 点击确认按钮执行。所有 sync 命令须在数据总览可见时调用，隐藏/分类详情拒绝。
- `scripts/debug/platform.mjs` 的 sync_command 为显式 UI-only IPC fixture，验证本机 expected session/epoch，调用日志只记 command/type，不记邀请入参。fixture 不实现 socket、Noise、Store、因果合并或真实冲突副本。

## 冻结源码后的验证

所有最终 summary 的 sourceHead 均为上述冻结提交，sourceInputsAtStart 与 sourceInputs 的130项 SHA256 都为 `42867a68b354af753ec04d5ba8fb349e589c3edbc101106e8f6d1a614c9505cd`，`sourceInputsChanged:false`，运行前后工作树 clean，pageErrors 为空。

| 命令 | 自然退出 | 证据 | 范围 |
| --- | --- | --- | --- |
| `pnpm build` | 0 | `develop/final-build/result.json` 与 `build.txt` | tsc + Vite；既有 >500kB chunk 提示继续存在 |
| `pnpm debug group sync-settings --out /tmp/sync86-ui-final-desktop` | 0，48项 | `develop/final-desktop/summary.json`、suite、HTML、PNG | 真实 App/React/严格 wrapper；合成 IPC |
| `pnpm debug group sync-settings --mobile --out /tmp/sync86-ui-final-mobile` | 0，48项 | `develop/final-mobile/summary.json`、HTML、PNG | mobile browser，非 Android WebView/IME |
| `pnpm debug group preferences --out /tmp/sync86-ui-final-preferences` | 0，52项 | `develop/final-preferences/summary.json` | 原82设置、备份、录音保有、授权变化、键盘与布局回归 |
| `pnpm debug check-production --production dist --out /tmp/sync86-ui-final-production` | 0 | `develop/final-production/summary.json` | 生产无 debug API，URL 无法启用；3个资产无四项 debug/fake 标记 |

每个 sync-settings 组保存320/390/1280浅深六张 PNG及同一真实设置壳完整HTML。320采用360px短屏，检查共用滚动容器、无横向溢出、所有同步按钮至少44px。生成/粘贴串的秘密检查在真实 HTML snapshot API 上执行，浏览器安装提示测试直接调用实际 wrapper 的 !isTauri 分支。该测试并没有运行一个无 native 的完整浏览器版本应用；不能将这点扩大为浏览器全应用验收。

`develop/manifest.json` 保存证据文件字节数与 SHA256。图片/HTML全部合成数据；截图中“UI 合成 Mac”等状态只是明确 fixture。

## 首轮失败与修正记录

原始失败JSON/快照/PNG留在 `develop/attempts/01` 至 `05`，未改写为通过。

1. 首轮 `inventory:1` 在开发 StrictMode replay 后第二次采样可能成功。测试改为有界持续失败以准确覆盖入口仍在，而后显式恢复并刷新。
2. StrictMode replay 作废旧请求 publication，而新的 effect 被singleflight挡住，首次状态停在读取中。旧请求释放后若当前 lifetime仍可见，重新查询当前状态。
3. 状态读取期间禁用输入框导致focus丢失。状态只占读取标记，UI仅变更期间禁用控件；读回包仍受generation保护。
4. 上一条“同步请求已发送”notice会覆盖新pendingCount。待应用状态优先于notice和最近传输。
5. fixture reset使用Object.assign，旧动态sync字段未被清除，影响新加入场景。构造器显式初始化sync/syncConflicts，重置不保留上一轮服务。

后续分别增加了邀请确切到期时间、确认区聚焦、HTML secret 不序列化、关闭后迟到回包、严格字段拒绝等检查。最终只在冻结源码上完成上表定向回归，不以此前不同源码的通过替代。

## 后续必须另证

真实 Rust sync_command / Session quiet gate / 网络加密认证 / 双进程与多设备收敛 / 附件 / locked / 删除恢复与冲突副本，均由84/85/86生产适配与独审证明。当前分支没有这些功能的产品实现，fixture通过不代表网络可用。

未操作原 Android 设备、未安装APK、未读取/备份旧13秒录音、未调用真实麦克风、未操作原版删除测试、未push或部署。未打Tauri包，node_modules只是现主线依赖的symlink。独立verify与主线完整回归由根编排。


## P2 两轴触达修复（独审后）

独审原结论、原失败及57项严格边界证据完整保留在 `docs/plan/reviews/app-sync86-ui.md` 与 `independent/`，本次没有覆盖原件或将它们改记为重新通过。

新产品冻结 `9ed9a07851ca2d00a6da51441c82c3513e458f22`，只改2个文件、3行新增/1行替换：`SyncSettings.css` 的同步按钮补 `min-width:44px`（保留 `min-height:44px`）；作者布局断言同步检查实际 `width < 44 || height < 44`。没有修改旧Preferences、coordinator、Rust或设备。

仅运行受影响的同步组与构建/生产排除检查：

| 命令 | 自然退出 | 证据 |
| --- | --- | --- |
| `pnpm debug group sync-settings --out /tmp/sync86-ui-p2-desktop` | 0，48项 | `develop/p2-touch-targets/desktop/summary.json` |
| `pnpm debug group sync-settings --mobile --out /tmp/sync86-ui-p2-mobile` | 0，48项 | `develop/p2-touch-targets/mobile/summary.json` |
| `pnpm build` | 0 | `develop/p2-touch-targets/build/result.json`、`build.txt` |
| `pnpm debug check-production --production dist --out /tmp/sync86-ui-p2-production` | 0 | `develop/p2-touch-targets/production/summary.json` |

三份summary的sourceHead均为新冻结提交，130项sourceInputsAtStart/sourceInputs指纹均为 `db24c8ca15e77c772de7f9a759c1c711cc3525e1c9549f25f447ba5367c9dba0`，源码前后不变且clean，pageErrors为空。desktop/mobile各保存320×360短屏、390/1280浅深六组实际HTML/PNG/几何数据，smallButtons现在同时按宽高检查且均为0。新证据manifest单独放在 `develop/p2-touch-targets/manifest.json`。

原Preferences52项与独立57项只保留其原产品适用层，没有重跑无关矩阵。当前等待同一独审者对P2及受影响同步组复验；这些仍是合成IPC的真实UI证据，不代表Rust网络或Android原生验收。
