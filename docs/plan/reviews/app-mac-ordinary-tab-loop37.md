# 普通 Mac 新建文件夹 Tab 循环37：不同作者独立审查

2026-11-05，verify_app。**PASS，SOURCE-READY，READY STOP，仅最终源码及有限受控机制范围。** 本范围未发现阻塞项。普通Tab的实际差异仍须准确新Mac包Computer Use关闭；本审查不授实际Mac、系统策略true、Option-Tab插入、完整交互或像素通过。

## 最终来源与封存

唯一审查目录`/private/tmp/apple-notes-ordinary-tab-loop37-01`。固定HEAD`6e247ca20a8f29b1bd8358c3ffcce7c046bdb6c3`仅作者证据，最终产品`1a5422fbc089b354b91e3d6b1db64b5e6ec9a2a9`，其父为初次产品`d3e467b2960075e2cb2749757de488c8cbd18ad1`，基线`26648d88021adf3abdcfdfe879453a3b36866613`。本轮只读Git对象/差异/路径命令，没有Git写入。307条当前产品文件逐条计算Git blob SHA-1并匹配最终提交树，大小与SHA256匹配作者完整清单；完整产品聚合`5760f57413d117104dd2fdf3d07fffc0d41578b8d41e58a4a8c6dbefb68855f2`。

基线至最终产品恰13路径，聚合`db33ed6cdb17b7cc144a1d4681f286a622231f04e75fa0e78e9a7528e0d37b27`，作者source.patch逐字节等于实际base→final差异。最终纠正仅删除attach中的closed拒绝一行，query保留closed检查。作者69成员索引SHA256`7dde37e673400a0c25d0d45709842001e4bde45af2f32526b44257f7b178d16c`、result SHA256`b2c5ccefd9e128bbf44adf35ef12bd353cea947816a1d5e38373df73ee280637`与各成员全部重核；11个未进Git的HTML/大结果/原生二进制按local-artifacts逐项匹配。所有声明的失败路径保留。

package.json、pnpm及Cargo锁、插件Cargo.toml、宿主Cargo/capability、style.css及smart-folders.css逐字节等于基线。变更限于生产表单接线、两个前端辅助源、插件guest/Rust/C入口、命令权限及生成reference/schema、构建命令清单与插件README；无宿主能力范围扩大、依赖或样式改动。task37独立输出不修改作者目录或产品。

## 生产接线、权限与原生身份

SmartFolderForm通过nativeMainKeyboardAvailable门槛，限定Tauri、Mac平台且非移动UA、当前window label为main，并同时要求非mobile、非folder编辑、draft.smart=false、非busy。使用layout effect拥有局部控制器，模式/忙碌变化和卸载dispose。只在form现有DOM附ref与keydown委派；document/window监听用于取消旧意图，不在window吞Tab。普通Enter/Escape、输入/保存流程保持原接缝。

生产native-keyboard再次校验可用性并严格接受boolean；guest固定调用`plugin:notes-ui|keyboard_navigation`且只传当前windowLabel，不依赖工具栏binding。命令进入tauri generate_handler、插件build列表、default allow与生成权限文件/schema/reference，现有Mac capability继续限定main/note-*。Rust命令使用Tauri注入的调用方Window做own_window比较，随后NotesUi方法强制main；独立窗即使传自身label仍拒绝，伪造main参数不能跨窗。

macos.rs沿现有on_main回主线程，在执行时重新get_webview_window(label)，取得调用方及当前登记窗口的NSWindow并核指针；缺窗、原生句柄错误、身份变化和调度/任务失败均明确错误。原生C入口先主线程，再校验输出指针、NSApp、NSWindow类型、系统登记及closed记录，最后直接读取公开`NSApp.isFullKeyboardAccessEnabled`。只接受native输出0/1，未写系统或WKPreferences，没有默认false、绑定表或modal-open缓存。

作者隐藏Wry探针确实include精确生产插件source，Builder<Wry>、真实hidden/unfocused主窗和独立窗、生产init、生产command函数及实际主线程/native getter；空Context/assets使用test helper。封存5项成功日志包含actual false、外label/独立窗拒绝、destroy后旧Window报window_closed。**这是直接Rust生产函数调用，未穿过WebKit→IPC权限roundtrip；前端一半是受控transport，不能拼称一次完整IPC端到端运行。** 本次不重复构建整个Rust依赖矩阵；对真实链来源、源码和日志复核，另用独立C检查原生边界。

## 导航与异步失效

局部表单只接收未defaultPrevented、非Alt/Ctrl/Meta、非isComposing、target在表单内的Tab，Shift仅决定方向。同步preventDefault发生在IPC await之前，避免旧原生默认已经离开表单。有效队列串行，始终最多一个查询在途；每个仍有效导航重新读取，当次false只回名称并select，true从当前DOM读取可用/可见控件正反循环。真实开启态原版顺序尚未见，true仅是任务规定的可访问性契约。

generation、expectedFocus、active状态、form连接、document可见及hasFocus共同约束回复；pointerdown、其它key、beforeinput、compositionstart、外部focus、visibility、window blur/pagehide清空旧队列。Shift准备反向而不取消；旧代回复/拒绝不夺焦点或报旧错误，新代可在旧查询settle后继续独立读取。false下同一已聚焦名称也select。查询形状/错误、无可用目标或focus失败走通用role=alert，保留草稿，不调用保存。busyRef在同步busy阶段也挡住有效性检查。

## 独立有限执行

[focussed证据目录](../../verification/mac-ordinary-tab-loop37-independent/README.md)保存独立脚本与完整输出。生产SmartFolderForm、完整CSS、native-keyboard和真实guest均实际打入本目录HTML，只受控IPC返回、系统值、保存回调及正常React父状态。真实headless Chromium键盘/DOM运行12项新检查，零page errors和网络请求：

- await过程中checkbox变inert，回复时按当下可见可用集合跳至取消；未用旧DOM候选。
- 旧请求待决，ArrowLeft使其失效，新ShiftTab排队；旧reject静默，新代才查询并按新false全选。
- 同一JS任务内由普通React父setState取消，再resolve旧true；表单关闭且未被迟到回复复活。
- 后续子节点defaultPrevented的Tab使旧请求失效，保留指定部分选择；document.hasFocus直接变false而无blur事件时，回复也静默放弃。
- 目标focus不可达时显示通用错误、名称保持、零保存；外部focus一次取消在途及尚未发出的队列。
- 相邻导航分别true→false，确认每次查询；最后核生产guest只发固定命令及own main label。

这些是受控Chromium/React边界，不是WK/AppKit焦点、真实IME、用户鼠标或OS窗口激活验收。作者52项更宽组件日志覆盖平台/模式、组字修饰及Enter/Escape等，已封存复核，本次没有重复整套52。

另以严格`-Wall -Wextra -Werror`编译直接include最终keyboard.m的自有小程序，11项独立原生检查通过：真实公开getter当时false，两个真实不显示窗口逐次重读；observer/table复用；实际closed弱集合不保留临时NSObject sentinel；进程内getter异常返回5且输出/WK/monitor不变；closed A查询拒绝而B不受影响；合成WillClose后旧35 attach仍成功，但query仍拒绝A；policy清理及off-main输出边界正确。无可见/key窗口、页面URL或数据后端。关闭通知与getter异常为明确本进程受控输入；sentinel只验证集合弱所有权，不把AppKit是否继续持有实际NSWindow当成helper的释放保证。

## closed记录所有权与35兼容

一个静态observer token是明确的**进程生命周期**资源，首次query或WK策略attach启动，之后重复查询不新增token；NSNotificationCenter的block只引用全局弱表，不捕获具体window。弱表仅记录本进程NSWindow close对象，不持有窗口。控制器清理继续只释放各自monitor/三通知及策略表；不释放进程级close observer，以便后续query/main重建仍能识别迟到关闭。该资源常量与按窗口弱记录不同于每次表单泄漏。

观察器启动前已发生的关闭不能由弱表追溯，生产Rust当前窗口/NSWindow身份检查承担此前已destroy或label复用边界；原生query也检查NSApp登记。不宣称独立C helper能追溯任意启动前关闭。本轮有current-source真实Wry author闭窗证据及本次closed A/B隔离检查，但没有扩大到实际新包多窗竞态矩阵。

初次d3候选把closed拒绝带入35 attach，作者旧27项探针发现合成WillClose后的重attach回归。root通知后独审立即暂停，未运行旧源测试或授通过，stage01-superseded.json保留。最终1a恰删除该行；本次独立原生测试同时证明“attach允许而query拒绝”，作者旧35回归27项、最终Rust17及新C13均复核通过。未通过改旧fixture或清除closed表掩盖矛盾。

## 失败保留、保护与结论边界

独立原生夹具首轮读取deprecated GC弱屏障属性，被严格编译拒绝。原source和编译诊断保留为native-selected-attempt01.m/native-compile-attempt01.json；最终改用临时对象的实际弱集合存活检查，没有放宽-Werror或改产品。最终严格编译无诊断，运行保留IOPM/LaunchServices环境提示。headless检查按已有授权在离线窄范围执行，无需重试；所有输出均本目录。作者原来的组件、原生、harness、系统服务及35回归失败都按封存日志复核，没有把最终成功覆盖不利记录。

独立verification-result.json为448项身份/范围/接线/证据检查通过，另保存12组件及11原生的完整独立断言与命令。392项保护输入初末大小/hash/mtime保持，包含307产品、作者69及本地大产物、必要依赖/任务设计；只新增独立目录与本报告。没有产品/Git写入、锁变化、GUI、ADB、数据库、下载、正式打包或共享Rust target操作，复用依赖只读，自有headless临时profile与原生输出均有界。

**SOURCE-READY，READY STOP。** 后续准确来源Mac包须实际验证普通Tab/ShiftTab/Right后Tab、失效边界、Enter/Escape、原生搜索及既有功能；不能由源码检查关闭runtime36已见差异。真正系统开关/true原版顺序、真实IME、OptionTab字面插入及整体像素继续开放。Android08仍是旧源包，本任务未构建或验收含37的新Android包。
