---
task: mac-ordinary-sidebar-build11 exact package review
reviewer: verify_app (different from package author)
result: pass
scope: accurate Mac11 package source/bytes/preservation/signature gates
---

准确 **Mac11 核包 PASS / STOP**，486项核验通过，没有新增P1/P2阻断。可以进入root的有限真实应用验收。本结论确认固定包的来源记录、字节、归档、保全及本地adhoc签名，不授启动、侧栏持久化、立即CmdQ、原生菜单或像素通过。

## 固定身份

源提交由root固定为 `94fbbb36fe94a7f291edf34e618091a0cec8da63`。独审不读Git对象；以准确授权、root冻结审查、四次全量输入快照和321个当前文件字节建立对应。产品302文件聚合 `2f2c55e776312df3dcaa1ff5bdf87b20f17fe6f127027577cfb57e5bb8ce87b7`，完整321输入聚合 `86f2fe89729abeeb69b58875a34e55d67ca7e68d2442e494fbaa861a77dc6332`。冻结文件SHA256 `aef21d9d46cd578c44a4eed72479da545f343fb52c02b466e81b29e809b1d68b`，授权SHA256 `af5a9cec5b947b32a13b34e57137fb0b0aa32091944382dad2604bcd9da8a0c1`。

后续运行目标为：

`/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-ordinary-sidebar-build11/mac-attempt01/mac-sealed.app`

| 目标 | SHA256 |
| --- | --- |
| sealed executable | 3cc7188dff3213fdf1e7ca7c85373d3fe937ff8de8158fb187cb8679614e200d |
| sealed ZIP | d09aab449229a517b78302ac22ba6794a451abb2679441dc8035b7eeef660d9d |
| sealed bundle aggregate | 9521aae5d2dd816709d3d5ee39488619ea6ff61dec43e2d3e2b319cfa67c5b28 |
| original executable | 5d29577346501daa1496184986e57a8704d52dd16473b1452883f59627ee4c0a |
| original ZIP | 2452151186f269f928e9765d6b46521eab4f7808fac0b909c50d14935aeae900 |

## Findings

- P1 blocking：无。
- P2 blocking：无。
- P3 nonblocking：无本轮新增包问题。原始linker adhoc严格签名失败是保留的事实，后续只能将已密封派生包作为本地验证目标；不将本地adhoc通过表述为DeveloperID或公证通过。

## 独立核验依据

作者33项索引以仓库根相对路径全核，索引SHA256 `1e0a5529d9cb0fbdb2363384d0b9877f5d36b52b6e6f238d622a3eca8dfd17ae`。371项受保护文件在独审初末保持身份；包括全部本轮证据、原包/密封包和ZIP、prior-outputs、321输入、七项构建工具、授权及旧Mac/Android边界记录和旧Android06 APK。

独立核对授权九字段、输入路径清单、冻结摘要、root明确授权记录、源码聚合、输入聚合、构建nonce/时间顺序与collector对构建结果的准确SHA引用。构建前后和收集前后四个完整快照除时间戳外与冻结一致，记录的15项比较全部true。当前321输入重新计算SHA和聚合，302产品成员重算聚合，全部匹配；20CSS、22App/types/helper与保留16/17字节吻合已审身份。七个canonical工具也按当前字节重新核验。

`pnpm mac:build`原日志显示真实tsc/Vite及Rust release构建、37.911秒完成、exit0；离线Cargo/jobs2环境与冻结一致，没有下载或配置缓存复用记录。四项Rust dead_code警告和前端chunk大小警告原样保留。冻结依赖/环境、OCR四AAR和25模型成员事实在全部快照相同；25模型合计2,490,310字节。此处没有遍历或重新探测共享缓存，也没有宣称这些Android模型被装入Mac包。

原正式app和dist在构建前原子移动到本run的prior-outputs。独审重算其完整文件哈希、模式、目录清单、设备和inode，均与移动前快照相同；旧app亦与Mac10输出快照相同。当前新source app与dist的完整快照和构建记录相同，新app inode不同；原始归档app与新source app全部文件相同。当前三项dist文件与构建记录一致：CSS `index-7S15VAm6.css`、JS `index-CwmrhNLP.js`、index.html。未重新构建或解码Rust中压缩嵌入的前端，本结论限于冻结/日志/实际输出对应。

独立枚举原始2文件和密封3文件包，bundle聚合、大小、哈希及模式匹配collector。完整读取两份ZIP并验证CRC、无重复路径、全部有效bundle payload的字节与模式与目录逐项相同。两包Info.plist相同，标识com.local.notesclone，执行名notes-clone，声明最低macOS12.0及已有摄像头/麦克风用途；仅为元数据事实，没有系统兼容性或权限运行结论。

原始到密封包只有可执行文件和新增CodeResources变化，与记录一致。独立解析arm64 Mach-O：签名tail起点相同，去掉两份签名tail，并仅规范化LINKEDIT大小及LC_CODE_SIGNATURE大小字段后，整个剩余可执行内容逐字节相同。这证明密封没有替换程序payload；没有进行新的签名或修改包。

新鲜只读codesign结果：原始包strict/deep exit1，准确复现 `code has no resources but signature indicates they must be present`；密封包strict/deep exit0且valid on disk。密封显示arm64、Identifier=com.local.notesclone、Signature=adhoc、TeamIdentifier=not set、CDHash `30a555fd0b70e2460bb7cb2d99c40e83eb725daa`。作者13条命令的原始日志、预期退出码和有界完成记录均一致，原失败未被覆盖。

旧Android06 APK身份仍为 `8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac`，对应源 `de372d31e0578a7f2619413c0abde6a8439bb3c6`；本轮没有重建Android，不得将Mac11源码或修复归给该APK。

## 验证夹具失败与保留

首次独审脚本误认为collector结果也有独立dist字段，在已完成源及输出检查后触发KeyError。collector的实际schema只在构建结果保留dist完整清单，收集前后全量输入另外记录。原脚本 `verify.fixture01.py`、attempt01失败与命令输出完整保留；仅修改独审脚本按实际schema核对当前dist、构建generated快照和collection输入快照，attempt02全部486项通过。没有产品或包修复。

## 停止及后续门槛

仅写独审新目录和本报告。没有Git、产品修改、平台构建、签名写入、启动、安装、GUI/ADB、用户DB、下载或共享target/cache变更。所有新鲜签名子命令完成；没有留下本轮服务或构建进程。构建/collector原有进程组完成状态只按封存记录审查，没有新的进程启动验收。

root后续须将实际exeSHA/PID绑定上述sealed包，分别验收普通表单局部外观、确认后的hidden/visible新进程恢复，以及最后操作后立即CmdQ的单列观察。22的立即CmdQ宿主限制继续保留，不能据本核包PASS推导任意未确认意图会在退出前保存。整体像素、原生焦点/选区、媒体和全部侧栏行为也仍开放。

独立证据：`docs/verification/unified-candidate06/mac-ordinary-sidebar-independent11/README.md`、result.json、fresh-signature-checks.json、bundle-metadata.json、input-manifest.json、input-close.json和evidence-index.json。索引paths从仓库根解析。

**PASS / STOP**，交root后续有限运行。
