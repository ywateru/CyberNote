# Android recording wave build 13 — independent artifact review

2026-11-05。结论：**PASS，仅本地固定构建产物与来源核验**，51项检查全部通过，无阻断发现。审查者 `native_ui_research` 不是任务60产品作者，也不是构建13作者。未使用构建作者README作为事实来源；封存清单中的README只核对文件长度与SHA。

APK13包含手机波形任务60，**不包含之后合入的任务63授权诊断源码**。主线在collection结束后合入63并重新生成dist；本审查始终按准确历史Git提交读取tracked输入，不把当前主线或当前dist当作APK13的源码/资源。

| 固定对象 | 独立核验结果 |
| --- | --- |
| 源提交 | `a236b311d7d6dcb33b0ee4f16977ebe2d2adf8ac` |
| 产品输入 | 334项；逐文件读取该提交Git对象，字节数/SHA与冻结逐项一致 |
| 完整输入 | 353项；334个历史Git对象加19个实际生成/补丁依赖输入，逐项一致 |
| 产品聚合 | `2fe1f3489557095dae5d61f1076e12f8b98d265a3ea86bf36dbff989132fc7a3` |
| 完整输入聚合 | `3020f04a710133efca6a94919b48024fc24361447465f6805a2a10e8c47cc550` |
| 冻结文件 | 337,844 B；`67e9f04668c9d4e9049249d3326f9faf4ea84adff644e92914f665888a5df01e` |
| 授权文件 | 精确9字段；334/353路径有序、无重复，上一Android12的333/352路径全部保留，仅新增波形检查脚本路径 |
| 固定APK | 180,721,914 B；`60aa7ff23ccc91e18fd027b1bb0a9d1ce21b01410275b86f05cccee40f15358b` |
| 构建证据索引 | `be7a51267edca42cbe36aa1162c3922e96455328ad3409e246edd413c363fff5`；15项实际文件逐字节身份一致，13文档+2产物 |

`check.py`独立读取固定JSON、原始build日志、APK及冻结声明的输入。`metadata.py`补充核对freeze-summary和root复核记录的实际文件绑定。`result.json`、`check.txt`、`metadata-result.json`保存断言与结果。`actual-inputs.json`、`input-comparisons.json`提供完整输入及比较清单。

四份实际输入快照（build前/后、collection前/后）各15个非时间字段均与freeze一致；未把collector自己的布尔PASS当作唯一证据。当前实际7份构建工具源码、只读overlay两文件、701项Gradle分发文件与模式、分发完成标记、4份冻结OCR AAR以及其25份模型均重新读取核对。所有缓存只读，无清理、写入、下载或重建。

原始日志包含两条完全相同的本次nonce证明：`572a6803590d4035899986a6763db898`，offline=true、workers=2、configurationCacheJvmProperty=false。不存在配置缓存复用标记。子进程环境与冻结一致。临时init脚本由已核对工具中的纯生成函数重建其预期字节，长度/SHA与创建及清理记录一致，原路径已不存在。构建exit0、24.289秒小于600秒，所属进程组停止且无剩余成员的记录完整；本审查不重启历史进程或查询设备。root复核记录绑定实际授权、freeze、计数与聚合，记录自身明确collection后整理；START前复核的时序属于已保存的root声明，本审查没有重演该历史动作。

输出隔离的实际保全旧APK、旧dist与记录的device/inode/mode/字节身份一致。新APK的实际device/inode/mode/字节身份与generated-outputs一致，且与旧APK是不同inode。历史新dist的generated-outputs、build result和collector身份相互一致，并与旧保全dist的四份字节相同、inode不同。当前rootdist在63后重新构建，其观测保存在 `later-root-dist-observation.json`；不把它当作历史13的新dist inode证明，不改动或复原它。

对保全APK独立遍历、流式解压并计算所有1,066个ZIP成员的SHA/大小/压缩大小，无重复路径，完整列表与collector一致。只有`arm64-v8a`原生ABI。25个OCR模型共2,490,310 B，与实际冻结AAR中的模型路径、大小和SHA完全一致。

补充嵌入资源核验复用了既有独立03/08的有界只读Brotli方法，没有执行或注入应用。包内 `lib/arm64-v8a/libnotes_clone_lib.so` 为155,423,592 B，SHA为 `800c4074100728ac1dd0b334aff5a4563c6b45388b73d022f9b6c1da96629d32`，与独立ZIP成员清单一致。CSS和两份JS的完整解码字节与历史13 dist记录及保全dist实际字节一致。HTML有编译序列化差异，完整canonical tokens一致，规范化仅处理doctype大小写、空白文本、void标签和布尔属性表示，保留标签顺序、属性值和非空文本；没有声称其原始字节相同。详见 `embedded.mjs`、`embedded-assets.json`、`html-tokens.json`。

独立运行现有apksigner，仅验证两个固定APK。APK13的v2签名验证成功；实际candidate04基线APK也验证成功，两者唯一签名证书SHA-256均为 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与collector记录一致。命令、原始输出与两个APK身份见 `independent-signatures.json`。此结论支持包证书兼容性，不代表已安装或升级。

保留了三次检查假设修正的原始脚本、输出和停止记录：`attempt-initial-root-head-assumption/`最初要求当前HEAD仍为历史a236；`attempt-mutable-dist-assumption/`最初要求当前dist仍等于13时刻；`attempt-zip-assets-assumption/`最初尝试ZIP assets映射，实际前端嵌在原生库内。这些是审查方法修正，没有判作产品/构建失败，也没有改动原构建记录或工具。

限制：来源、包、历史记录和固定字节核验不等于完整OS/SDK可复现构建。本审查未构建、签名写入、安装、操作ADB/GUI/手机、触发权限、读取用户音频或笔记、执行离线OCR、播放/录制媒体或做像素验收。保留原手机现场，所有原run/artifact文件保持不变。
