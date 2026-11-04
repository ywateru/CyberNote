# APP-005-BUILD-TOOLS-01 独立复审 02

结论：**SOURCE-READY（工具源码，限定本次两项修复范围）**。准确候选`da9d0053d28f77f41398767c7f400c7ab39b6c9c`关闭独审01的P1/P2；没有新增阻断项。独立detached树`/private/tmp/apple-notes-candidate06-tools-review02`，2026-11-04。产品最终candidate06 SHA仍由root另行冻结，工具ready不授予真实构建、签名包、设备或像素ready。

本次只复核两原阻断、相关临时输出身份和必要既有7项检查。未修改生产工具，未实际运行版本命令、pnpm、Rust、Gradle、平台构建、签名、安装、GUI，未访问真实target/cache/最终产物。受控检查读取ps的pid/pgid/state并控制自身新建Python组，按正常本地审批执行；普通权限ps受限是已知执行条件，不记作产品缺陷。各记录剩余空间均高于2GiB。

## P1 已关闭：leader退出后仍检查和清理本次进程组

`common.py`新增process_listing/owned_group_members，启动命令前先确认进程状态可读；monitor在停止、异常及正常leader退出分支都进入本次Popen组清理。若正常退出仍有活成员，登记orphaned-build-children失败；只有无活组成员并完成leader等待才标ownedGroupStopped。僵尸不算仍能写入的进程。success要求该确认，无法确认清理时runner保留offline init并失败；不接收外部PID。

独立树实际针对复验：

| 受控触发 | 实测结果 | 原始记录 |
| --- | --- | --- |
| leader exit0，child打印下载marker后存活 | download-prompt失败，SIGTERM，ownedGroupStopped=true，活成员为空，leader退出码0保留，无关进程仍活 | targeted-author-suite-result.json / leaderExitedChild |
| leader exit0，child不打印下载marker但继续存活 | orphaned-build-children失败，SIGTERM，活成员为空，无关进程仍活 | targeted-author-suite-result.json / normalExitWithChild |
| 独立新增：本组child已准备后监控读取抛ValueError | 原异常保留，SIGTERM，自有组确认无活成员，leader退出码-15，无关进程仍活 | independent-closure-result.json / exceptionGroupCleanup |

这覆盖原先poll已退出而跳过清理的分支。结果限定本工具创建且仍在该组的活成员，不承诺清理主动逃离会话的任意外部daemon。

## P2 已关闭：原子保全精确旧输出，要求本轮新生成

`run-build.py`只处理固定stage最终app/APK及dist：先在独占锁内核类型、完整文件/目录mode及内部链接、同文件系统，逐项原子rename到本轮新attempt/prior-outputs；原件identity保留，原路径确认不存在后才启动命令。不删除/复制旧件，不清理其他target/cache，不在失败后回滚覆盖。新输出必须实际存在且为正确类型；同字节允许。

collector同时比对output-isolation/generated-outputs原始JSON与build结果，重新检查旧件与新输出身份，且收集结束前再次检查。旧的源SHA、冻结/平台/attempt、完整输入、supplemental、签名/模型等门未移除。

| 临时场景 | Mac | Android |
| --- | --- | --- |
| 预置旧输出，本轮真实Python no-op | runner exit1 / success=false；collector来源门拒绝 | runner exit1 / success=false；collector来源门拒绝 |
| 实际Python重新生成相同字节 | runner exit0 / success=true；新inode，旧件inode/字节保全；collector来源门通过 | 同左；临时offline init核身份清理完成 |
| 成功后改生成dist | collector拒绝 | collector拒绝 |

这些均使用临时假app/APK，隔离authorization/capture/lock，只让真实monitor执行Python；不把来源门通过误记为真实签名collector或平台构建成功。独立补充核对实际原子移动含内部相对symlink、空目录及目录mode的临时bundle，前后快照与旧根inode相同；原固定路径为空且缺新件被拒绝。外部symlink拒绝、外部字节未改的场景也通过。

## 检查和交付边界

原有7项受控回归全部exit0。针对修复套件以及独立异常/目录保全检查均exit0，原始stdout/stderr/结构化结果保存在[tools-independent02](../../verification/unified-candidate06/tools-independent02/README.md)。生产工具及作者fix-review01证据未改，旧独审01失败报告与复现由root保留，不被本结果覆盖。

无需扩大矩阵或调整无关工具。root合并准确工具后，仍须针对最终产品源码显式冻结各平台完整输入、指定独占run并按正常权限执行；两端真实构建、原始/adhoc包保全与签名、APK证书/ABI/25模型及后续设备验证必须以各自实际结果成立。
