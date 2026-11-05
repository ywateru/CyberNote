# Mac 授权诊断63：独立复审通过（限源码及受控边界）

日期：2026-11-05。复审准确产品源 `78f9f9d896e8c5d75311f3202484ff119f57369c`，独立树产品提交 `2a83aa3c`。作者证据 `acdaa3957b50ba4ada1060d184608f62191ca8bf`、追加原日志 `068f341c2e20bde6c5d6c1fef19be6377239426a` 已按顺序导入。独审仅写本目录，不修改产品。九个产品/检查输入均与冻结源逐字节一致，52个作者证据文件均与冻结证据一致，见 `final-inputs.json`。

**结论：PASS / SOURCE-READY-DIAGNOSTICS-ONLY。首轮同步stderr的P2阻断在准确78f9源关闭。** 没有剩余阻断发现。本结论不代表实际麦克风授权修复、真实根因确认、有效收音、原Android现场操作或像素验收；ACTIVE-CAPTURE OPEN、PIXEL-OPEN维持。

## 首轮发现及修复核实

`first-review.md`、`first-inputs.json`、`js-first/`原样保留：准确8d47源在main、OS callback entry、FFI reply/release同步获取stderr锁并写入，足以改变回调派发、30秒finish及context释放。此前正常输出下的通过不能关闭该问题。

78f9把格式化与stderr I/O全部放在单个专用writer。生产emit只处理固定标量、原子预算、`OnceLock::get`和64槽`try_send`；main、OS callback、FFI reply/release不调用get_or_init、spawn、阻塞send、stderr、flush或join。队列最多64个Event，writer最多另持一个Event；writer仅捕获Receiver，Event不含owner、context、指针、窗口、内容或任意错误对象。每进程最多256次事件尝试进入队列，满/断开丢弃与超预算各有原子计数；writer排空并发现丢弃后最多输出一个截断快照，之后不再输出事件。快照只描述当时丢弃，不能保证包含未来事件；进程退出不flush/join，阻塞或失败sink可能没有可见输出，不能据此推断系统callback未发生。

首次 `Request::new` 的开关采样、EPOCH、队列与线程初始化可以在同一异步命令初次/并发调用间等待；它位于现有异步Rust命令路径、`app.run_on_main_thread`之前，不在AppKit、OS callback或FFI emit中。核对锁定依赖本地原始源码：tauri-macros 2.7.4 `body_async` 把函数放进async future，tauri 2.12.5 `respond_async_serialized_inner`经`async_runtime::spawn`运行该future。没有新增启动/挂载初始化或status查询。该判断约束于本产品的现有IPC调用链，不把公共库任意外部直接调用视作已测。

writer启动失败时SENDER保存None，后续emit丢弃且不回退同步输出；写入错误被writer忽略，不能改变授权结果或context所有权。安全错误stage/requestId只由Request ID及固定stage生成，既不等待writer，也不以成功入队/成功写入为条件。默认关闭时id0、callbackNone、emit立即返回，不创建诊断线程或输出。

## 独立实际检查

`check-sink-independent.rs`直接导入生产Rust helper，只用合成Error和事件；`run-native-independent.py`记录实际命令与所有输出。没有Tauri/媒体运行时、GUI或设备。

| 检查 | 实际结果 |
| --- | --- |
| 环境开关不存在、0、true | exit0，stderr严格零字节 |
| 精确1正常事件 | exit0，仅一个固定schema事件 |
| 另一线程占住真实stderr锁，4线程提交10,000事件 | producer全部在1秒门槛内返回；解锁后一次截断；written+queue_dropped=256、budget_dropped=9744；安全metadata不变 |
| 先逐次排空255事件，再提交10次 | 256事件+单marker，queue_dropped=0、budget_dropped=9，覆盖稍后才耗尽预算 |
| 真实65536字节预满pipe，执行期间无reader | 10,000 producer完成并正常退出；不join等待writer；安全metadata不变 |
| pipe读端先关闭，writer发生EPIPE | 10,000 producer及metadata检查正常退出；没有输出成功依赖 |
| 真实生产ObjC类，旧52假OS边界，诊断off/on | 各17例、69次query/request/reply/release完整同序、134诊断事件；后台entry先于main处理 |
| 真实生产Rust sink静态库接同ObjC类，pipe无人读取 | 子进程自行填满65536字节；10,000 producer 0.260ms；同17×2例/69同序通过 |
| 明确worker退出边界的独立补证 | 测试worker改pthread、线程内autoreleasepool、pthread_join；同17×2/69/134通过，含异常后escaped callback最终只释放一次 |
| 真实JS helper独立错误检查 | `js-refinal/` 50例PASS，exit0；仅平台/isTauri/invoke为合成输入 |
| pnpm typecheck / pnpm build | exit0；原有Vite大chunk提示保留，见`frontend-refinal/` |

JS覆盖11种原code/message、六个允许stage、最大u64 ID与非法ID、未知stage及不读取私有字段、off无metadata、普通Error对象身份、未知错误原文案、非authorized结果失败和非Mac/Tauri gate不调用。源JS与首轮相同，仍对准确78f9重新运行并另存。

## 独立编译首失败及明确修正

`native-refinal/compile-results.json`和`native-refinal/execution.json`保留首轮独立命令：我漏了已有生产`build.rs`要求的`-fobjc-arc-exceptions`，只传ARC/blocks，原生suite在`escaped.releases==1`失败(exit -6)。该失败没有被覆盖或包装为产品通过。此前所有sink检查已完成并独立保留。

固定生产`plugins/tauri-plugin-notes-ui/build.rs`对`recording_access.m`明确使用`-fobjc-arc -fobjc-arc-exceptions -fblocks -mmacosx-version-min=12.0`，其文件与准备base字节一致。`native-correct-flags/`只补回上述生产flags，仍默认O0、不加-O、不改产品和suite断言，然后普通suite及真实sink满pipe suite均通过。作者冻结`objc-diagnostics-compile.log`也使用这些flags。

此外，原harness的dispatch_async在signal之后不保证worker捕获block已销毁，固定5×1ms runloop不是worker释放边界。为避免把时序偶然通过当最终释放证据，`check-native63-joined.m`是新独立副本，仅替换测试worker为pthread、线程内autoreleasepool和pthread_join，生产类/假OS/断言保持；`native-worker-joined/`记录该边界下异常逃逸callback、重复late、timeout/close等的最终释放全通过。该补证不依赖调高等待时间或改优化。

## 静态生命周期、范围与作者记录

OS block在main上捕获const request ID和函数指针；后台entry只传这些标量及granted，不读nonatomic owner状态或AppKit。实际owner由原main-completion block保有。pending busy仍先于status；只NotDetermined请求权限；finish只回包一次、不清pending、不释放context；真实completion或既有异常路径清自身pending；dealloc最终释放。30秒native、35+35秒Rust和Session45秒未变。没有扩大窗口白名单、权限能力、WK策略或实际window校验边界。

15个保护产品文件（Session、Panel/Dock/View、coordinator/transport、UI/CSS、媒体策略、能力、Info、build.rs及两锁文件）相对准备base `951e5b1a85a07af4de86360745a5b21f45996ef7`完全相同；两个旧52证据目录相对准确源Git diff为空。新测试仅写本任务新目录，未改封存52。

核读作者冻结证据：当前native、off/on、饱和/满pipe和Cargo命令exit0；plugin22测试、app Rust check通过；旧52原14+4例及前端/Session等回归记录保留。作者最初dispatch_sync worker保证失败、8d47正常输出通过和后续同步I/O发现均按阶段保留。这些作者结果是补充记录，独立结论依据上述自己的实跑与静态检查，不把作者pass当独审。

所有native工作经root串行授权，独立二进制/静态库在私有`/private/tmp/notes-diagnostics63-independent-bin`；未使用作者Cargo target，无依赖下载。编译阶段已结束并向root明确释放slot。未操作Mac17、原Android、真实麦克风/TCC/签名/媒体/笔记。`index.json`为本目录文件字节与SHA256索引；不包含其自身。
