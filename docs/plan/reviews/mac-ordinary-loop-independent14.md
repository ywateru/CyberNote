# Mac14 准确核包独立审查

**PASS / PACKAGE IDENTITY READY STOP。** 1174项有限核包断言通过，375项受保护输入的内容、SHA-256及mtime保持不变。未重跑构建/源测试，未签名写入、启动/安装应用或操作GUI、ADB、DB、依赖锁和共享缓存。

来源固定为root指定的 `d9ce9c4b864c2d05bf3d2057ec48ae65fb868a46`，freeze SHA `3adea7a3607d2247c7d34de529aab2fd38c48f160d91a6d336a0ae2e92974e94`。327项完整输入、308项产品和7个canonical工具重新逐项核对；product aggregate `51ef44771aff4afd0117af09f6b5de6ae928306277ef1534eb35b951b8e87b3e`、input aggregate `00ec0f65421419ef9d4dfc7fdfad80f755abb599469d69382d585470c0d39a8b` 均一致。九字段授权、root冻结复核、构建及收集四份前后完整快照相互吻合。来源提交ID由root授权及记录连接，本轮未读Git对象，不是独立提交树证明。

已核37保留产品hash、42两个准确文件及45唯一三行CSS差异，仅核身份，没有重复源行为测试。canonical离线jobs2构建exit0、62.154秒、600秒上限、最低余量超过2GiB，owned group结束且无残留。收集13命令均有完整结束记录，原始strict预期失败单独保留。tsc/Vite、插件及宿主release日志与新JS/CSS生成清单一致；四个dead_code和chunk警告保留。冻结OCR/补充输入仅核记录及快照一致，没有遍历共享缓存或声称模型包含于Mac包。

输出隔离为构建前原子移动旧application/dist，并证明新输出inode不同。保全旧application与Mac13原生成快照完全一致；保全dist与14构建前快照完整一致，且与Mac13字节/模式/目录相同。历史共享dist目录inode与13不同，未将此推成产品差异。当前公共target/dist未读取，核查对象为immutable artifact和原始生成记录。

准确后续运行对象：`artifacts/unified-candidate06/mac-ordinary-loop-build14/mac-attempt01/mac-sealed.app`。

| 产物 | SHA-256 |
| --- | --- |
| sealed executable | `c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f` |
| sealed ZIP | `146fdbc67111cd1ae0779337a22af1550d1d9a446c27021bc243415f5dff0605` |
| sealed bundle aggregate | `8af9413d27f747233e72c537defd282bb30b64e6228972aee3eb22b7423d0aeb` |
| original executable | `eac006e3e922c49bc5971a935821f469649b141009fc1f323808e255a083946c` |
| original ZIP | `ff445742b2e878855628de30b0a4ead18dc710a8fd4af923cca1ae73c4bf3549` |

original/sealed包完整枚举，无额外文件或symlink；两ZIP全部读取校验CRC、唯一名称、路径、字节hash及模式，与对应app完全一致。original与本次真实构建生成清单相同；sealed仅executable及新增CodeResources不同。独立arm64 Mach-O比较剥除签名尾，并只规范化LINKEDIT的vmsize/filesize和LC_CODE_SIGNATURE的datasize三字段后，全部非签名字节相同。

新鲜只读codesign deep/strict：original exit1准确重现资源封印缺失；sealed exit0，valid on disk并满足指定要求。sealed为arm64 adhoc，CDHash `1d215208651dd7f7443ffe2ca4641dd62d0d84fc`、TeamIdentifier未设置。Info.plist一致，com.local.notesclone、notes-clone、最低macOS12.0。仅本地密封身份，不是DeveloperID、公证、系统权限或兼容性验收。

11项原生键盘静态标识包含37的navigation查询，original/sealed同offset存在；与准确源码hash及编译日志共同支持机制被编入，不能证明运行安装、真实按键/系统开关/焦点或Option插入已通过。未独立解码程序内压缩前端资源，也未重建。

首次复用核包脚本对历史共享dist的inode作了过强相等要求，在签名命令前停止；当时旧app完全相同，dist仅inode不同。原失败及脚本保留，修正为历史内容/模式/目录对应，同时保留相对14构建前快照的完整保全检查；随后1174通过，无产品修改。另有探索性JSON读取器误将list当dict的记录，未执行构建/产品操作。

证据为 `docs/verification/unified-candidate06/mac-ordinary-loop-independent14/`，索引包含本报告、排除自身。375项初末保全已完成。真实OS Option/CmdZ/CmdShiftZ、37导航、普通智能往返/取消、侧栏、字体/选区及全像素由root准确Mac14后验，不以本核包代替。**READY STOP**。
