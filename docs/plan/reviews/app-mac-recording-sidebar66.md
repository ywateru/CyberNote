---
id: app-mac-recording-sidebar66-review
status: blocked
source: 11c73a914deb6bb955fe88ec54ab70f8a5566a60
---

# Mac recording sidebar66 independent review

2026-11-05。冻结产品11c73a914deb6bb955fe88ec54ab70f8a5566a60独审结论：**BLOCKED，2项P1**。实现方已收到准确定位，独审没有修改生产代码。修复须以新的committed产品源重新绑定验证，本次基线证据保留，不得标成最终通过。

## P1-1 登记已提交但回复丢失，App丢失会话身份并留下永久本地守卫

定位：`src/App.tsx` openRecording约3213-3235；`src-tauri/src/recording_window.rs` register_local约119-168、may_exit及exit_requested。

App把新sessionId只放进首次invoke参数。native登记本身先写入local、used session/operation和incarnation，重复登记一概拒绝。若登记已经成功而IPC回复丢失，实际App catch立即将recordingTicket置null，既没有侧栏也没有能重取身份的重试入口。原生同owner登记仍在，后续新录音被拒；退出即使收齐所有document ACK，may_exit仍因local非空拒绝。无音频也没有前端可用的精确release身份。

独立实际挂载复现：`attempt06/result.json`第一项观察为ticket=false、locals=1、sheet=false。原生替身模拟“先登记成功、再丢响应”，不宣称此日志本身运行了Rust；原生register_local非幂等及退出local守卫另由冻结源码核实。现有准确生产Rust11项测试通过，但没有这一失回复情形。

修复应保留原session/operation与可恢复界面，只允许实际同owner、同incarnation、同一未完成session的精确幂等登记重取；明确无音频终态可精确取消。不能宽松清registry、放宽跨窗/陈旧身份或生成新session掩盖旧记录。

## P1-2 请求授权期间关闭，迟到授权后反而开始采集并保存录音

定位：`src/DesktopRecordingPanel.tsx` close约142-162，先await busy.current，再检查recordedAt并dispose；toggle的busy是实际DesktopRecordingSession.start；`src/desktop-recording-session.ts` start在授权返回后继续getStream/resume。

独立实际挂载进入requesting，授权Promise保持等待，用户点击侧栏×。200ms后ticket=true、release=0、streams=0、state=requesting。随后仅放行受控授权，生产Session开始取得stream并启动recorder，再final保存一张卡，最后release saved=true/revision1。观察明确为streams=1、starts=1、stops=1。用户关闭之前没有音频，关闭请求之后才开始采集，违反66“未开始可安全取消、释放迟到资源”。

修复应在尚无recordedAt时同步取消准备并关闭采集准入；晚到授权/stream须释放且不start、不造附件，close也不能被预期取消异常永久卡住。有真实已开始音频的分支仍须final保存，不得复用无音频dispose。

## 已通过的独立边界

`attempt06/result.json`九组中七组通过，两组准确产品阻断失败；pageerror为空。全部从实际App挂载进入，生产SearchEditorHost、NoteEditor/TipTap、SearchEditorGate、useEditorCommit、SaveQueue、DesktopRecordingPanel、DesktopRecordingSession、RecordingRevisions及bridge均参与。只在App最终return前插入调试访问器，未复制或改写保存、关闭或退出算法。

- 首次暂停及第二次累计checkpoint，A真实Editor在B显示后停车，A和ticket身份保持同一；一个stream、两个分段、两个store，A保留用户追加文字、B正常编辑，A保持不可写，累计只剩一张附件卡，全部query committed。
- final正文已确认而native cleanup失败，保留右栏；重试仅再cleanup，store/native revision/body action计数均不增加。
- checkpoint store在途时重复close返回同一Promise，等待checkpoint、追加final、cleanup完成后才移除会话。
- 主窗close查询失败不destroy，恢复合法A编辑；第二次close准确final/cleanup/flush后destroy，不执行浮窗或hide。
- quit在final store等待期间收到cancelled，放行迟到保存后不发过期success ACK。
- 正文Escape保持录音，侧栏焦点Escape执行final关闭；真撤权令原A invalidated、拒绝store并保留录音，不转存B。

冻结生产`cargo test recording_window::tests`11/11通过，原始stdout保留。独立pnpm typecheck exit0。未经真实Tauri启动、实际麦克风、设备、GUI、包身份或像素验收。

## 尝试与限制

attempt01运行前缺独审树node_modules引用，Node加载typescript失败，尚未执行产品。attempt02虚拟App入口未改写assets相对路径，九组导航超时。attempt03修路径后因独审窗口替身缺onFocusChanged而失败，已终止该轮；无完整result，已有runner/input/stdout保留。attempt04单项再次定位同一缺接口。attempt05补接口后两项产品阻断复现、六组通过，busy case独审选择器同时命中live卡和侧栏按钮。attempt06只将录音按钮限定侧栏并增加失败观察，最终形成七通过/两阻断。所有尝试runner及输入指纹原样保留，缓存保留本地但不加入索引或Git。

原生IPC、持久宿主、授权、MediaStream、MediaRecorder、解码和回放为受控替身；DesktopSession和PCM仍为生产逻辑。平台boundary设Linux以不挂原生mac toolbar，但桌面native路径为true；因此不验证mac toolbar。无原版数据访问、真实音频复制/导出/转写、Mac18或手机现场操作。未新增旧浮动/停靠双模式矩阵。

Panel scoped Escape未查defaultPrevented的静态候选已检查：当前右栏无presentation菜单，未发现实际内侧取消菜单的生产入口，本轮不列独立阻断；后续修复若新增右栏可取消控件，应补覆盖。
