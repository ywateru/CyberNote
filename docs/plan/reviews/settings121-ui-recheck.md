# settings121-ui 修复独立复审

2026-11-19。**纯 UI 模块：pass。原 R1、R2、R4、R5、R6 五项 blocking 和 R3 nonblocking 的规定复测通过；没有本轮 P1/P2 blocking，另记 C1/P3 nonblocking 层级边界。I1 实际 App 冲突接线仍须由整合验收，不因本模块 pass 自动关闭。**

固定被测实现：`c68ee19b0b272a666745481505403ce3e15789ca`。起止检查 HEAD 一致，测试前工作树干净；本提交仅增加此 review，不修改实现、不管理工作树、不推送。原独审 [settings121-ui.md](settings121-ui.md) 保留作为 before 证据。

先重新读取本树 `agent.md`、主目录只读 `docs/architecture/settings121.md`、`docs/plan/tasks/settings121-ui.md`、新增 `src/preferences-menu/README.md`，并核对共享 `MenuSurface`/菜单层 owner 及 presentation README。独立检查 c68ee19b 全部10文件 diff，包括新 adapter/CSS/README。Shared `Menu.tsx` 未改，新增适配器的定位、层登记、外点和监听清理由真实 MenuSurface 承担；radio keyboard 是 adapter 对共享 menuitem selector 的补充。

## 原发现逐项结论

| 原发现 | 本轮 before→after 与完成检查 | 结论 |
| --- | --- | --- |
| R1 更新立即 Escape 退出整个设置 | 工具栏入口打开更新，分别保持入口焦点、移到搜索框、移到面板操作，再 Escape：仅收起更新，dialog保留，焦点回更新入口。菜单内 Escape先关菜单，再Escape关更新，均不退出设置；Android 320px同样通过。`Preferences.tsx:170` 起的 document handler现查询共享最内层owner和update状态。 | pass；补充C1见下 |
| R2 首次账户异步加载丢失搜索落点 | 原“我的设备”+250ms status回包复现路径，现在等到设备组可见并聚焦 `.account-device-group`。另用手动release的status Promise验证切分类、关闭设置、新搜索、用户Tab转移都取消旧意图，迟到不抢焦点；5秒controlled-clock超时有明确提示，12秒迟到不抢搜索框；错误回包聚焦账户并提示重新读取。代码 `Preferences.tsx:211` 起timer、`:222` 起observer，成功/取消清理均核对。 | pass |
| R3 Android/未登录搜索不存在操作 | 真Android UA（不只mobile prop）下“登录与安全”不返回；未知账户搜索设备明确提示登录前置，跳入后focus登录按钮并给出“请先登录”；已知signedOut再次搜索设备无结果。桌面“登录与安全”在异步账户状态返回后展开details并focus summary。`Preferences.tsx:143`与AccountSettings的纯呈现availability属性不承担授权。 | pass |
| R4 桌面原生select展开不一致 | 实际点击生产adapter，强制外层 `NativeMenuContext=true` 仍出现DOM `role=menu`/menuitemradio；选中项focus，方向键/Home/End/环回/typeahead、Space/Enter选取、Escape丢弃未确认highlight、外点、Tab/Shift+Tab、disabled项跳过、页面隐藏与平台切换清理通过。保存150ms期间触发器禁用、菜单释放；失败保留先前确认主题。见 `PreferenceSelect.tsx:117` 的native=false inline MenuSurface。 | pass；没有仅凭no-select源码下结论 |
| R5 普通button与共享text被染紫 | “全部关闭”、账户刷新、共享 `settings121-text` 的实际浅暗computed均为控制灰，12px、padding3px7px、radius6px；hover为pill灰底，普通操作不再紫色。精确值见下。字号预览summary等明确强调仍紫色，按用户补充要求接受，不要求所有文字均灰。 | pass |
| R6 更新普通link/Download图标 | 实际 `.preferences-update-pill` 高22px、radius999px、11.5px/560、padding0 9px 0 7px、accent-soft底和0.5px内描边；SVG实际class为 `lucide-arrow-up`。320/390px外层按钮≥44px而视觉pill保持22px。 | pass |

## 精确视觉与布局证据

独立产物 `/tmp/cybernote-settings121-ui-recheck-independent-20261119/`：`independent.mjs`、`layers.mjs`、`result.json`、`layers-result.json`、`independent-metrics.json`、`menu-layout.json`及截图。作者原产物 `/tmp/cybernote-settings121-ui-fix/` 未覆盖。

- R5浅色：普通action/shared text/账户刷新均 `rgb(99,99,107)`；暗色均 `rgb(161,161,170)`。普通action/shared text字体12px、padding3px7px、圆角6px；hover背景浅 `rgb(241,241,244)` / 暗 `rgb(45,45,51)`，hover正文浅 `rgb(28,28,33)` / 暗 `rgb(237,237,241)`。账户刷新原生最小触达28px仍保留，未把桌面所有按钮高度误要求为文字行本身高度。
- R6浅色底 `rgb(238,237,253)`，暗色底 `rgb(43,44,71)`；对应accent `rgb(79,70,229)` / `rgb(165,180,252)`。实际box-shadow是accent35%的0.5px inset，向上箭头12px。它与旧28.375px高、6px圆角、transparent/none的普通link已有可观察区别。
- 新菜单有新增布局风险，故定向检查 **48组合**：极小/中/极大真实 `fontScales(settings)`投影 × 1280×900/800×400 × 主题、排序、桌面导航、桌面显示、桌面密度、手机显示、手机密度、菜单间距。全部menu矩形位于视口内（允许1px rounding），并用 `elementFromPoint`检查上下边缘实际可命中，避免只验boundingBox而漏祖先裁切；0失败。没有重复旧180组合。
- 目视检查独立 `desktop-light-menu.png`、`desktop-dark-menu.png`、`mobile-320.png`、`mobile-390.png`、`R2-delayed-device-focus.png`，以及作者复跑生成的短窗口menu图。DOM菜单有勾选列、圆角卡片、浅暗token、应用内字体和选中/hover反馈，替换旧系统蓝色选择窗口；未宣称逐像素等同原截图1。
- Android UA真触控模拟320/390px：保留主题原生combobox、可见button/select/summary均≥44px，更新pill22px，无横向溢出。实际Android WebView原生select弹窗仍需平台验收。

## 新增残留 C1

**C1 — P3 nonblocking：菜单打开但焦点被程序移到更新面板兄弟操作后，Escape仍同时收起两层。**

- 位置：`src/Preferences.tsx:312` 的更新section onKeyDown先于document层的`:175`共享owner检查。
- 复现：打开更新→打开fixture更新通道菜单→程序focus“重新检查”（菜单外、更新section内）→Escape。实际menu0、update pane0、settings dialog1；理想为menu0、pane1、dialog1。
- `layers-result.json` 的此断言false；其他4项层级补证通过。正常菜单内Escape、外点、Tab以及原始立即Escape路径已通过；正常外点/Tab会先关闭菜单，因此此例需程序化/辅助技术焦点转移，与原“打开后立即关闭整个设置”的普通键盘回归不同，不作本轮模块阻塞。
- 建议更新section自身也先consult共享最内层owner，并保持内层event.defaultPrevented优先。未修改代码。不得把此边界写成“任意焦点位置层级均已通过”。

## 完成检查与测试有效性

| 检查 | 准确结果 |
| --- | --- |
| `pnpm typecheck` | exit0，src完整类型检查。 |
| `pnpm version:check` | exit0，0.1.0前端/Tauri/Cargo一致。 |
| `node scripts/check-settings121-ui.mjs --typecheck` | exit0，21个非声明源码依赖。 |
| `git diff --check HEAD^ HEAD` | exit0。 |
| 作者扩大后的脚本独立复跑 | exit0，结果和截图在 `author-baseline/`；revision=c68ee19b、dirty空、errors空。 |
| 新增 independent.mjs | **26/26断言pass**，包括原触发负例、手动held replies、controlled timeout、实际UI操作/computed、48个菜单布局组合、Android UA。零pageerror。 |
| 新增 layers.mjs | **4/5断言pass，1项false即C1**；exit0代表完成结果收集，不代表全pass。 |

作者脚本确实执行生产React、真实菜单交互与250ms延迟、timeout和最终DOM焦点检查，没有把被测函数重新写成测试的判定实现。但其宿主对账户/数据/更新仍是本地ports，并非实际App。作者fixture也没有把字号选择投影到真实fontScales，因此本轮新增真实字号投影和菜单命中检查；另外使用手动释放回包、关闭设置与用户Tab取消，补强原脚本固定时延的覆盖。独立脚本首轮误用不存在的 `page.clock.uninstall`，已改为关闭受控时钟page并新建page后继续；这是工具脚本修正，最终完成结果如表，没有改产品源码。

## 集成与未测边界

- **I1继续开放，必须真实App整合验收**：账户“查看冲突”改接controlled `conflictsOpen/syncConflicts`，仅冲突查询/解决，不复活配对整页；Back/dismiss优先级与debug门禁/旧分类断言同步迁移。本修复未改App/SyncSettings/lib，不能将作者已连接的fixture外推为I1已修。
- Cloud/backup/update真实组件、命令与生命周期装配由整合任务验证。共享原语R5现已纠正，下游module CSS仍需检查最终组合是否覆盖这些规则；本轮只证明公开primitive和现有局部消费者。
- 无Tauri/Rust全套、原生用户App、真实账户/笔记库/备份、安装发布操作。macOS WebKit candidate缺失，未下载浏览器；Chrome与Android UA不能替代原生WebKit/WebView/IME/系统弹窗验收。
- 复审实现全程固定c68ee19b；仅提交本review，旧review和实现保持原样。纯模块可继续整合，实际App验收交独立前端/宿主检查。
