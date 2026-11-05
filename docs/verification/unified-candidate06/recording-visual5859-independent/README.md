# 录音58/59准确双端构建身份独立核对

结论：**BUILD-IDENTITY-PASS**。Mac17与Android12的保存记录、现有产物和输入身份均指向准确源 `fa21657bc116431324d85b18fcbe9e1d328471fb`。该结论仅覆盖以下明确列出的构建/包身份边界，不等于设备、真实录音/回放、活动录音、持久化、首轮离线OCR或像素验收。

本次只读源码、冻结/构建/收集记录和现有产物；仅在本目录写独立证据，未提交或修改root tracked文件。没有native构建、共享缓存工具调用、GUI、设备、安装、麦克风、音频、数据库操作。Android原现场按用户要求保持暂停验收。只读签名检查运行了codesign verify/display和apksigner verify；没有签名/重新封包操作，也没有重新打开共享缓存AAR。

## 准确输入与记录链

| 项目 | Mac17 | Android12 |
| --- | --- | --- |
| 源码 | fa21657bc116431324d85b18fcbe9e1d328471fb | 同左 |
| 产品/完整输入 | 333 / 352 | 333 / 352 |
| freeze文件SHA256 | dfa932f257dbb4b74fc042c69ab9555c848510de761413d77cf0f9690b948d22 | 1e0aced0d618087fd17ec496d55fc01b92dc4f76370910f5d333ce2222f5c01e |
| 产品aggregate | c4af1ea4245c575835070d29a1616190540fd25dd6fbb7d33b924fddb5e4774a | 同左 |
| source/input aggregate | f79a1decd907350da75647ce8d6ab8040acb7b482aa91a9b9240c3089c531b85 | 同左 |
| 构建退出/秒 | 0 / 62.988 | 0 / 44.386 |
| 收集ready | true | true |

独立重算aggregate使用原工具定义的 `sha256 + 两空格 + path + 换行`逐行SHA256。两平台333项产品逐条相同，全部与准确Git对象及当前源字节匹配；352项完整输入也逐条相同，全部重算当前文件bytes/SHA。333产品包括76个插件文件；当前332个必须跟踪的源/配置路径和枚举到的76个插件文件均被完整清单覆盖，没有未跟踪产品输入。相较完整Android11基准，只新增58/59两个明确检查，原有全部输入保留。

每平台freeze中的授权、HEAD、stage、文件行、aggregate、工具版本、7工具SHA、环境、OCR缓存身份、overlay/distribution补充清单和scope，与构建前/后、收集前/后的4份完整快照逐项相同，仅忽略时间戳。7个工具实际源文件SHA重新核对通过。这里验证的是冻结记录连续性；未重新执行工具版本命令或重新读取共享依赖缓存，不扩大为完整OS/SDK/传递依赖可重现性证明。

freeze-summary和root-review中的freeze原字节SHA与准确freeze一致，构建及collection均绑定同一freeze SHA；collection记录的buildResult文件bytes/SHA及nonce对应实际构建结果。输出隔离记录与result一致，源输出路径在命令前缺席，旧包与dist保留；generated-output JSON与result一致，build输出身份与保存产物一致。两平台前端dist四文件逐条相同。保存时间记录证实Mac构建/收集结束后才开始Android构建，没有以现有source目录的新包冒替首次产物。

Android构建日志中当前nonce的offline=true、workers=2、configurationCacheJvmProperty=false标记正好两条，未见配置缓存复用；临时init清理状态true。此为保存日志的静态复核，不是重新执行Gradle或操作缓存。

## Mac17现有产物

| 产物 | 字节 | SHA256 |
| --- | --- | --- |
| mac-original.zip | 5,048,846 | 4d8daac999103d94b8c3e9309957187db5a512540e64f42297c8d4b2bcde4e40 |
| mac-sealed.zip | 4,974,441 | 69ad925b7f44b9e2469f69a58061013d5c9382b87982a60b74481092c21a7487 |
| 原始可执行文件 | 16,743,520 | a2465b73611e99660e45330bdc9c490078ba885b96dade4c8944ce0051728c83 |
| 本地签名派生可执行文件 | 16,664,304 | b1edcf317019bb9443ab3fd745cbee79e70cda4ac3b7134e6833b42201b3f895 |

直接重算两bundle的所有文件bytes/SHA/mode、目录内完整文件集合、各ZIP自身及其每个bundle有效载荷成员均与collection一致；没有解压或修改文件。原bundle aggregate `b73cf5b8768a6f4c57c1922ccf0dbd815bbfe18ef010d0c6ce17d671291563ad`，派生aggregate `22fded832f77cb1f51c75f13eb33159347481c4ac84a785f9ffd8e8d200a9dcc`。

两份可执行文件Mach-O header均为thin arm64，Info.plist bundle ID为com.local.notesclone，plist原字节不变。派生签名只改变可执行文件和新增CodeResources，与收集记录的sealingChanges相符。原始包的linker adhoc签名严格verify退出1，Info.plist未绑定/资源未封，原错误已保留，独立只读复验同样退出1；不能把原包称为严格签名通过。独立复验派生包strict/deep退出0，display明确Signature=adhoc、TeamIdentifier未设置；只有本地adhoc有效，没有DeveloperID或公证/TCC/启动接受声明。

## Android12现有产物

原始APK `artifacts/unified-candidate06/android-recording-visual-build12/android-attempt01/android-original.apk`：**180,721,914字节**，SHA256 **533369f55e8fd927abbe9f5fff17468798db954566488b530d22c689253779f6**。直接重算文件及1066个ZIP普通文件的解压bytes/SHA/压缩大小，与collection的完整allZipEntries逐条一致；buildOutput、generated snapshot和preserved APK身份相符。

4个ELF共享库均为64位little-endian AArch64，ABI集合精确为`arm64-v8a`。25个OCR模型合计2,490,310字节，其包内实际bytes/SHA逐条等于freeze所记录的缓存AAR模型集合，也与collection一致；本次没有重新读取或运行共享缓存，没有据此宣称模型运行或首轮离线识别通过。

独立只读apksigner verify当前APK退出0，v2签名true。唯一签名证书SHA256为 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与收集记录和已冻结工具的candidate04预期证书相同；这是证书身份兼容，不是升级安装或数据兼容的设备验收。

## 独立执行与边界

`verify-build-identities.py`为独立只读复算器，`result.json`为完整结果，`readonly-commands.json`保存4个当前只读签名检查的argv/退出/输出。`supplemental-record-checks.json`补充输入覆盖与当前nonce日志验证；`source-record-index.json`保存60个准确源记录/工具/命令日志的身份，便于root整合时复查。

首轮复算已通过输入、Git对象、bundle/APK/模型/ABI和当前签名验证，但在末尾“全部tracked diff必须为空”的断言退出1。root同时授权更新六个README/INDEX/plan/task文档，HEAD仍fa21657，且未触冻结输入。`verify-build-identities-attempt01.py`和`attempt01-failure.txt`保留原检查与终端错误。修正为记录允许的docs/README变动并拒绝与352冻结输入相交后，第二次完成，输出和空stderr保留于attempt02文件。前后均为同六个文档差异，冻结输入交集为空；独审未改任何tracked文件。不将首轮文档并发断言误写成产品回归，也不隐藏它。

root随后新增的三个README与索引也已阅读及核对：三个索引的每条记录均与独立已验证身份相同，新增说明和索引本身加入source-record-index。大包身份复用刚完成的直接验证值，未因新增文档重复重算。详见root-indices-check.json。

本报告不覆盖另行开展的Mac运行时验证，不追认用户暂缓的Android设备验收；`ready=true`严格限于记录/包身份。最终结论为BUILD-IDENTITY-PASS，真实设备与活动录音及完整像素目标继续保持各自原有验收状态。
