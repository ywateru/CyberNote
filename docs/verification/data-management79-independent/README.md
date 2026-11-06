# 数据管理79 独立验证

2026-11-06，独立角色，仅使用全新合成数据。最终状态 **PASS / SOURCE-READY**；最终准确runner新33自然exit0/19.71s，95输入前后不变、pageErrors空、零源码blocking。完整审查、两项P1及修复解释见[审查报告](../../plan/reviews/app-data-management79-static.md)。原143失败保持失败，后续不同轮自然通过单独保留。

## 来源与边界

后端产品`e9635f3a`、自身provider保护`2420faa8`、测试`d74d76f4`；前端`490b2e92`、正常quiet并发`4d744ca5`、结构错误`b980b248`；最后安全cover修复`1e16c9fe`。最终runner`ad982ee8`（含1833bb53断言适配及测试React双入口预构建）。候选树由根创建：`/private/tmp/apple-notes-data79-integration`，最终candidate HEAD `f038e998d044f41042336f9eb526c7cb30c251ec`。最终95输入SHA256 `84791745404687c6de66f83383f9519ebbb4028280df326a659c6557730726d1`，before/after一致且clean，完整身份final-source.json。

编译临时transport为独立bin，准确复制候选Store/Session模块，公共transport只在私有副本加入真实Session.finish的原始事件返回分支；没有修改生产源码、公共runner、fixture或作者证据。build01/result.json记录24输入、原始命令、自然exit、完整wall、二进制字节/SHA；rust-input-recheck.json确认这些输入在最后candidate逐项未变。独立binary SHA256：`e4a30bcd9aaefccaae2212e84df39aa37bb61fdcbaef1f4cb3585175b306d621`。

所有自写probe在本目录，stdout/stderr保留外层`/usr/bin/time -p`完整wall；各结果JSON保留实际输入指纹、PID生命周期、pageErrors及调用记录。ui06/runner.mjs为当时准确运行版本，重构其源码并严格核对结果所载SHA，其他历史失败不追认为最终runner身份。ui07/runner.mjs为修后最小源链准确版本。所有历史失败原件保留，不通过修改产品或公共测试刷绿。

| 验证 | 最终本轮结果 | 完整wall | 原件 |
|---|---:|---:|---|
| locked/offline独立transport编译 | 自然0 | 1.96s | build01.*、build01/result.json |
| 真实磁盘/Rust Session独立oracle | 43/0、4PID自然0 | 0.86s | backend01.*、backend01/result.json |
| 真实Rust→App成功及负ACK完整链 | 28/0、4PID自然0 | 14.98s | ui06.*、ui06/ |
| Kotlin实际源码纯JVM策略/流 | 36/0、编译及运行自然0 | 4.80s | kotlin01.*、kotlin01/、kotlin-toolchain-manifest.json |
| quiet失效响应/挂起strong请求并发 | 3/0、自然0 | 3.94s | concurrent02.*、concurrent02/result.json |
| 修后真实Rust正常quiet与导出/管理最小链 | 12/0、1PID自然0 | 8.60s | ui07.*、ui07/ |
| 最后产品33定向 | 断言33完成，清理挂起，终止自身PID后143 | 202.31s | final-fix33/、final-fix33.*、final-fix33-cleanup-hang.json |
| 旧默认runner自然退出复验 | 33/0、自然0 | 60.37s | final-natural33/、final-natural33.* |
| 最终准确runner/产品独立定向 | 33/0、自然0 | 19.71s | final-optimizer33/、final-optimizer33.* |

真实Rust→App链包括：正常FilePicker添加原PNG和非零WAV，真实journal/正文ACK；原Host/Tiptap/旧媒体身份和每帧遮罩；图片卡/预览/管理行原字节导出；真实文件stat和管理DOM；界面完整备份→fresh App真实prepare→生产App排空保存队列自行ACK(true)→实际Session commit→精确原字节和新PID恢复。负例在保存边界注入IO错误，App自行ACK(false)，真实Session abort，原库文档和附件完全不变。adapter没有插入任何成功ACK或生成commit事件。

JVM探针对实际DocumentUris/DocumentStreams源编译，验证自身包、包前缀、声明provider别名、大小写、数字user-id、已解码authority及非法authority，外部provider正例；复制检查多block原字节、零read推进、空文件、超限/短读、read/write/flush/close错误。真实Android Uri/ContentResolver/系统picker运行仍OPEN；没有用纯JVM或browser fixture授予平台通过。

## 保留的失败

- ui01：独审错误使用`.image-error`，实际DOM已显示role=alert的真实Rust filesystem错误且无输出。只改自身selector。
- ui03：实际负ACK→abort正确，probe未捕获预期debug reject。
- ui04：实际错误是“其他窗口仍有未确认保存的更改”，probe等待了不匹配的toast片段。
- ui05：实际负ACK和原库不变均正确，probe误要求debug封装保留access_changed代码；最终以真实协议事件和明确业务失败为oracle。
- concurrent01：独审`Array.map(resolve)`把数组参数传给path.resolve，在创建runtime前失败。concurrent02改为显式单参数后通过。
- frozen-final33：真实产品合同失败；陌生Session的21帧/7次mutation均没有committed cover/hidden，而Host已变化。作者确认React batching，并以1e16c9fe在异步陌生authority分支先flushSync提交安全遮罩。没有据此声称具体受保护正文泄漏。final-fix33修后实际25帧含1cover和1hidden，但cleanup自然退出尚未完成。
- final-fix33：Node22887在打印33通过summary后保留Vite/esbuild和HTTP listener，Chrome已退出；作者两端同型复现。记录ps/lsof后仅终止自身PID，外层真实exit143，不算完整命令通过。待最小runner关闭修复冻结后再复测。

后续作者两旧默认CLI最终自行自然0/401.934s与444.559s，因此永久死锁假设不成立。独审新一轮默认runner final-natural33自然0/60.37s；作者仅增加测试runtime双React DOM入口预构建ad982ee8，独审静态确认没有改断言或cleanup算法，最终final-optimizer33自然0/19.71s。原143保留；没有用强杀或process.exit伪造通过，也不据单次对照授予普遍性能根治结论。

最终正常quiet89帧+13mutations零遮挡/隐藏/Host-editor-media变化；unknown22帧+8mutations确有1cover+1hidden；strong并发98帧中29cover+29hidden。修后真实Rust最小源链ui07为49帧+14mutations零遮挡/隐藏/身份变化。实际成功及负ACK完整链保持ui06独立28项原身份，不把后来的runner变化追认为其运行来源；真正编译的24个Rust输入在最终candidate逐项相同。

本轮结束无独审工具进程。Cargo target、Gradle缓存、candidate dist交还根；未操作主线git index，由根统一提交本目录及review。后续完整整合回归/本地打包/独立核包另外记录。

## 复现命令

独立脚本均从主项目运行，ROOT和OUT需传全新合成目录。示例路径沿用本轮来源，不会访问已安装应用或用户媒体：

```sh
python3 docs/verification/data-management79-independent/build-probe.py /private/tmp/apple-notes-data79-integration /private/tmp/data79-independent-build01 /Users/water/work/2026/Apple-Notes-Clone/src-tauri/target
node docs/verification/data-management79-independent/backend.mjs /private/tmp/apple-notes-data79-integration /private/tmp/data79-independent-build01/notes-independent-data79-transport /private/tmp/data79-independent-backend01
node docs/verification/data-management79-independent/ui-real.mjs /private/tmp/apple-notes-data79-integration /private/tmp/data79-independent-build01/notes-independent-data79-transport /private/tmp/data79-independent-ui06
node docs/verification/data-management79-independent/ui-real.mjs /private/tmp/apple-notes-data79-integration /private/tmp/data79-independent-build01/notes-independent-data79-transport /private/tmp/data79-independent-ui07 --source-only
python3 docs/verification/data-management79-independent/kotlin-probe.py /private/tmp/apple-notes-data79-integration /private/tmp/data79-independent-kotlin01
node docs/verification/data-management79-independent/concurrent.mjs /private/tmp/apple-notes-data79-integration /private/tmp/data79-independent-concurrent02
```

冻结公共新33从candidate运行：`node scripts/debug/cli.mjs group data-management --out <主项目绝对证据目录>`。

没有启动/停止任何现有Mac app；没有操作原版Notes删除实验；没有真实麦克风；没有安装/启停/导出/读取原Android约13秒未保存录音现场。原生窗口像素、OS多窗口、Android provider与最终包准确身份分别保持OPEN，不能由上述命令代理通过。
