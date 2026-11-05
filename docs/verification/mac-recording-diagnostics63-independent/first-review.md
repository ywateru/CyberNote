# 63 首轮独立静态审查：P2 BLOCKING

日期：2026-11-05。固定作者源码 `8d47e7791e549aed26f091676075de9930461b17`（产品与 `600efea487e492551eb03c9bc614f7ddfdc40378` 相同，仅新harness保证后台线程），独立树对应HEAD `a20d5de1df682c7ee8dbee1361d3381b881725b2`。只导入冻结提交；未读作者未提交实现。当前为静态首审，作者占用原生编译时段，本独审尚未运行ObjC/Cargo或真实GUI/权限/音频/设备操作。原Android和Mac17未触及。

## [P2] 同步诊断I/O可以改变授权截止和callback交付

位置：`plugins/tauri-plugin-notes-ui/src/recording_diagnostics.rs:97–118`，特别103的进程Mutex、108的stderr锁和110–115的同步写入。

开启 `NOTES_RECORDING_DIAGNOSTICS=1` 后，`Request::emit` 在调用线程同步获取OUTPUT Mutex、获取stderr锁并执行writeln。若stderr对应的pipe已满且没有读取者，或另一线程长期持stderr锁，emit会等待；事件预算256只限制总数量，不能限制锁或I/O等待。catch_unwind只处理panic，不能解除等待。

这些emit位于实际授权关键路径：

- ObjC `recording_access.m:162` 的OS completion-entry先同步调用Rust diagnostic，163才dispatch main；被阻塞时，即使OS已返回也无法将main completion入队。
- ObjC `finish` 在置delivered及回包之前记录事件；main线程被输出阻塞会推迟或阻止30秒截止交付。其他Rust main事件也在同一同步sink上。
- Rust `macos.rs:86` 在向receiver try_send结果之前emit；`103`在释放context之前emit。诊断输出阻塞可以改变回包、35秒等待及最终context释放时机，超出“只观测、不改变生命周期/截止”的合同。

该问题默认关闭时不触发，但on模式也是本项合同的一部分，不能用off零输出或正常消费stderr下的harness通过代替非干扰证明。无需真实麦克风请求即可从固定源码确定此阻塞依赖。本报告未把这一推导包装成已经运行的pipe饱和复现。

最小修复建议：producer仅提交固定小标量到单个进程有界队列，使用非等待try_send/try_lock，满队列或争用时有明确有界丢弃/截断策略；独立诊断writer负责stderr I/O。main、OS callback及FFI reply/release不做同步I/O或等待writer。保持原授权main/OS dispatch顺序、pending/context所有权、30/35/45秒截止不变，诊断worker不能持有授权owner或callback context。也可采用具有等效严格非等待保证的系统sink。

必要关闭证据：stderr无人读取/预饱和、writer锁住、队列满及多线程producer的受控检查；各producer均及时返回，授权reply/request/status/release计数与顺序相同，事件容量与截断有界。不允许为“通过”增加同步flush、join或扩大队列/等待预算。

## 其余已读边界与待执行范围

OS callback闭包先在main内将 `requestID` 和diagnostic函数指针复制到const局部，再由block按值捕获；后台entry只使用这两个标量与granted，不读取owner的nonatomic delivered/pending/window字段，也不访问AppKit。此部分静态结构符合线程边界，尚待独立受控后台callback验证。

原生timeout/close仍不清pending；late completion在main判断delivered后只清自己的pending；context仍在owner dealloc释放。旧FFI保留兼容wrapper，默认id0/callbackNULL，未见新增公开status查询表达式。源范围、JS错误字段、固定stage/ID与旧52封存身份将继续独立核查，不据这些初步读码结果授SOURCE-READY。

后续有限独立JS检查已实际执行：`check-js-independent.mjs` 对真实生产helper做TypeScript转译，仅替换isTauri/invoke及平台输入，50例全部PASS（`js-first/`，exit0）。覆盖11种原code与message保留、6个允许stage、u64最大ID/非法ID过滤、未知stage/未读私有字段、off wire无metadata、普通Error同一对象、未知错误原失败文案、非authorized结果失败及非Mac/Tauri gate不invoke。没有运行native或媒体。另静态固定15个保护文件与base相同，两个旧52封存目录相对准确source的Git diff为空，记录`source-scope-first.json`。这些通过不解除同步I/O阻断。

结论：**首轮准确8d47e77存在一个P2阻断；待修复后绑定新source复审。ACTIVE-CAPTURE OPEN与PIXEL-OPEN保持。** 本报告保留不被最终通过报告覆盖。
