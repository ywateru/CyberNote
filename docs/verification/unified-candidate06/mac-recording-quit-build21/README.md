# Mac21：退出68与原生普通退出69准确构建与本地adhoc封存

2026-11-05。准确源`bd51ae6aae37cf2f9576bf50e44e568c67a17427`，产品366项、聚合`cd01c9943be7fe95dacb108716f723f0dcdf8963d375788e91e529aca63a273c`，完整输入387项、聚合`22cbefc567271d7b74fd5e1dc905c21fb53733b2c64e1e460c9cd4396df434e1`。以Mac20完整361/382作union，378 unchanged/4 modified/5 added/0 removed，21历史input-only大小/SHA逐项不变，78插件及历史fixture例外保留，两份已删child capability继续absent。授权/计划/权限审计详见`/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-quit68-native69-preparation`。

freeze为353304字节、SHA256 `5a01650d4a621540eb03f3f99b2a37bae366cfaa7cdcc23fef0d1f575f98c1f4`。九字段授权为40074字节、SHA256 `f7c697d0c152a0b1eba877dd733612e918deeea64fb18aa6355a52cfb7e508b1`。root在START前直接读取准确freeze并重新capture，15字段全部相等，审查union/21input-only/权限/命令/七工具/六环境，准确审查身份记录在build-start.json。tracked工作树/index与全部冻结输入保持至collection完成，未提交新HEAD。

本次唯一attempt01，nonce`57403b1daf814132a202d9bae1c06543`，固定正常pnpm mac:build。北京时间2026-11-05T20:20:51.308015+08:00至2026-11-05T20:23:13.448708+08:00，子命令elapsed 138.18秒，exitCode=0，ownedGroupStopped=true、remainingOwnedGroupMembers=[]。构建前后15项输入比较全true，supplementalInputsUnchanged=true。完整build.txt保留全部原始提示，Rust仍报告13项既有warnings，没有为提示修改源码。沿原工具和已授权执行权限保留/bin/ps只读监控；未绕过守卫或改变工具。

固定旧Mac20原始.app与dist经完整身份检查后原子rename至mac-attempt01/prior-outputs，确认固定路径absent才启动正常构建。未清理target/cache或历史artifact。新输出由隔离、重新生成和身份比对建立；新dist字节与旧dist相同，不能因此声称复用了旧包。output-isolation.json与generated-outputs.json保留完整来源证据。

collector北京时间2026-11-05T20:23:31.750369+08:00至2026-11-05T20:23:42.248923+08:00完成，ready=true。收集前后15项比较全true，supplemental不变；构建结果、fresh output与prior保全身份重新核验。collection/result.json为28016字节、SHA256 `060fb079f2cbfc37de8fc778060eb02ff81ec4990650694f573fd4682deb54af`。post-collection-review.json的31项完成后核对全部通过；这些核对不代写独立核包或运行验收。

完整artifact目录`/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-quit-build21/mac-attempt01`。

| 身份 | 完整原始包 | 独立adhoc派生包 |
| --- | --- | --- |
| executable字节数 | 16826112 | 16746416 |
| executable SHA256 | `73fa5b74e71899eb49452e0998005769686b917a8a031e1e773b37f81a264f16` | `b8228d203acebb4750b6b43e5f1360b2a7f62f54aeaca01721187fb3443eba73` |
| bundle aggregate | `45860e4ae4dea706bd0d7abb96cf44dd09c13f23e4ef21a67c0d6e945aff88b9` | `16df48fa523bb25285495d49d9eb39edbefed77a0220566da69fefeafdabd34e` |
| ZIP字节数 | 5089198 | 5014264 |
| ZIP SHA256 | `acbe7a943e384526c6327d2f0cfb0d7e82e9f2c5defd452f6cdb188379533aaf` | `b7a544f1c3e5f2f29d078c58f8cd02d6d559c5c15a99e646417c771f2fb14685` |

mac-original.app与mac-original.zip完整保留linker adhoc签名。原strict/deep实际exit1，原文`code has no resources but signature indicates they must be present`保留在command-06.txt，未修改原包或重标通过。collector只对mac-sealed.app这一独立副本签名一次；sign exit0、strict/deep exit0，见command-08/09.txt。派生为arm64、identifier=com.local.notesclone、Signature=adhoc、TeamIdentifier未设置、CDHash=658a782daeb747b08bc62092843670f7fc402b40。只有主可执行和CodeResources发生允许变化，Info.plist不变，preservedOriginalUnchanged=true。没有DeveloperID、公证、签名策略放宽或循环重签。

68把自有菜单/CmdQ接入app.exit，69将正常AppKit terminate接入同一既有可取消退出保存门槛，并以严格Tao身份/ABI校验保护录音准入。capabilities、权限grant、application/plugin handler与原local/quit guard保持原字节。安装/退出释放与原生recording_access就绪检查确有69改动，不能写为整个插件实现未变。强杀/注销不在本轮覆盖声明内。源码与受控独审不自动证明真实CmdQ/Dock/AppleEvent录音保存已通过，仍需准确包独审及root真实运行验收。

用户本轮要求清理无用编译中间文件，root与本执行者在freeze前按授权完成，详见docs/verification/build-cache-cleanup-20261105；全部27项scratch先核无tracked，未跟随symlink。冻结后未再清理输入/缓存。本执行者未启动、安装或操作Mac21，没有GUI、设备、麦克风或真实音频操作，未触Android现场、旧artifact或应用数据；没有导出、复制或转写实际音频。root告知旧Mac20在无活动录音时正常CmdQ退出。旧Mac18停止原因/时点未知，不声称其未保存录音仍保全或已恢复；旧Mac20 K退出失败仍保留历史结论。

本索引纳完整本轮freeze/START/执行/collection及artifact命令日志与包身份，排除索引自身和prior-outputs；prior完整身份保存在isolation/result。环境范围仍是明确输入、版本/工具、选定环境、OCR及supplemental身份，未声称完整OS/SDK/传递依赖可重现。后续独立核包、真实退出保存、首显、回放、像素和移动验收另出结论。
