# APP-001 FIX07 candidate02：独立有限 Android 复验

日期：2026-11-03。结论：已安装保全包 `5dd6dfc8…` 的原失败点在本轮独立实际运行中通过。真实新建 → 选 Beta → 加粗 → X/Back → 纸张取消 → 再打开选择 grid-large → 重开/Back → settled，保留同 Editor/View/DOM、真正父级 React key、选区与完整正文；自身保存、真实前台刷新、冷启动内容核对也有限通过。旧 `e117f929…` 的实际失败保留，不因新包通过而修改旧记录。全应用、原 Notes 像素、Undo单步语义和其他矩阵仍未通过本报告验收。

独立原始证据：`docs/verification/qa-fix-07/run-5dd6dfc8/`。开发冻结证据另为 `f4586a4:docs/verification/app-001-fix-07/android-candidate02/`；以下明确区分独立运行和该开发记录的只读复核。

## 环境恢复与包身份

设备交接后的首个身份读取即失败：adb devices为空、emulator-5580不存在，未先执行任何UI或设置操作；只读进程核查也无原qemu。按root授权，从现有 `/Users/water/.android/avd/nuva_mirror_isolated.avd/emu-launch-params.txt` 找到精确旧启动参数，恢复同一AVD/5580端口、同一API30 arm64镜像和自定义 recovered data/encryption/cache路径；保留read-only/no-window/no-snapshot、swiftshader、2048MB/2核。未wipe、未换镜像、未clear data或卸载。

恢复后系统boot_completed=1，clone包缺失。原环境为read-only临时overlay、原进程已退出；本次恢复的包/fixture缺失不能当作产品force-stop丢数据。按新增明确授权执行正常 `install -r` 安装已保全候选，在新独立合成笔记中验证。原四输入设置读回为LatinIME默认、原enabled集合、subtype=-1、硬件键盘显示IME=1，与先前记录完全相同；本轮没有更改输入设置或启用Trime。

安装后及结束时，设备base.apk SHA256均为 `5dd6dfc8d31812c2bafcff5115d9946456ff6d37028f2caed174585c91ca0ca2`，匹配独立读取的保全APK（300,954,834B）。`installed-identity.json`、`final-state.json`保存结果。环境恢复精确参数、启动事实、正常安装记录见 `environment-recovery.json`。模拟器由前台 exec session **73263** 保持，PID **3197**，结束本轮没有终止，避免再次因宿主生命周期丢临时overlay；这是环境保全，不是产品数据库恢复保证。

独立核对列明90输入：79项对应冻结产品git `5c46536` 字节，11项为当前磁盘生成输入，全部匹配；聚合 `69d6e95156168a3f7eee52b1deacca490f75c3841536ddcc078c4758106310e0`匹配。5个已安装PM补丁文件哈希匹配。开发证据manifest84项全部重新hash匹配。详见 `developer-source-evidence-review.json`、`independent-checks.json`。Mac .m/.h被Android清单排除；不声称完整HEAD可重现或本轮重新构建。

## 独立实际选纸、保存与冷启动

合成标题 `QA07-1793715026306`，note id `d699e8fb-872e-4420-a7da-f24a513f65ad`。保存实际运行脚本 `paper-independent.mjs`、动作日志及逐态PNG/JSON于本轮目录。脚本从冻结开发paper-regression改作有限独立重放：保留纸张断言，移除已证不成立的一次Undo去bold假设和相关Undo/Redo步骤，改为真实轻触正文恢复输入，继续自身保存/冷启。没有为适配该假设改产品或编辑器历史。

所有创建、文本、选区和纸张变化通过Android原生input触摸/按键；运行时仅观察真实文档/selection、读取DOM几何和React父链、给对象加入WeakMap观察编号、调用真实Rust load_workspace只读存储。未设置编辑器选区/文档、未伪造hydrate、未用DOM click代替动作，未启用Debugger或断点。选择位置27..31来自真实长按Beta；fixture标题长度不同，不能要求与开发29..33或旧失败33..37的绝对位置相同。

| 独立实际边界 | 完整正文与selection | 身份、焦点与键盘 |
| --- | --- | --- |
| 首次纸张页 | 与加粗后的完整JSON相等，Beta27..31。 | Editor/View/DOM=1/2/3；内外key不变；IME隐藏、focused=false、editable=false。 |
| 取消返回 | 全文和27..31保持。 | 同身份/key；IME隐藏、focused=false、editable=true。 |
| 再次打开并真实选择grid-large | 全文和27..31保持。 | 同身份/key；返回IME隐藏、focused=false、editable=true。 |
| 重开确认grid-large选中，Back及settled | 全文和27..31保持。 | 同身份/key，纸张页冻结/返回恢复可编辑，无额外实例更换。 |
| 真实追加 ` LOCAL07`，保存后Home/恢复 | Runtime完整JSON等于Rust完整note.document；光标45..45。 | 同身份及key；输入时IME可见/获焦，恢复后IME隐藏/未获焦。 |
| force-stop后启动 | Runtime完整JSON等于保存前Rust正文，bold Beta和LOCAL07保留，grid-large持久化。 | am start实际返回LaunchState:COLD；process session改变，key正确随新session变化，不声称跨进程对象相同。 |

纸张前真正NoteEditor key为 `d699e8fb-872e-4420-a7da-f24a513f65ad-73c2f706-b218-4d6c-8703-e5fece46812e-0-0`，内部EditorContent key `2520808682`。七个纸张边界均逐项比较完整identity对象、selection及document，结果见 `independent-checks.json`。选择grid-large后的PNG也明确显示Beta粗体高亮；不将截图外观当作原版像素通过。

脚本退出0，结果 `paper-native/result.json` 为有限pass；运行观察的WebView异常数组为空。冷启动新session为 `98f51700-e133-4ee3-b564-5d5b787c15f2`、进程5197，明确不同于纸张测试进程session。另在该冷进程只读调用Rust load_workspace，`cold-storage-check.json`确认完整Rust document等于保存前正文、paperStyle=grid-large，`paper-native/cold-saved-note.json`保留完整响应。

本轮新增的辅助pidof检查经adb shell sh -c包装不正确，run.log保留 `pidof: Needs 1 argument`；`cold-process.json`中pidAfterForceStop空值不作为无进程证明。原生force-stop动作、真实LaunchState:COLD和新access session独立支持冷启动事实，没有将无效空值当通过证据，也未为此重跑整个纸张矩阵。清理时首次Object.hasOwn在WebView91不支持，检查在删除前抛错；改用hasOwnProperty.call成功移除本轮观察标记，见observer-cleanup.json。此为观察工具适配，非产品异常。

## 开发原始证据的独立只读复核

`developer-runtime-evidence-review.json`保存对冻结开发原始状态的逐项比较，不能冒充本轮设备复跑：

- 七个开发纸张边界29..33、完整加粗document、Editor/View/DOM1/2/3和完整key均一致；键盘、冻结/恢复状态与开发selfcheck相符。
- 自身保存Runtime全文等于Rust正文，Home/恢复后身份及全文一致。
- 开发受控外部更新使用真实Rust register_save_intent/合法access/revision保存合成note，并非第二GUI窗口。原始保存响应revision+1、完整文档等预期；刷新前renderer仍是旧正文/旧实例，真实Home/恢复后新全文进入，Editor/View/DOM4/5/6，父key仅externalVersion0→1；cold Runtime与Rust全文均等包含外部段落的预期。支持真实文档变化仍会被接纳，未被语义相等修复吞掉。本轮未重复外部写入。
- 第一次Undo后的完整文档仍bold，历史done4/undone1；第二次Undo全文等加粗前文档，两次Redo后全文等bold文档。支持开发记录中的历史保留观察；第一步为何不改变正文仍unknown，不能宣称单击Undo与原Notes一致。本轮没有重跑或继续追踪此项。

## 结束状态与剩余范围

运行连接均关闭，tcp9227转发已移除，最终forward清单为空；window.__fix07Identity已删除。四设置逐项exactMatch=true，已装包仍匹配5dd6。模拟器前台session73263仍保持，Android交回root协调后续操作；本轮无Mac操作。报告和证据未主git add/commit，由root串行保存。

本次可关闭“candidate02原生grid-large不必要销毁编辑器/丢原选区”的有限实际复验门槛，并保留开发真实外部变化路径的证据审查结论。未重跑长停留IME、全部授权竞争、真实第二窗口同时编辑、实体手机、iOS或原版纸张像素；它们不继承本轮通过。FIX06历史组字事实、Undo单步未知和总体像素目标继续按各自任务管理。
