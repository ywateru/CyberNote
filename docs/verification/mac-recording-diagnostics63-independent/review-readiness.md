# 63 独立审查准备：尚未形成源码结论

日期：2026-11-05。审查代理：`/root/develop_app`。独立树 `/private/tmp/apple-notes-mac-recording-diagnostics63-independent-01`，准备基线 `951e5b1a85a07af4de86360745a5b21f45996ef7`。此时尚未收到63准确源码，未读取作者未提交代码，未运行测试、原生编译、GUI、设备、麦克风、音频、TCC或签名操作；原Android与Mac17均未触及。本文是审查准备，不是SOURCE-READY或真实授权结论。

已阅读本基线的任务63、recording-desktop63节、研究61、任务52及52最终独审，另读原生产native-recording-access、guest recordingAccess、Rust bridge与ObjC owner实现，以及52受控原生harness与异常/迟到补充。输入文件大小与SHA另列 `preparation-inputs.json`。研究61的外部契约仅按已有研究上下文理解，本次不新增真实系统查询。

随后按root指定导入范围澄清 `18467761f857a416000183b909a7ab7c636dc73b`，本独立树对应提交 `8dd5e4b`。新规则明确：原52及其他已封存证据保持原字节；若FFI适配需复用旧harness，只能复制到63新路径后修改。原13项首次准备指纹继续保留，新增澄清后的任务指纹单独列入输入记录，不抹去旧版本身份。

## 不可改变的基线

| 边界 | 基线规则 |
| --- | --- |
| 调用入口 | 只在明确Start走native AV预检；挂载、启动、呈现切换和诊断开关不新增status/request查询。 |
| 原生请求 | main/window有效性在先，pending busy在公开status查询之前；只有NotDetermined调用一次requestAccess。 |
| 交付与所有权 | finish只置delivered并至多回一次，不清pending、不释放系统block仍可能引用的context；真实completion或既有异常路径才清自身pending；dealloc最终释放context。 |
| 迟到与异常 | timeout、close、Rust receiver截止均不能释放仍被系统block引用的context；迟到completion不二次交付。52的ARC异常owner修复和Session媒体流所有权不回退。 |
| 截止 | native30秒，Rust原预检与成功后window复核各35秒，Session每阶段45秒。 |
| 信任 | caller窗口注入、精确recording-UUID/既有label规则、native window前后同身份、WK策略及窄capability保持。 |
| 错误 | timeout/busy/denied/restricted/unsettled各自保留；JS message供原UI展示，不能因诊断重写成denied或伪成功。 |

## 收到准确源码后逐项核对

1. 固定source SHA后核允许文件范围及所有保护文件；独立树只导入已提交源码，不读取作者可变目录作为通过依据。原52及其他封存证据必须逐字节保持，FFI适配只修改63目录内的副本。先阅读diff、helper与事件schema，再选择必要的生产类受控OS/假时钟验证；原生编译前与root协调串行及独占输出目录。
2. 开关必须是明确进程环境opt-in、默认off零诊断输出。有限事件预算覆盖进程内所有输出路径，并明确多层预算的总上限、竞争下计数、单次截断标记及预算耗尽后行为；不开文件、不联网、不无界排队。开关、预算耗尽、日志写失败或格式异常都不能改变API结果、截止或资源释放。
3. request ID只含进程内无内容标识，Rust与ObjC同一请求能对应；不借window label、标题、路径、音频、笔记或裸指针生成。stage/code为固定集合，status/Boolean/单调时间为最小标量；禁止任意错误对象、NSException原因、Debug内容或e.to_string被诊断序列化。
4. OS completion-entry在dispatch main之前发出，有可验证的后台回调先入/主队列尚未处理证据。该入口仅访问线程安全计数器、不可变ID和callback传入标量；不读AppKit、不查询AV status、不在后台读取main维护的nonatomic delivered/pending/window状态。main处理和pending清除是不同后续事件，不能在main内把同一位置重复命名为entry。
5. 所有诊断路径不增加status查询、系统请求、main dispatch或owner retain/release生命周期动作。对相同受控场景逐项比较开关off/on的reply/request/status/release次数与顺序；重点no-callback→timeout→busy、timeout后late、close后late、异常后escaped callback、重复callback、已授权/拒绝/受限及granted/status不一致。
6. Rust的FFI panic边界、callback context原所有权、receiver迟到释放、live gate、成功后window复核保持。取消/close/异常/timeout可从固定事件区别，但不通过新增清pending、自动retry或提早释放来让日志更漂亮。不能为发final日志把context使用延长到释放之后。
7. JS结构化原生错误code及可选stage/requestId安全保留，普通Error对象原样透传，未知错误仍用原明确失败message。明确默认off时是否返回安全stage/requestId；异常字段、getter或未知内容不能泄入诊断，timeout/busy保持原code和message。
8. 必要验证覆盖默认off零输出、并发预算/截断、callback-entry早于main、相同生命周期计数、结构化/普通/未知JS错误及受影响52回归。只复用真实生产类并替代OS边界，不发真实requestAccess/getUserMedia；typecheck/build与必要原生编译证据分别绑定准确源。受控通过不能写作真实授权、有效收音或像素通过。

当前准备阶段没有产品发现或阻塞判定。等待root提供冻结source及作者证据后才开始独立执行；真实采集结论继续ACTIVE-CAPTURE OPEN。
