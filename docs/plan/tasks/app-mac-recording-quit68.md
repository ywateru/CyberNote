---
id: app-mac-recording-quit68
scope: native-quit-real-sidebar-save-boundary
status: in-progress
depends-on: []
---

# objective

修复Mac20真实录制中切到另一篇编辑后CmdQ重开原笔记无录音卡的阻断。保持统一右侧栏，正常退出必须等待原录音final与所有正文持久确认；失败取消退出并保留可重试会话。先定位生产调用链并受控重现，再最小修复，不用假registry/假退出替代实际连接。

# context

- docs/verification/mac-recording-media67-runtime/README.md
- docs/ui/recording-desktop.md
- docs/architecture.md
- docs/plan/tasks/app-mac-recording-sidebar66.md（既有合同6/7）
- docs/plan/reviews/app-mac-recording-sidebar66-followup.md

# path

src/App.tsx、src/DesktopRecordingPanel.tsx及必要录音lifecycle；src-tauri/src/lib.rs、src-tauri/src/recording_window.rs和实际macOS菜单/退出边界；必要focused scripts与docs/verification/mac-recording-quit68。禁止修改权限、签名、标识、存储访问门禁或手机录音流程。

# contract

1. 既有66合同继续有效：原A归属、单可见卡，暂停checkpoint、×/Done final、主窗close、Quit seal+final+flush+准确ACK；不得移除门禁或乐观ACK。
2. 真实macOS CmdQ/菜单Quit/ExitRequested/窗口销毁链必须参与，而不只是抽取registry helper。对主App原A录制、切B编辑、原A停车后退出，等待准确会话累计音频/原正文确认和B最新正文完成后才准退出；显式失败保留窗口及原音频/重试。
3. 取消、过期ID、重复quit、cleanup失败、登记回复丢失、在准备期退出、真正撤权不得跳过保存或重新启动采集。native callback/主线程不得死锁。不得因旧child为空放行本地会话。
4. 67媒体有界读取恢复保持。只允许修复实际明确证据支持的连接；不能为超时或缺证据而放宽权限/生命周期或加固定sleep。
5. 手机原13秒现场完全不动；不重开旧18，不复制/导出/转写真实音频，不删除原版数据。Mac GUI由root用Computer Use单独执行；子任务仅源码/受控边界。

# verification

- 准确Mac20基线受控重现：实际App + native生产退出入口连接（尽量含菜单/ExitRequested策略），不能仅手工构造已登记registry并假定所有入口都进来。记录真实漏接点、trace与修改前fail/修改后pass。
- 采集中A→B编辑→Quit等待final/所有正文；requesting无音频取消、busy save、decode/store/save ACK/flush/cleanup失败取消退出且可重试；late/duplicate/stale ACK与取消恢复。
- 回归暂停两次累计、同挂载×、main close及67media加载；typecheck/build、native必要测试。不同作者独立review committed精确源后整合，再准确新包root实际复验。
- 没有实际新包GUI前，不把源码结论记为运行成功；保留20 CmdQ失败和授权首次超时历史。

# progress

2026-11-05：产品a24082099a8208bc8da7ffeb9640dd20663fce46从准确40cd170d冻结，仅lib.rs生产菜单/CmdQ改为自定义退出项、焦点查找前AppHandle.exit进入既有ExitRequested守卫。源码提取的真实menu/run回调及全部本地登记/quit命令wrapper与实际App/Panel/Session受控连接，基线入口反例3项、候选28项、66回归42项、67媒体25项、native5组均通过；typecheck/build/full cargo check通过。准确清单与首失败原件见docs/verification/mac-recording-quit68/author/。本阶段SOURCE-READY、独立review和新包实际验收待完成；Dock/AppleEvent入口另由69处理，不追认Mac20运行成功。
