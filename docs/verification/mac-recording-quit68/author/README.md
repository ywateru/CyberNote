# Mac菜单退出68：作者源码与受控验证

2026-11-05。产品 `a24082099a8208bc8da7ffeb9640dd20663fce46`，准确基线 `40cd170d`。状态为 **SOURCE-READY / MENU-CMDQ-RUNTIME-OPEN**。本报告不覆盖原Mac20的授权code7及CmdQ缺卡历史，也不把受控验证当作准确新包的OS运行结果。

## 生产漏接点与最小修复

Mac20使用 `SubmenuBuilder.quit()`。本库锁定muda0.20.0的macOS selector把预定义Quit直接映射为 `terminate:`；Tao0.37.2注册 `applicationWillTerminate:` 并发出结束事件，没有 `applicationShouldTerminate:` 拦截。应用自己的菜单回调没有Quit分支，只有Tauri RunEvent::ExitRequested接入录音退出守卫。因而66测试直接投递notes-recording-quit无法检查菜单到守卫的连接。确切锁文件/依赖文件路径、哈希及命中行保存于 `dependency-route-audit.json`；未执行NSApplication terminate。

唯一生产修改是src-tauri/src/lib.rs的自定义“退出备忘录”菜单项（CmdOrCtrl+Q）与菜单回调前置Quit分支。该分支在查找焦点窗口之前调用AppHandle.exit(0)，经Tauri的request_exit事件进入既有RunEvent::ExitRequested。已登记活动录音继续受原native local/legacy registry、全部正文seal、原A final、各正文flush、精确quit ACK守卫。没有修改App、Panel、Session、registry、访问/正文/附件门禁、权限、签名、应用标识、手机录音流程或依赖。无录音且registry全空时保持既有直接放行边界，不外推到纯正文退出增强。

本修复只涵盖自有菜单/CmdQ与既有程序化ExitRequested。Dock/AppleEvent直接终止另由69研究与实现；不承诺强杀或注销。UI规格同步记录这一边界。

## 基线反例与生产入口连接

`check-recording-quit68-native.py`从准确生产文件逐字提取app_menu声明、完整on_menu_event回调、完整RunEvent回调、Registry structs、所有本地录音/quit命令wrapper及其纯函数。唯一剥离的是Tauri command proc属性；序列化仍使用实际缓存serde/serde_json/uuid。每个原生产item有SHA256。Tauri应用/窗口/菜单构造、事件输送与退出最终效果使用无GUI facade，提供可观测结果；真实OS动作没有发送。非Quit的旧reveal_owner未执行，adapter不用于声称其行为。

`check-recording-quit68-app.mjs`挂载实际App/SearchEditorHost/NoteEditor、Gate、SaveQueue、DesktopRecordingPanel/Session/PCM、Revisions和bridge；仅增加观察访问器、受控native transport、内存后端和440Hz合成媒体。前端register/started/revision/release/seal/ACK通过本机HTTP→stdin实际进入同一个上述native进程；不手工塞Registry、不直接发送假的quit事件跳过菜单。菜单调用实际生产回调后进入提取的RunEvent回调，native事件再交给App真实注册的listener；只有Tauri/OS transport是替身。真实Tauri API连接另由完整cargo check及锁定依赖源码核对，不把facade当作OS事件实测。

基线native03绑定40cd170d；基线App使用未修改的同一App/Panel源码。最终基线结果保留于baseline-final02：capture前真实本地登记/started已经成功；A录音并停车、B编辑后，生产菜单仍选预定义terminate selector，ExitRequested请求数0、localCount1、无final提交/原A无卡。此为源绑定的入口反例；没有调用真实terminate去损坏音频。根任务Mac20真实退出后缺卡记录是独立运行证据。

候选native01在产品提交前编译，其lib.rs与recording_window.rs字节和已提交产品完全相同，见source-binding-a240.json。候选测试通过真实菜单回调的app.exit效果进入生产RunEvent和守卫；最终产品提交后的复验保存在candidate-final。starting-inputs记录当次HEAD和关键文件哈希；runner-used保存当次准确脚本。基线复验的工作树lib.rs已是候选，但所执行基线native二进制由准确旧lib.rs生成，绑定记录清楚区分两者，App/Panel没有任何产品改动。

## 验证结果

- 完整退出连接矩阵28项：A采集/停车、B编辑后菜单退出；无焦点；重复Quit与busy store；decode、store、持续final正文ACK、query、cleanup失败取消退出并重试；cleanup不重复已确认revision/store；准备期空取消及late不采集；登记回复丢失的精确恢复；B最新正文ACK等待；checkpoint在途后final顺序；真撤权拒绝store；native取消后的late final不重放旧quit；全部参与者seal、过期ACK拒绝及编辑恢复。最终结果candidate-final，pageerror=[]。
- 66实际App回归42项，包含两次累计完整WAV、唯一卡、A/B焦点与停车、×、main close、版本/owner/授权变化及保存故障。最终顺序运行sidebar66-regression02。
- 67媒体恢复25项，media67-regression02/result.json，pageErrors=[]，进程exit0；原读取门禁/三次预算与手机共享媒体行为保持。
- 原生66核心5项通过，native-regression/result.json；准确生产register/release/ACK函数及实际uuid，命令wrappers另由上述68入口矩阵执行。
- pnpm typecheck、pnpm build、完整cargo check --locked --offline均exit0；cargo原有13个warning保留。原生编译已与root串行协调，结束后明确释放共享slot。diff --check通过。

检查的source-manifest逐项把全部已跟踪src/src-tauri/plugins与根构建输入对照Git产品对象，只有src-tauri/src/lib.rs生产字节改变。测试脚本与规格另随产品提交。所有音频为本地振荡器合成，未访问/导出/复制/转写真实录音或笔记，未启动GUI/设备/模拟器，不触原手机13秒或旧Mac18。

## 首失败原件与受控范围

baseline-native/和baseline-native02/保留首两次harness编译失败（缓存serde依赖不匹配、adapter闭包类型/私有类型边界），native03修正后编译通过。baseline-app01首轮本地监听EPERM原输出保留于工具会话，execution-notes保存摘要；未完成产品反例，后续授权本机检查后完成。

candidate-app01/02首轮失败是保存故障注入只失败一次，真实SaveQueue随后确实成功确认并允许退出，测试错误地期待取消；将注入限定原A最终正文并持续阻断，解除故障后再菜单重试。候选产品未因此变化。candidate-app03完整20项通过；app04扩展到23项时撤权仅改前端、真实受控后端下一次同步仍授权，未准确模拟撤权；补成同时撤销后端授权后app05完整28项通过。app05脚本随后只格式化/加准确输入记录与有界测试清理，产品后最终复验另保留。

media67-regression/首轮25条业务断言均通过，但并行Vite websocket端口冲突产生pageErrors，因此明确失败并保留；baseline-app-final同一并行噪声失败。两条受控Node检查已输出结果但卡在清理，精确核对PID后仅终止这两条测试进程。改为顺序复验，未触真实Notes进程。所有vite-cache/及原生测试可执行文件保留本地、不加入Git或证据索引；非缓存失败原件逐项纳入evidence-manifest。

## 独立验收边界

不同作者须按已提交a2408209审查源码并复验，随后root与69分别独审结果整合。未构建本任务新安装包，不进行真实CmdQ/Dock尝试；准确Mac21实际保存/重开、真硬件音质与像素仍须root Computer Use后独立记账。原Mac20 K缺卡内部原因或孤立字节未取证，不声称恢复或永久字节删除。
