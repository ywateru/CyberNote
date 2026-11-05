# 52 最终固定源码独立审查：SOURCE-READY

准确版本：`f5bc101614dcc2c144f962b41620e70d4f8657b1`，包含原产品 `ef2fe7c3a3de7f8b7644d3ed50e0232a445b5af8`、Session修复 `e2903cc590fab18742ec26b1da586ba37c4a07f2`。独立固定工作树 `/private/tmp/apple-notes-mac-recording-access52-independent-02`，HEAD保持该版本，未修改产品。独占Rust target `/private/tmp/apple-notes-recording-access52-independent-target`，未与作者/50共享目标目录。

两个首轮阻塞均已关闭。原始失败harness逐字节复制到本树原样运行：最小媒体流交接取消复现stopped从0变为1，onRecording/error/recorder均0；14个微任务取消位置全部PASS，每个流的三轨均恰好停止一次。Session现在在原getStream兑现回调中建立轨道所有权，dispose可在prepare的回调交接前释放；后续分支不会重复登记已释放轨道。

recording_access.m单独作为新cc构建单元，只该单元启用-fobjc-arc-exceptions。原来在requestSystemAccess保存completion并抛异常后不释放的上下文，现在在相同独立harness中释放一次；晚到/重复completion不重复回包。NULL FFI参数、窗口无效、超时后重复completion及异常后completion，共4例全部PASS。生产ObjC按新flags编译无诊断，插件20测试和宿主check证明拆分构建/符号链接通过。

| 有限复验 | 结果 |
| --- | --- |
| 独立最小handoff | 1 PASS |
| 独立取消微任务cut | 14 PASS |
| 独立原生owner/FFI补充 | 4 PASS |
| 固定作者Session/preflight harness | 11 / 8 PASS |
| 原Session失败注入回归 | 26 PASS |
| 独立插件Rust | 20 PASS |
| TypeScript | PASS |
| 原生公开API对象编译 | PASS |
| Mac宿主locked/offline check | PASS，4项既有dead-code警告 |

作者harness来源固定证据提交941e3c9，不读取作者可变目录。首轮固定源码的ObjC14测试已通过；本轮原生实现未改变，只复验新编译flags与独立异常/迟到callback补充。没有扩大到全前端生产打包或任务50界面验收。

源码身份、窗口关闭和截止逻辑延续首轮有限审查结论：调用者注入Window与标签一致；recording仅精确小写canonical UUID；独立能力只授予麦克风命令。发起前和成功后比较实际NSWindow，ObjC弱window/view加NSApp成员身份和WillClose观察。native30秒、Rust每阶段35秒、Session每阶段45秒；Session取消后迟到授权不再getStream，迟到媒体流有统一轨道所有权与逐轨清理。等待系统真实回调前保持单pending和安全context，UI超时不会撤回系统提示。

原始首失败、对照和首轮报告仍保留在第一独立树 `/private/tmp/apple-notes-mac-recording-access52-independent-01/docs/verification/mac-recording-access52-independent/`，first-index SHA256 `a3eea9c8cd04bcd4c4bece0725a6d635e7c9793b00999ae4950381071ae75df1`，未覆盖。第一次创建第二worktree因共享.git目录写限制而未执行成功，授权工具升级后同一命令成功；记录见worktree-initial-error.txt。

本结论仅为task52准确源码链SOURCE-READY。未进行GUI、TCC、用户数据、真实系统授权、真实收音、后台录音或像素比对；任务50整合和准确新包实机验收仍由root后续完成。测试后13个产品文件逐字节等于固定提交，清单见input-close.json；原始日志与harness清单见index.json。
