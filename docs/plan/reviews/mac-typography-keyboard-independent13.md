# Mac typography keyboard package13 独立核包

2026-11-05，verify_app。**PASS / READY STOP，仅准确包身份范围。** 首次独立运行864项断言全部通过，无此范围内阻塞发现。未启动应用；键盘、字体、交互与整体像素验收继续开放。

固定来源由root指定为`182464bcc3055caadcd78fe4c7ce1a0ec31eea6a`，304产品文件聚合`6b1cda6557ff292326617bd2fdf8750ba37d700eb460e2d6cdb1ac2da80848ad`，323输入聚合`0769da604be0d4d3087771b948477e9c96c45992f0e75b81298465cdaa9d290e`。准确freeze SHA256`6da4a0f5cd6c24eee6f77560063af67519202bbba983b883772394f31f40261d`；collection结果SHA256`28f4fe004dcf4ce9b12f2bc2d623caf9ebaadcdfdac5661db9c4ee85612f7921`。本次没有读取Git对象或执行Git命令，来源身份通过九字段授权、root冻结复核、前后完整快照与当前明列文件字节支撑，不能视为独立提交树证明。

准确后续候选：`artifacts/unified-candidate06/mac-typography-keyboard-build13/mac-attempt02/mac-sealed.app`。

| 产物 | SHA256 |
| --- | --- |
| sealed executable | b24f87623e49781859166d798dec052cb987692469ad2741847392b13e127812 |
| sealed ZIP | 91dec624ade286756cd2eec5b8c0768c738821c8c2829b9089e42fa491001ae6 |
| sealed bundle aggregate | c37691422c79458aeb1d4e4d132bcfda2c6ef63e8616cc27e5175c47e7d85953 |
| original executable | c1b3d1fa0de4b4d0bec8031c5ce0981f98ca910a991c69b814c4f069d475f833 |
| original ZIP | c14c88272a683eeedb37c9a1ce04ad8edd6bca383b1a967fd9784588d860ffd1 |

root冻结复核确实在首轮START前生成，失败后attempt02授权另有明确时间。attempt01原始PermissionError、null exit、完整输入前后与输出原子保全记录继续保留，没有覆盖为成功。canonical工具显示process_listing权限探测发生在Popen之前；该轮没有build.txt或ownedProcessGroup，与未启动pnpm的记录吻合。attempt02拥有新nonce，构建exit0、56.611秒、600秒上限、最低剩余空间大于2GiB，所属进程组停止且无残留；收集13条命令也全部完成，预期原始strict失败单独保留。首轮和次轮输入、补充输入以及四份成功构建/收集快照全部与freeze一致。

323个明列输入与304产品逐项重算，聚合吻合；七个canonical工具字节准确。task35六路径hash全部对应已独审产品，task34合入CSS为`5ceac05bf79ca9fa83e0237b909c76281c2b03993ab654dbc6bed37191060929`，既有App/SmartFolderForm名称功能字节保留。记录中的离线Cargo/jobs2环境一致。OCR缓存25模型、2,490,310字节仅核对冻结事实与快照，不遍历共享缓存，也不声称模型包含于Mac包。原始构建日志包含tsc/Vite、原生插件与宿主编译、release和最终app，保留四个dead_code及chunk警告；无下载或配置缓存复用文字。此日志检查不能替代完整系统/SDK或传递依赖重现性证明。

attempt01保全的旧application和dist，完整内容、目录、模式、设备及inode与原记录一致；旧application精确对应Mac12生成快照。attempt02的初始最终输出均不存在，新application与dist inode均区别于保全旧件。原始immutable artifact完整清单与真实构建生成包快照相同，dist生成清单与build记录及日志的`index-CcN0EZLg.css`/`index-B5XVqrGq.js`一致。Android可同时进入自己的构建准备，因此本轮主动不读取当前公共dist或共享target路径；这里核查的是封存包与已记录的新生成链，没有把可能被替换的公共路径当作静态证据，也没有独立重建或解码程序内压缩前端资源。

original和sealed包目录完整枚举，无额外文件或符号链接；两个ZIP逐项解压读完，CRC、唯一名称、包根路径、完整字节hash与模式均与对应目录一致。密封差异恰为executable和新增CodeResources。独立解析arm64 Mach-O，剥除签名尾且仅规范化LINKEDIT vmsize/filesize与LC_CODE_SIGNATURE datasize三处签名长度字段后，所有非签名程序字节一致；完整结果保存于result.json。

10项原生键盘静态标识在original与sealed相同offset出现：NotesUIKeyboardPolicy、isFullKeyboardAccessEnabled、setTabFocusesLinks:、attach/destroy符号、实际安装完成和刷新失败日志、三个窗口/应用生命周期通知。它们与精确task35源码和原生插件编译日志共同支撑新机制确已编入准确包，**不证明运行安装成功、真实按键分发、系统开关切换、焦点移动或Option-Tab插入行为**。

新鲜只读codesign deep/strict复核：original exit1，准确重现资源封印缺失；sealed exit0，valid on disk且满足指定要求。sealed显示arm64、adhoc、TeamIdentifier未设置，CDHash`21ac36c66998a188fe8a4ce000c158db49daa78d`。Info.plist两份完全相同，identifier为com.local.notesclone、执行名notes-clone、最低macOS12.0。仅元数据和本地adhoc核验，不是DeveloperID、公证、兼容性或系统权限验收。

374个初始保护文件包括明确源码输入、两轮原始证据、immutable artifacts、旧输出、授权及工具，收尾内容/hash/mtime全部未变；323输入末核也未变。仅新增独立核包目录和本报告，没有改产品、已有记录、Git、任务或共享文档，没有构建、签名写入、启动、GUI/ADB、安装、用户数据库、下载或共享缓存遍历。本轮没有Android准确包结论，也不授字体/键盘/UI整体通过。

正式证据目录`docs/verification/unified-candidate06/mac-typography-keyboard-independent13/`。result.json保存864项断言与Mach-O证明，fresh-signature-checks.json保存原始签名结果，native-keyboard-markers.json保存编译标识offset，input-manifest/close及final-integrity记录初末保护，attempt01-command记录首次验证成功，evidence-index.json从仓库根解析且包含本报告、排除自身。SOURCE/PACKAGE IDENTITY PASS，READY STOP，交root决定准确包后续运行。
