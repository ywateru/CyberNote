# Mac17：录音界面58＋59准确构建与本地adhoc封存

准确源 `fa21657bc116431324d85b18fcbe9e1d328471fb`，产品333文件聚合 `c4af1ea4245c575835070d29a1616190540fd25dd6fbb7d33b924fddb5e4774a`，完整352输入聚合 `f79a1decd907350da75647ce8d6ab8040acb7b482aa91a9b9240c3089c531b85`。本轮准确授权见 [mac-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/mac-authorization.json)，输入沿Android11完整底表保留并加入58／59两个新检查脚本；76插件文件、14生成输入、5补丁依赖及fixture例外均保全，清单关系见 [准备说明](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/README.md)。

冻结文件SHA256：`dfa932f257dbb4b74fc042c69ab9555c848510de761413d77cf0f9690b948d22`。root先复核 [root-freeze-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/root-freeze-review.json) 再授权本平台attempt01；完整冻结见 [input-freeze.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/input-freeze.json)，摘要见 [freeze-summary.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/freeze-summary.json)。本次nonce `83091f632e594623b98b14ff8ec42732`，构建命令 `pnpm mac:build`，exitCode=0，elapsed=62.988s，ownedGroupStopped=true且没有残余自有组成员。构建为北京时间 2026-11-05 13:49:20 至 2026-11-05 13:50:25；收集为 2026-11-05 13:51:02 至 2026-11-05 13:51:10，collector ready=true。

[构建result](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/mac-attempt01/result.json) SHA256 `80a60e5d4f5bb260fe2493ca3193b3c14e180137eb835d2a8a5a812b2461bd16`；[收集result](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/mac-attempt01/collection/result.json) SHA256 `9cf2cfb12d37900e0af24df56b6bc0ec4d6514dc84a6347be50f20e871c3a567`。构建前后、收集前后全部15项输入比较均true，补充输入不变。原固定输出与dist原子移至本attempt的 `prior-outputs/`，保全前后身份及新生成输出分别见 [output-isolation.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/mac-attempt01/output-isolation.json)、[generated-outputs.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/mac-attempt01/generated-outputs.json)；未通过清理target/cache替换来源门槛。

本次完整原始包与ZIP分别在 [mac-original.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01/mac-original.app)、[mac-original.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01/mac-original.zip)；独立派生副本与ZIP在 [mac-sealed.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01/mac-sealed.app)、[mac-sealed.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01/mac-sealed.zip)。artifact目录为 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01`，command-01至command-13日志均原样保留。

| 身份 | 原始包 | adhoc派生包 |
| --- | --- | --- |
| executable字节数 | 16743520 | 16664304 |
| executable SHA256 | `a2465b73611e99660e45330bdc9c490078ba885b96dade4c8944ce0051728c83` | `b1edcf317019bb9443ab3fd745cbee79e70cda4ac3b7134e6833b42201b3f895` |
| 完整bundle aggregate | `b73cf5b8768a6f4c57c1922ccf0dbd815bbfe18ef010d0c6ce17d671291563ad` | `22fded832f77cb1f51c75f13eb33159347481c4ac84a785f9ffd8e8d200a9dcc` |
| ZIP字节数 | 5048846 | 4974441 |
| ZIP SHA256 | `4d8daac999103d94b8c3e9309957187db5a512540e64f42297c8d4b2bcde4e40` | `69ad925b7f44b9e2469f69a58061013d5c9382b87982a60b74481092c21a7487` |

原始包虽显示linker adhoc签名，但Info.plist未绑定、没有资源封存；`codesign --verify --deep --strict --verbose=4` **exit1**，原文为 `code has no resources but signature indicates they must be present`，见 [command-06.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01/command-06.txt)。原始包CDHash为 `513f225f3ad81e72c67ec965a7ac781fd12b189e`；该失败没有改标通过，也没有回写原始包。

collector在独立副本执行本地adhoc签名，签名exit0，strict/deep验证exit0；[command-09.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01/command-09.txt) 记录 `valid on disk` 及 `satisfies its Designated Requirement`。派生包为arm64，identifier `com.local.notesclone`，CDHash `9a7b3ca895811fda5cdf2ceca9b5a8ab881e8cf7`，`Signature=adhoc`、`TeamIdentifier=not set`。完整文件比较仅允许主可执行文件变化与新增 `Contents/_CodeSignature/CodeResources`；收集result的 `preservedOriginalUnchanged=true`，Info.plist字节保持。

冻结有效环境沿准备说明，Cargo离线、jobs2。前端TypeScript／Vite与Rust release构建成功，原始build日志保留大chunk及既有dead-code提示，没有因提示更改产品源码。Mac17收集完成后才启动Android12，当前主线dist随后可由Android构建替换；本轮新前端身份仍由构建result和生成输出记录保全。

ready只表示本次构建、完整原包保全与本地adhoc派生门槛完成。没有DeveloperID、公证、TCC授权或麦克风结论；不由此推导启动、活动采集、回放、保存恢复或像素一致。root另存Mac17运行证据，本说明不代称active capture，也不代写不同作者独立复核。

[evidence-index.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/evidence-index.json) 仅索引本run的说明／冻结／attempt记录及本平台同名artifact的产物和命令日志；排除索引自身与 `prior-outputs/`。旧输出完整身份继续由output-isolation/result保留，运行及独立复核目录不纳此索引。
