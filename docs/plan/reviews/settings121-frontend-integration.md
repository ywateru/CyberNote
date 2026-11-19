# settings121 前端集成独立验证

2026-11-19。**结论：blocked。4项P2 blocking，未发现P1。原I1的实际App冲突入口、查询、resolve与Back接线在本轮前端边界通过；不得据此宣称真实Store冲突已解决或Rust host验收通过。** 本轮不改实现，只提交新增独立验证目录与本review。

准确被测产品提交：`dfc5c8415cae07db52610c93eba73ea22f20b507`，含public host 6a0e3de1、后续1d57e360、actual-App修正dfc5c841与UI c68ee19b。正式工作目录 `/Users/water/work/2026/.cybernote-worktrees/settings121-verify-frontend`，branch `codex/settings121-verify-frontend`。迁入时HEAD核对一致且产品树干净；运行前后产品HEAD一致，除本验证者新目录外没有未提交内容。root `node_modules`仅作依赖软链。

此前在integration树启动的一轮为准备探针，后来已停止/结束并迁至用户专属verify树，**不作为正式收据**。本报告全部行为结果来自上述独立冻结树。没有在integration写文件，没有等待或依赖其后续导入的修复。

## 发现与修复验收条件

### F1 — P2 blocking：Cloud访问代次变化不清理秘密草稿/旧预览

- 契约：`agent.md`授权/异步所有权、AGENTS第7条，以及主设计 `docs/architecture/settings121.md` 的旧Token/库代次拒绝和不允许旧响应作用于新状态要求。Cloud预览是限时绑定当前上下文的确认意图。
- 位置：`src/App.tsx:5049` 只传 `active={preferencesTab === "account"}`，没有访问blocked/epoch/library生命周期；`src/cloud-sync/CloudSyncSettings.tsx:110`起清理effect仅依赖`:146 [active]`。备份组件在`:5054`已有blocked/accessKey，Cloud未具备对应接线。
- 实测A（桌面/Android UA均复现）：从真实账户页点击“预览”，将native reply手动挂起；发既有 `notes-access prepare`，确认App出现保护cover；再释放旧reply，最后发commit并提升access epoch、执行实际App刷新。旧“同步预览”仍保留，恢复后可见，计数1而非0。
- 实测B：真实Cloud设置表单输入合成加密密码草稿；同样prepare→epoch变化→恢复。输入仍保留27字符，没有清空。结果只记长度，不输出/提交秘密草稿值。
- 证据：`-negatives/result.json` 的 cloud-accepted-preview-after-access-prepare-cannot-reappear，两端false；`-composition/result.json` 的 cloud-secret-draft-cleared-across-access-generation，两端false；`desktop-cloud-after-access-restore.png`及对应手机图。
- 影响：App cover保护了访问转换期间的画面，但没有结束模块内部的旧确认/秘密生命周期；恢复后仍展示旧意图。此发现不声称突破原生CloudFence或已向未授权Store写入，native仍必须拒绝旧确认。
- 最小修复方向：让Cloud可见生命周期绑定实际Session/Store/访问代次与blocked状态，代次失效清理草稿/预览并丢弃旧回复；不要只在每次invoke前取fresh context，却继续复用旧preview。覆盖同页撤权、换库、账户adoption/Store替换、pending confirm和取消后的晚回包。不要为刷新UI放松native授权。
- 与Cloud既有C4/C5去重：本验证者已只读核对模块独审和后续 `f57c40bf7cad15485a44f371439103bd71b11514`。C4是确认Promise失败/确认互斥，C5是hide→reopen旧inFlight占位；它们不作为本报告新缺陷，也不因dfc5c841未导入fix而重复阻塞。本F1在整个账户页 `active=true` 时发生，且f57c40bf的生命周期effect仍仅依赖 `[active]`，核心缺口是App没有提供访问/Store代次生命周期。没有在本冻结树运行或宣称验收f57c40bf或HostCloud接口新实现。

### F2 — P2 blocking：加密导入把已提交maintenanceError静默改成null

- 契约：主设计的“已提交后刷新失败保留提交事实，不再次导入”，备份模块 `ImportCommitted` 与README明确要求提交后的维护/刷新失败作为警告保留。
- 位置：`src/App.tsx:4159` 的 encryptedArchive.confirmImport；`:4161` 仅解构 `delivery`，`:4162`重新构造 `maintenanceError:null`。原生声明 `src-tauri/src/settings_host/files.rs:195`附近实际能返回 `outcome:"committed" + maintenanceError`，所以该字段不是本验证杜撰的接口。
- 实测：通过实际“加密导入…”→密码表单→文件选择→预览→“确认导入”，invoke fixture返回committed、一个有效delivery与维护错误“独立维护失败，提交已完成”。两端均只显示“加密备份已导入”，没有maintenance警告；native confirm调用恰好1次。
- 证据：`-negatives/result.json` 的 encrypted-import-committed-maintenance-error-is-preserved，两端false；`desktop-encrypted-committed-maintenance.png`与手机图。该检查证明真实App adapter丢失字段，未声称实际执行了加密或Rust DB commit。
- 修复方向：保留并传回宿主的已提交结果、maintenanceError与之后hydrate的refreshError；使用模块现有committed warning路径，确认只消费一次。补测maintenanceError与refreshError分别/同时存在、取消不commit，不能退回一般“导入失败，重试”或重复导入。

### F3 — P2 blocking：真实updater桌面控件仍走原生select

- 契约：主设计“界面”精确规则与用户UI完全一致要求；桌面弹出选择应沿自有菜单，手机可保留select。原UI R4在PreferenceSelect已修，不能在最终module组合重新出现。
- 位置：`src/software-update/SoftwareUpdateSettings.tsx:161`检查频率、`:177`更新频道；App `:5047`直接装入生产组件。
- 实测：从真实设置入口打开真实更新面板，点击“更新频道”，浏览器实际DOM为SELECT而非自有触发器/MenuSurface；桌面断言false，手机SELECT按平台预期通过。截图 `-negatives/desktop-updater-channel-control.png` 是headless页面截图，不冒充捕获了OS选择弹层。
- 最小修复：用已验证的PreferenceSelect或兼容同一MenuSurface/浅暗token/键盘/取消契约的薄adapter替换这两个桌面select，原值、configure patch、disabled和手机select不变；补开启频率、频道切换、保存失败、Escape/外点、viewport验证。不要仅对收起态染色。

### F4 — P2 blocking：导入备份搜索仍指向被移除的旧owner

- 契约：设置搜索真实可达、异步落点和单owner要求；UI fix R2的等待机制不能掩盖永久不存在的目标。
- 位置：`src/Preferences.tsx:53`仍将“导入与备份”映射 `.data-backup-section`。integration已从 `src/DataManagement.tsx:660`末尾移除整个旧backup区域，实际操作归 `LocalBackupSettings`（App `:5054`）；该新组件没有旧selector。
- 实测：两端从外观页查找“导入与备份”，点击真实结果；实际备份模块已完成status加载并可操作，却等待5秒后显示“设置尚未加载完成，请检查当前页面的加载状态后重新查找。”没有获得应有落点。不是慢fixture或host未注册。
- 证据：`-search/result.json`两端false；`desktop-search-backup-destination.png`与手机图。
- 最小修复：将搜索定位到新备份owner或其导入控件，检查同族导入/导出/Apple导入关键词与showArchiveControls条件。加载就绪应直接聚焦，权限/平台确实不可用应给准确前置提示；不得删除超时保护来掩盖失配。

## 通过的实际App行为

以下都通过生产 `main.tsx → App → Preferences/三个新组件/SyncSettings → native invoke` 路径触发；未复制Pasteur脚本或用静态字符串证明回调。

- **I1前端闭环pass**：从实际设置按钮进入账户，点击真实AccountSettings“查看冲突（1）”，native冲突query调用增加并显示两分支。选择“保留此版本”先出现确认，取消/第一次Back不resolve且保留展开区；再次确认恰好1次 `sync_command.resolve`，绑定 `kind=note/entityId=note-a/digest=a×64/keepAll=false`。之后Back先关闭冲突结果，再关闭disclosure，设置仍保留。旧 `settings.tab(sync)`映射账户展开区，配对UI未挂载；从debug conflict-only handle调用旧startHost被拒绝且没有native pairing请求。不能将fixture返回空conflicts称为真实Store解决成功。
- 两端真实设置入口与6分类可达；打开/切换不触发cloud sync、local_backup_now或update install。云/备份status实际invoke发生，未以“元素存在”替代handler证明。
- 实际备份6小时设置发partial `{hours:6}`；立即备份恰好发1次native now；恢复先preview、Escape取消不restore。旧DataManagement归档行已移除，导入/导出各1行；手机无不支持的目录“更改”入口。
- 正常切页后返回的backup成功/Cloud预览不发布到新页；备份受access prepare阻止并丢弃迟到成功。**这不抵消F1：Cloud同页的访问代次路径不同。**
- 本地版本恢复native committed后注入load_workspace刷新故障：确认消费、native restore仅1次、模块保留committed warning，没有重放。App保护cover可能遮住该局部warning，需恢复可信读后查看；该检查未假定旧库仍可见。
- 加密预览fixture返回错密码错误：密码输入清空、不发confirm；普通导入系统确认取消发discard、不commit。证明App回调零commit路径，密码学真实性由Rust另审。
- Cloud真实系统confirm取消不sync，明确确认后只sync一次；返回 `applied=false/pending=1` 显示等待本机安全应用，不显示上次完成。32/48/16MiB限制文字在实际App可见。Cloud test故障只有1个可见错误面；归档export故障亦1个可见错误面。
- 一个root updater轮询链：在同一App实例连续开关设置3次后，6.1秒窗口两端各3次status调用，没有随开关增生；手动check各1次，无install。单独手动挂起旧status→完成check→释放旧checking回复，未覆盖终态；check错误有1个更新错误面。
- 更新入口立即Escape只收起pane并恢复trigger焦点，设置保留；桌面原主题MenuSurface能打开/Escape关闭，手机保留主题combobox。
- **组合CSS检查pass**：backup“立即备份”、Cloud“测试连接”、updater“检查更新”浅灰 `rgb(99,99,107)` / 暗灰 `rgb(161,161,170)`，font12px、padding3px7px；手机实际操作按钮≥44px。pill实测22px/999px/arrow-up；桌面侧栏196px/gap8px，原视觉没有被三个模块palette污染。明确强调的字号预览紫色允许，不要求所有文字一律灰。
- 实际账户/备份/更新共24张viewport截图：桌面800/1280、手机320/390×浅暗×3页，无横向溢出；可见手机button/select/summary≥44px。人工查看了Cloud恢复后旧预览、加密成功缺维护警告及组合页面。截图不代表原生WebKit/Android弹窗验收。

## 检查结果与产物

Node22.16.0、pnpm10.15.0、Google Chrome157.0.8103.79。desktop为共享debug桌面交互（其navigator平台fixture为Linux），手机为Android UA/isMobile/hasTouch；无真实Mac AppKit工具栏/设备。

正式运行分4组，全部固定dfc5c841、无pageerror；**42个scenario断言，33通过、9失败，失败对应以上4项发现的跨端/双负例。总结果blocked，不能用26个正常路径通过覆盖负例。**

| 运行/命令 | 完成结果 | 产物目录 |
| --- | --- | --- |
| 初始独立actual-App正常/常见故障组 | 26/26 pass，exit0 | `/tmp/cybernote-settings121-frontend-dfc5c841/` |
| `--only 'encrypted-import\|cloud-accepted\|updater-outdated\|actual-update-desktop'` | 3/8 pass，5失败，exit1 | 同前缀加 `-negatives/` |
| `--only 'encrypted-precommit\|cloud-secret\|composed-sidebar'` | 4/6 pass，2失败，exit1 | 同前缀加 `-composition/` |
| `--only 'actual-search-import'` | 0/2 pass，2失败，exit1 | 同前缀加 `-search/` |
| `pnpm typecheck`、`pnpm version:check`、`git diff --check` | 全部exit0，0.1.0一致 | 本次工具终端结果 |
| 两个新增mjs `node --check` | exit0 | 本次工具终端结果 |

完整调用形式：

```sh
node scripts/verification/settings121-app-independent/run.mjs \
  --root /Users/water/work/2026/.cybernote-worktrees/settings121-verify-frontend \
  --revision dfc5c8415cae07db52610c93eba73ea22f20b507 \
  --out /tmp/cybernote-settings121-frontend-dfc5c841
```

当前完整runner还包含首轮运行后新增的负例；复现历史分组可用表中regex。每个scenario重新加载真实App隔离错误/cover，只有updater生命周期scenario刻意不重载其内部3次开关。`result.json`记录fixed/final SHA与product dirty检查，`receipts.json`只记录allowlisted native调用形状；`summary.json`汇总四次正式结果与脚本SHA256。脚本允许自身未提交验证目录，产品改动仍拒绝运行；所有本次implementation代码来自dfc5c841。

作者 `scripts/verification/settings121-integration/actual-app.mjs` 本版已比早期smoke加强：确实测试了Account callback→resolve、普通/加密export与encrypted confirm、quit ACK。独立检查承认这些覆盖；其不足主要为成功DTO固定、没有维护错误、访问代次/晚响应、错误数量、provider增生与组合菜单/搜索owner检查。作者脚本未重跑，独立路径覆盖不等于复制作者收据。

准备阶段一轮paused-clock探针阻塞App调试桥的rAF settle，已结束其专属测试进程并改为实时时间窗口后重跑；不计为产品失败。正式baseline在全部PASS与清理后还记录Vite/esbuild依赖优化“service is no longer running”日志；没有browser pageerror，结果/截图已完成，此收尾日志单列，不扩展为Rust/native结论。没有修改共享runtime来隐藏日志。

## 边界与交接

本fixture仅mock native IPC/文件选择/系统confirm与现有JS协议backend，真实执行前端回调、状态、计时器、access事件和CSS。它**没有**执行生产Store、quiet/barrier/lease、加密解密、文件持久化、云HTTP、真实账户、updater下载/安装或进程退出；这些均交独立Rust host/平台审查。UI可正确显示fixture的committed/applied也不证明宿主确实提交。

未跑全套Tauri/重型测试、未触用户库/系统账户/用户原生App，未安装发布；浏览器临时服务与子进程由runtime/finally清理，原始数据均合成。macOS WebKit本机缺失，Android UA不是WebView/真机。原UI recheck的C1程序化焦点层级P3仍是已知边界，本轮没有将其升级或宣称全部层级组合通过。

交作者修F1–F4并提供新的冻结SHA后，仅复测受影响family和必要组合负例；不由验证者修实现。I1前端接线证据可供整合接收，但整体前端在四项阻塞关闭前不pass。提交仅本review与 `scripts/verification/settings121-app-independent/**`。
