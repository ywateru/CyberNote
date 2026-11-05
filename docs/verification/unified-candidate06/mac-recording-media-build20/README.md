# Mac20：媒体首次加载恢复67准确构建与本地adhoc封存

2026-11-05。准确源 **`b455c14093b7a717a0a6e810b30d19301296e448`**，产品 **361** 项聚合 `c12780c3f0049592fa035e6c64f39a3d9df40b054249ee7194abc49a205f4c3d`，完整输入 **382** 项聚合 `7ba3010f9b9fdc0f2f72aebc391d0a4bcdbf9f45575b6396e70a04cfe63ddf00`。准确 [准备目录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-media67-preparation/README.md)以Mac19完整358/379作union：新增3个最终已提交脚本、仅修改src/use-attachment-media.ts；21个历史input-only输入大小/SHA全部未变，77个插件文件和fixture例外保留，Mac18→19已删除的2份child capability继续absent，没有新删除或恢复旧文件。

[input-freeze.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/input-freeze.json) **350994字节**，SHA256 **`051ad9000605d9883596090dec6618d1121d99f24379b138c145771e3df97da2`**。[九字段授权](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-media67-preparation/mac-authorization.json) SHA256 `2d5f283789f9975230e34d54538ae17b5218e3ab31c523c41718b002ad77bd6c`。root在START前直接逐行核源/授权/计数/大小/SHA/双聚合/完整union/工具环境/权限， [root-freeze-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/root-freeze-review.json)实际先于 [build-start.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/build-start.json)写入。源码、HEAD及全部冻结输入保持至collection结束，未提交新HEAD。

本次唯一 **attempt01**，nonce **`b7c6588680fb48f3be9321ccdc1050a7`**，固定正常`pnpm mac:build`。北京时间 **2026-11-05 18:16:48 +08:00至2026-11-05 18:17:35 +08:00**，子命令elapsed **45.388秒**，**exitCode=0**；ownedGroupStopped=true，remainingOwnedGroupMembers=[]。构建前后15项inputComparisons全true，supplementalInputsUnchanged=true。[构建result](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/mac-attempt01/result.json) SHA256 `17727416edeff693a8b48c6b3ae80f1edc431a1a8248cd2aaca70f252f6ed9f0`；[完整build.txt](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/mac-attempt01/build.txt)保留全部原始提示，没有为提示改源。

沿既有工具和策略，使用已获准的执行权限读取监控所需进程状态，避免Mac19曾遇到的/bin/ps启动前访问拒绝；没有删除监控、修改工具、扩capability或改变签名策略。本轮未发生未执行尝试，也没有第二次构建。

固定旧Mac19原始.app与root67前端dist经完整类型/身份检查后，同文件系统原子rename至本轮[prior-outputs](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/mac-attempt01/prior-outputs)，确认两个固定路径absent后才启动命令。没有清理target/cache或旧artifact。本次新输出身份见 [output-isolation.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/mac-attempt01/output-isolation.json)及 [generated-outputs.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/mac-attempt01/generated-outputs.json)。新dist与root67前端构建字节相同，来源仍由隔离、重新生成和身份比对建立。

collector北京时间 **2026-11-05 18:17:49 +08:00至2026-11-05 18:17:55 +08:00**完成，**ready=true**，15项收集输入比较全true、补充输入不变；构建结果、fresh output和保全旧件身份再次核验。完整 [collection/result.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/mac-attempt01/collection/result.json) SHA256 **`7e9b79240a1a36ba7a64c766fc765ad047884a1839a725c0789084f94b942ec0`**。[post-collection-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/post-collection-review.json)的23项完成后核对全部通过；此核对不代写独立核包或运行验收结论。

完整产物位于 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01`：

| 身份 | 完整原始包 | 一次本地adhoc派生包 |
| --- | --- | --- |
| executable字节数 | 16804912 | 16725344 |
| executable SHA256 | `53d4640784454514c23cb832f553844650aa000f7d7be9a6d05e6796c891678e` | `00ab5983c7c6c17fb30b66c6e97b27e369b518ebc37221f58e527e0cce8b6dd8` |
| bundle aggregate | `b8d43191e73535e0ab947533347d8aaed98cbc2ab717d339027b5955b965055a` | `3d3c1c11d7332ef6f1816b8d6aff0bc283c5c3b56d3bda2a882c339bc2a337e3` |
| ZIP字节数 | 5078654 | 5003851 |
| ZIP SHA256 | `410b2441ad73e6d98223a7fa4e4779b343b2a01684867e50a6610ece779c26ca` | `443826ce3621713b97c5e8c1235ccd022bfca167576f18ff9178b8904dab570c` |

[mac-original.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/mac-original.app)与[mac-original.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/mac-original.zip)完整保留linker adhoc原始签名。原包strict/deep **exit1**，原文`code has no resources but signature indicates they must be present`见 [command-06.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/command-06.txt)，未改包或重标通过。

collector只对[mac-sealed.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/mac-sealed.app)这一份独立副本签名一次；sign **exit0**、strict/deep **exit0**，见 [command-08.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/command-08.txt)和 [command-09.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/command-09.txt)。[mac-sealed.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/mac-sealed.zip)独立归档。派生为arm64，identifier=com.local.notesclone，CDHash **`d46c271b9dac5252ef45010da6bfde60488b866a`**，Signature=adhoc，TeamIdentifier未设置。只有主可执行与CodeResources发生允许变化，Info.plist不变，preservedOriginalUnchanged=true。无DeveloperID、公证、签名策略放宽或循环重签。

67是hook窄修：仅typed MetadataStale在同一有效id/kind/version/effect生命期内有界重读，最多三次总尝试；每次重新经过既有bridge读取验收，不复用旧bytes/URL，不降低metadata序列。[全capability/handler审计](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-media67-preparation/command-capability-audit.json)核准3份capability、原生handlers/local guards、插件权限资源均与Mac19逐字相同；main/note-*既有Mac麦克风预检授权保持。不改录音写入/revision/正文ACK/quit路径。源码与受控独审通过不自动证明真实C首次失败的内部时序，旧Mac19不追认为67。

本执行者未启动、安装、运行或操作Mac20，未GUI/麦克风/实际音频/Android操作，没有导出、复制或转写实际音频。root在本轮前已正常CmdQ退出无活动录音的Mac19，并告知18/19/20均无相关进程；旧Mac18停止原因和时点未知，不声称其未保存音频仍保全或已恢复，不重开旧18。已保存C/D/E/F及原失败运行事实各有历史记录；Android仍完全不操作。这里仅保全固定构建输出，没有触碰旧artifact或应用数据。

本run evidence-index纳本说明、freeze、START、root核准、唯一attempt/collection、本次完整artifact及命令日志；排除自身与prior-outputs，其完整身份由isolation/result保存。有效构建环境仍为既有Mac六项值，Cargo offline/jobs2；没有声称完整OS/SDK/全部传递依赖可重现。新包独立核包及首次持久播放器、暂停累计/关闭/重开等真实验收另出结论。
