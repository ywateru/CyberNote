# APP-005-BUILD-TOOLS-01 独立审查 01

结论：**CHANGES REQUESTED，b5c0aef尚不能授予SOURCE-READY。** 两个实质问题分别涉及停止后遗留后台进程，以及本轮构建输出与预存旧产物的来源边界。未发现需要扩大到文档措辞或无关低风险重构的阻断项。

审查冻结提交`b5c0aef86edec3988691c73dfe5c83bd1dc0363f`，基线`4dbdbd25238c430f7800cb286b642577a09ccf50`。独立detached树`/private/tmp/apple-notes-candidate06-tools-review01`；作者树只读，生产工具未改。实际candidate06产品SHA仍待root后续指定，本报告不将b5工具提交当作最终产品冻结。

## [P1] 已退出leader会使停止条件跳过仍存活的自有子进程

定位：[common.py:356](../../verification/unified-candidate06/preparation/common.py#L356)，及异常路径363–365。monitor检测到下载/低空间/超时后，只在`process.poll() is None`时调用stop_owned。如果pnpm/包装器leader已退出，而同一新建会话/进程组仍有子进程，监控直接返回，finally只等待已退出leader；后续runner可清理offline init、释放共享锁，同时子进程仍可能下载或写共享target/cache。这破坏已授权的停止与串行边界，而不是普通日志问题。

独立纯Python复现：新session leader fork同组child后exit0；child打印`Downloading https://controlled.invalid`并保持存活。monitor在0.105秒以download-prompt抛出异常，记录exitCode0，没有terminationSignals；返回后child及其group均仍存活。复现脚本finally只终止这次新建的自有group，未触及其他进程。原有7项检查没有覆盖leader先退出的分支。

请在停止/异常与结束路径核实仍存活的本次自有group，并在释放共享锁、清理init或记录安全终态前完成该组清理/有限等待；保留leader退出码和清理错误。不能以简单接受外部PID或对任意历史PGID发信号替代归属控制。复验应包含leader先退出而child仍活的下载停止路径，并确认无关进程未被终止。

## [P2] 本轮零写入命令仍能把预存旧产物登记成成功输出

定位：[run-build.py:84](../../verification/unified-candidate06/preparation/run-build.py#L84)（14–19为输出路径），及[collect-outputs.py:175](../../verification/unified-candidate06/preparation/collect-outputs.py#L175)。runner在exit0后才首次读取固定app/APK与dist，没有保存本轮输出之前的来源状态或要求本轮生成。collector随后只比较当前字节与该次事后快照，nonce绑定的是结果JSON，未与产物生成关联。预存的有效旧包若没有被本轮成功命令写入，仍可走到签名/模型校验；那些校验不能证明它来自新冻结源码。

受控复现隔离authorization/capture/lock，monitor实际执行新的Python no-op（从未运行pnpm），临时root预置假app与旧dist。runner返回exit0且success=true，将旧app登记为buildOutputIdentity，前后inode、mtimeNs、SHA全部相同。此实验只证明runner没有来源门，**不声称真实pnpm/Tauri已经产生此故障，也没有让假包通过实际签名collector**。真实新旧源码SHA校验和collector防止收集后产物替换的门仍然存在，但不能覆盖这条生成前缺口。

请在独占锁内为这次构建建立可核实的输出来源，例如保全/隔离精确预存app/APK后要求固定命令产生新的对应输出，再把前后记录和来源成功条件交给collector核验。不要清理整个target/cache，也不要要求hash必须不同（相同源码可产生相同字节）。受控零写入命令应失败，正常新生成的相同字节产物可以通过来源门。

## 已检查且保留的有效边界

原有Python-only 7项检查在独立树全部通过，原始工具返回保存在[existing-suite-tool-return.json](../../verification/unified-candidate06/tools-independent01/existing-suite-tool-return.json)。独立复现脚本与结构化结果见[tools-independent01](../../verification/unified-candidate06/tools-independent01/README.md)。没有真实Rust/Gradle/platform build、版本命令、签名、安装、GUI、target/cache操作。

与旧04/恢复collector及05监控工具对照后，以下门已保留或加强：显式40位源SHA/产品聚合/完整输入列表、脏tracked与未跟踪产品拒绝、冻结文件SHA、平台/attempt/命令身份、前后完整输入与supplemental成功门、生成扫描注册、补丁依赖、NDK27.2、Java17、既有完整distribution与只读overlay、offline marker/init归属核验、2GiB保护、600秒进程监控、输出目录独占、完整原始Mac app及zip保全、原件不变及adhoc副本deep/strict验签与payload变化白名单、APK字节/重复ZIP成员拒绝/arm64-v8a/25模型/唯一证书及04升级兼容性。

以上为代码差异审查，未执行真实签名/模型工具或构建。init清理对本轮device/inode/size/hash进行核验，替换/修改/符号链接失败保留；现有受控检查通过。本轮没有据此声称整个Gradle依赖树、网络环境或所有可能逃逸会话的后台进程可重现，也没有授予任何产品运行或像素通过。

修复范围限这两个工具边界；交新的准确commit后只重验相关分支和必要既有回归。原始失败复现保留，不能将其覆盖成修复后成功。
