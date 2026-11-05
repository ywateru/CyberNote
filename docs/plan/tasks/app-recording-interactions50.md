---
id: app-recording-interactions50
scope: independent desktop recording window, background capture, live card and shared transport
status: source-ready-runtime-pending
depends-on: [app-002-recording-preview-01, app-002-recording-submit-01]
---

## 用户目标与合同

用户2026-11-05明确要求完善基本录音交互，不做听写。遵循 `docs/ui/recording-desktop.md`、`docs/ui/recording-mobile.md` 与准备49；现有已授权保存边界继续保持。优先交付可运行行为，不扩大到录音文本、云同步、原版删除实验或新录屏工具权限。

## 实现

从当前d9ce9c4产品基线隔离worktree实施。开发者只改必要RecordingPanel、其CSS、recording-playback及新增局部waveform/临时卡模块；App仅允许显式平台/原编辑器目标、挂载布局和会话卡接线，必要Editor显示接缝可以加入。新临时卡不得成为schema持久节点或JSON mutation；无新数据库协议、依赖、锁文件、原生权限改动。不得改智能文件夹、键盘、侧栏或共享保存控制器。若确需扩张先报具体原因。

必须实现右侧非遮暗栏、桌面正文进行中卡、真实总时间/位置分离、pause后试听位置保持、真实绝对seek与拖动/键盘、±15、试听时禁继续、完成/安全关闭同一File/ACK与失败保留。手机保留三态布局并获相同transport修复。错误/忙碌不画正常假态；真实波形按活动时间保存并有界聚合，禁止随机音轨。可按既有生产Session/播放器接缝完成，不为视觉任务重写媒体采集。

## 验证与交付

开发与独立审查分人进行。作者typecheck/build与有意义组件集成检查：实际Panel+Session+播放controller，平台事件受控需说明。覆盖desktop/mobile布局、开始/暂停/试听暂停后位置、绝对seek/±15边界、试听禁继续、结束重播、继续累积、完成只一次、未录关闭/录制与暂停关闭保存、保存失败重试同File、迟到事件/卸载清理、原编辑器装饰不变JSON/history与错笔记不显示。复用既有媒体与父提交回归，禁止只核常量或mock组件。

独审通过后root整合并构建真实两端包；CUA核桌面、ADB保数据核手机，不读用户数据库、不导出本轮麦克风文件。实际编码/设备有声与工程受控分开记账；原版逐像素目标不得由headless截图宣布完成。

证据仅各自 `docs/verification/recording-interactions50/` 与 `docs/verification/recording-interactions50-independent/`，记录必要命令、结果及失败即可，不为本轮复制整套历史矩阵。不得清理旧输出或工作树。

## 最新用户纠正与替代实现范围（2026-11-05）

用户明确独立窗口/后台录音/同时工作，优先于上述最初“右侧栏”及不能编辑的保护方案。实现遵循`recording-desktop.md`最新章节：真实非模态录音WebviewWindow，label `recording-<标准小写UUID>`；主窗自由导航/编辑，源A稳定park与真实事务bookmark映射，专用原A当前可信保存边界，禁止泛化放宽普通附件校验。录音窗持采集/File，原owner窗持同一附件operation并等待真实A正文ACK，定向session RPC幂等回传；普通主窗关闭隐藏保活，整应用退出先统一安全收尾/保存。

扩张允许src/main.tsx、src/App.tsx、新recording-window/coordinator/transport与必要录音目标模块、src-tauri/capabilities专用权限、必要src-tauri/src/lib.rs只用于活跃录音窗时拦截ExitRequested并触发安全收尾，以及src-tauri/gen/schemas自动生成。若需小型process-owned会话registry可在已授权Rust内窄增但不得重写通用存储/Session授权、数据库schema或原附件journal。原用户数据/未命名测试note继续保留，52 plugin/Session路径不交叉。无下载/新依赖。

原生集成补充：访问屏障当前枚举所有WebviewWindow为正文参与者，新录音入口不运行App且无正文/保存队列。允许在lib的begin与finish两处同一参与者快照过滤中仅排除精确合法`recording-<标准小写UUID>`窗口；main/note-*及其他未知窗原有严格行为保持，不扩大Session权限或将录音窗冒充正文ACK。registry可独立于lib为src-tauri/src/recording_window.rs。源owner必须仍参与真实访问屏障，屏障导致源授权失效时录音提交失败保留File，不绕过屏障。

新增验收：真实两个窗口、子窗录音时主窗编辑A并切B（A/B输入与Undo保留）、切其他应用/失焦/最小化不主动停、完成只落A映射位置且B不抢焦点；主窗普通关闭后录音持续/恢复主窗、独立窗关闭保存、整体Quit等待所有录音ACK或失败保留；错误及迟到/错session/重发/回执丢失不重复附件或错note。headless可验证实际生产controller+coordinator/PM/App保存接线，不把假的窗口适配器当真实双窗证据；实包CUA为最终验收。保留已写transport/波形代码，撤下旧背景阻断/正文锁定方案，不再验证该旧方案。

## 最终源码接收（2026-11-05）

最终准确12e5cd2bfcb9dca75983a3c54f67d6f4a94c6cf0获不同作者SOURCE-READY；主线已合入完整产品链。首次relay重试、child失去后迟到真实ACK释放、Quit等待新输入与重复Quit绕过四项均保留首次失败并修复。退出首次await前的窄编辑屏障需要src/search-editor-gate.ts新增suspend/resume；仅整应用退出启用，普通后台录音继续可编辑。

主线20个50文件完全等于最终manifest，50+52 build/真实App38/preview19/实际组件12/子窗Owner6/Rust4顺序通过。见verification/recording-window54-main-integration/README.md及独审review-final.md。此为源码与受控边界接收；准确Mac15/Android09、真实后台采集和原版像素仍待按54运行，不标完整功能交付。
