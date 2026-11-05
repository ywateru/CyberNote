# Mac18：录音自动保存64准确构建与本地adhoc封存

2026-11-05。准确源 **`8022407f0b827a564fa64f693b5c7e7f6220b42e`**；产品353项聚合 `8b4557edcc8d18a3144cea44f4437cfcb70d9956c95670ed39603ebf0bc48d95`，完整374项聚合 `8de71e6d7ff91118bdd1c69b7b54bce42000cbde9a56632210fa1463d31ecb15`。本轮含60手机局部时间轴、63默认关闭诊断及64桌面暂停/关闭自动保存；准确授权和完整旧输入union见 [准备目录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-autosave64-preparation/README.md)。Mac17所有旧333/352路径保留，新增20产品/22输入，含明确input-only的Store harness Cargo模板，不使用旧候选字节代替最终整合源。

本轮freeze **347088字节**，SHA256 **`469c75c5817f1f8e7197e5074257dc8b38ae209ae1eef9339614ca353285efa5`**，见 [input-freeze.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/input-freeze.json) 和 [freeze-summary.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/freeze-summary.json)。root在START前直接核source、九字段、全部大小/SHA、计数、聚合和环境，构建/收集前不改HEAD或输入。[root-freeze-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/root-freeze-review.json) 为该实际复核的事后记录，不能把文件写入时点冒充START前。

唯一attempt **attempt01**，nonce `c1875153442841aba265c8774674a113`，固定 `pnpm mac:build`。北京时间 **15:56:49–15:58:43**，子命令elapsed **110.795秒**，exitCode=0；ownedGroupStopped=true且无残余自有组成员。build前后全部15项输入比较true，补充输入不变。构建result SHA256 `d40d77c09eb60466d0f891276c53a420272e361a88f796febbc64fa0b5603564`，见 [result.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/result.json)；原始 [build.txt](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/build.txt) 保留前端大chunk及既有编译提示，没有为提示改源。

此前固定Mac17原始.app与准确64前端dist按原流程完整核身份后，同文件系统原子rename到本次prior-outputs。确认两个固定路径不存在后才启动，不清理中间target/cache；旧Mac17 artifact不触。来源见 [output-isolation.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/output-isolation.json)，本次新生成输出见 [generated-outputs.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/generated-outputs.json)。dist与root先前准确64前端构建字节相同是允许的，本次来源仍由隔离及新生成身份核验。

collector北京时间 **15:59:02–15:59:10** 完成，**ready=true**。收集前后全部15项比较true、补充输入不变，完整新件和保全旧件身份再次核对。收集result SHA256 **`eb005f62f2a2f0a9b4b276e03384956f04b7b23b8144662baf9ba316439e871d`**，见 [collection/result.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/collection/result.json)。

全部产物位于 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01`，原包与ZIP、独立派生包与ZIP完整保全。

| 身份 | 原始包 | 本地adhoc派生包 |
| --- | --- | --- |
| executable字节数 | 16770944 | 16691568 |
| executable SHA256 | `48ebb74066414c1affdf1e0077ab5a5f51cc3b899c1f11670a9a298769be4887` | `20c8f1d9735653cd782df9088b35d0d487cfc431242f50a86b9776b78e96a238` |
| bundle aggregate | `6d7581313d1e1eac51058ccf455e4968a3500d6f8f546ece698a551d421fa926` | `a0ad1ae377713d024355c1cdea4cb908d77b763cd58a0a029ee8a6c860b830e7` |
| ZIP字节数 | 5081596 | 5007062 |
| ZIP SHA256 | `a39a3e75cd0692df7f2bdb4e9864d74fe79e0bc6334c2e9082ac1f7cccb20e29` | `b0e589cc33c63eedede792452365f0d1ca3f5c3205b8410aeea723f4c2dfb3a1` |

[mac-original.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/mac-original.app) / [mac-original.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/mac-original.zip) 原始签名为linker adhoc、Info.plist未绑定、无资源封存；strict/deep **exit1**，原文 `code has no resources but signature indicates they must be present`，保留在 [command-06.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/command-06.txt)。原始CDHash `d8ae1dea0311573b01512fc6772e006c9f054c59`。未修改原始包或把此失败改成通过。

正常collector对 [mac-sealed.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/mac-sealed.app) 独立副本签名一次，sign exit0、strict/deep exit0，原文 `valid on disk` / `satisfies its Designated Requirement` 见 [command-09.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/command-09.txt)。[mac-sealed.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01/mac-sealed.zip) 与原包分别封存。派生包为arm64、identifier `com.local.notesclone`、CDHash `f0f493c3b0e99196daa5aeba6dbe2e8b65504086`、Signature=adhoc、TeamIdentifier未设置。完整文件比较仅主可执行变化和新增CodeResources，Info.plist不变，`preservedOriginalUnchanged=true`。没有改签名要求、循环重签、DeveloperID或公证。

有效环境沿Mac既有六项固定值，Cargo offline、jobs2，NDK27.2.12479018与Java17等仅保全环境身份，不宣称完整SDK/操作系统/所有传递依赖可重现。构建与收集均保持源码和全部输入准确，没有另跑设备或真实媒体测试。

相对Mac17，63诊断默认关闭，只有精确进程环境 `NOTES_RECORDING_DIAGNOSTICS=1` 才开启；日志可能因有界队列/阻塞writer而缺席，不能据此判系统callback。64每个revision使用独立不可变附件，以原A一张逻辑卡替换；旧文件保留会增加磁盘/归档占用。一张可见卡不等于一个物理文件。源码独审通过不能追认为旧授权超时或真实采集已修复。

**本执行者未启动、替换当前Mac应用，未操作GUI、TCC、麦克风、音频或手机。** 原Android现场继续完整保留。ready只说明本次准确构建、原包保全和本地adhoc副本门槛；真实Start、有效收音、暂停/关闭自动保存、继续累计、双模式/原A归属、恢复和像素验收由root及不同记录另行确认。不同作者独立核包另出结论，本记录不代写独审。

本run evidence-index只纳本说明、冻结、root复核、attempt/collection及同名artifact所有原件/命令日志；排除自身和prior-outputs，其完整身份已在isolation/result保全。没有将旧包或运行证据重标为Mac18。
