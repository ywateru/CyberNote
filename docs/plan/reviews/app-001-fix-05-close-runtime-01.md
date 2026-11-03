# APP-001 FIX05 独立有限实际关闭与冷启动复验

日期：2026-11-03。结论：保全候选 `ec1cf0d…` 的三条约定关闭入口在本轮独立实际运行中通过：独立正文 Cmd+W、实际文件菜单关闭、主窗口原生搜索获焦 Cmd+W，均关闭正确目标并保留另一应用窗口和同一进程。一次合成笔记编辑后关闭/冷启动，完整正文与存储记录保持一致。此结论仅覆盖下述路径；不代表顶部像素、搜索几何、全部窗口生命周期或全应用验收通过。

## 固定包与设备交接

native 明确退出其诊断进程并交出 Mac 后，本轮显式通过 CUA 启动 `/private/tmp/notes-close-deferred-ec1cf0d.app`；独立读取可执行文件为 15,534,336 bytes，SHA256 `ec1cf0d829b03f4b234d982c3d28af22ba401cf1549d47e6cba2baf7f4efb61e`，匹配先前静态报告核对的候选身份。首进程 PID99538，冷启动 PID2330。没有启动主 target 新包，没有重构建。该保全包早于 FIX07/FIX07b 和搜索编辑几何 `67ce948`；后者不能使用本轮结果追认。

证据目录：`docs/verification/qa-fix-05/run-ec1cf0d/`。实际 UI 动作均使用 CUA；前后 AX/PNG 通过 CUA 原生观察保存。窗口 ID、bounds、onScreen、PID 由已有只读 `/private/tmp/notes-ui-window-state` 收集；工具输出包含原 Notes 的只读窗口清单，但本轮没有操作其任何笔记或窗口。数据库只读查询严格限克隆合成 note `114f5086-163d-473c-8ec3-fc47e7506573`。

一次 REA observe_native_ui 读观察失败，最终返回 accessibility-denied；没有修改系统权限、重复等待或以该失败替代 UI 结论。之后使用已可用的 CUA 与窗口清单完成检查。结束已 close REA target。

## 三条实际关闭入口

| 实际入口 | 关闭前事实 | 关闭后事实 | 判定 |
| --- | --- | --- | --- |
| 独立正文 Cmd+W | CUA AX 明确焦点为“备忘录正文”；独立窗口67441，主窗口67321，PID99538。 | 67441 从 CG 清单消失；67321 仍 onScreen，PID99538 存活；CUA 回到主画廊。 | 本路径通过。 |
| 文件 → 关闭窗口 | 重开独立窗口67467；保存菜单 AX，真实条目“关闭窗口”，ID performClose:。 | 实际点击该条目后67467消失，67321仍 onScreen且PID99538存活；CUA回到主画廊。 | 本路径通过。 |
| 主窗原生搜索获焦 Cmd+W | 通过真实窗口菜单切到主窗；CUA AX焦点明确为原生“搜索备忘录”；主67321和独立67527均 onScreen。 | 67321从清单消失；67527仍 onScreen且PID99538存活；CUA回到同一独立 note URL。 | 本路径通过。 |

每条对应 `cmdw-body-*`、`file-close-*`、`search-cmdw-*` 原始前后 AX/PNG/windows.json。主窗存在一个500×500、onScreen=null的辅助窗口67332，不把它算作保留可见正文；以上判断使用明确 onScreen=true 的主窗/独立窗。本轮没有采集应用 stdout/stderr，因此不以“空日志”证明无崩溃；同PID及正确可见窗口保留支持这三次有限结论。

## 一次真实编辑、关闭与冷启动

在第三条保留下来的独立合成 QA FIX02 note 中，读取完整原存储记录（revision50），真实点击正文，移动到文末并粘贴三段合成文本：`QA FIX05 EC1 CLOSE 20261103`、`保存核对：Alpha 123 — 完整正文`、`END-EC1-99538`。保存 `edit-close-before.ax.txt/.png`，显示原 heading（ABC italic）和全部新增三段。随后实际 Cmd+W 关闭此时最后一个可见笔记窗口。

CUA 后续读状态返回 App quit；只读 CG 清单无 clone，`ps -p 99538` 返回空且退出1，证明该进程已不在。未捕获系统退出原因或该进程 stderr/exit code，故不能据此额外宣称末窗退出正常、无 panic。当前三条门槛都在另一窗口存活时已独立通过，第四条仅验收已观察的内容保全结果。

显式重新启动同一保全包，新PID2330，真实打开同一note。冷启动AX/PNG显示完整正文；数据库只读记录为revision51。`edit-expected.document.json` 由保存的原JSON保留第一heading及其marks、将原空段落替换为实际新增三段构成；完整结构比较结果 `cold-equality.json`：

- 关闭后完整document等于预期：true。
- 冷启动后完整document等于预期：true。
- 关闭后与冷启动后完整存储note（含document、metadata、revision）相等：true。
- revision 50 → 51 → 51。

对应原始数据 `edit-before.storage.json`、`edit-close-after.storage.json`、`cold-reopen.storage.json`，并非仅比较标题、截屏文字或子串。没有直接写数据库、修改运行时状态、注入 destroy 或替换保存响应。

粘贴、采集AX/PNG、Cmd+W顺序间存在实际工具耗时，本轮未在关闭瞬间读取 pendingDocs，也未证明该时点还有未完成的保存。因此“pending guard 动态通过”仍 unknown；保存失败/冲突、marked IME、全部关闭矩阵未在本轮运行。不为补齐这些未知重新制造证明场景。

## 结束状态与剩余门槛

冷启动内容核对后真实 Cmd+Q 退出PID2330；`released.windows.json` 中无 clone，`ps -p 2330` 返回空/退出1。Mac已明确交回native进行其新搜索候选实际检查。Android未在本轮操作。本轮只写独立报告和证据，未主工作树 git add/commit；由root串行保存。

可将先前“独立实际三条关闭尚待执行”的状态更新为本报告有限通过；已知顶部视觉差异、搜索交互/几何和其他未运行路径继续按各自任务管理，不能将此结果扩大为与原 Notes 完全一致。
