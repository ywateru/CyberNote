# Candidate06 Android 独立字节与来源核验 01

结论：**PASS，仅限当前保全 APK 字节、证书身份与既有来源/签名/模型记录的独立核对**。2026-11-04，准确源码 `f18da0ccf8bb6e131e80e22b9752f0df2725245d`，freeze SHA-256 `ac195fb61c62be15ccc653716ad9691f5d8cdaf6bdacce7dc5f82e3f54bc6d1e`。

本次只读取显式源码输入、冻结/构建/收集记录、保全 APK 及 candidate04 对照证据。没有执行构建、签名、apksigner、安装、设备或 GUI 命令，没有读取 target/cache，没有 Git 提交；仅在本目录新增证据。ZIP 内容内存读取，不解压写出。没有重新运行版本命令。

## 结果

- 当前 freeze、build result、collection result 的 SHA-256 分别准确等于指定身份。授权、源码 SHA、Android stage、产品/完整输入 aggregate、attempt、nonce 与构建命令相互吻合。当前 301 个完整输入、238 个产品文件及 6 个工具逐项等于 freeze；238 个产品文件同时等于准确源码提交中的 Git blob。构建前后、收集前后四份输入记录逐字段相等（只排除采集时间）。
- 构建记录 `pnpm android:build --debug` exit 0，自有进程组确认停止、活成员为空，全部输入门及 supplemental 门通过，没有停止/清理/失效错误。原始日志含 `CANDIDATE06_OFFLINE=true`、APK 完成信息，没有 `Downloading`。临时 offline init 的历史创建和清理身份一致，记录已清理。本次不访问其缓存位置确认当前状态。
- output-isolation/generated-outputs JSON 逐项等于构建结果；当前保全 APK 的身份等于 generated snapshot、buildOutputIdentity 和 collector 的原 APK 身份。本次不重新访问 target 中的原 APK、dist 或 prior-outputs；保留原 collector 的历史来源门结论。
- 当前保全 APK 为 **177,445,114 字节**，SHA-256 **`d773e08fd76ba5bbb8e77be9acbfe6e42159bd4efea6674c1af03aae66fecfc4`**。其全部 1,066 个 ZIP 文件条目无重名、读取 CRC 通过，解压字节数、压缩字节数及 SHA-256 与 collector 的完整清单逐项相等。ABI 为且仅为 `arm64-v8a`。
- 当前 APK 内 25 个 OCR 模型逐项等于 freeze 中 AAR 模型记录的路径、字节和 SHA-256，也等于 candidate04 模型记录；总计 **2,490,310 字节**。这是对冻结 AAR 记录的比较，没有读取当前缓存 AAR，也不授予设备离线 OCR 通过。
- 原始 apksigner 日志逐字等于 collector signature/stdout；命令、APK 路径、exit 0、自有组清理和 v2 验证通过记录均吻合。直接解析**当前 APK** 的 v2 signing block，提取单签名者证书 DER 并计算 SHA-256，结果等于日志与 collector 的证书摘要。
- 独立读取当前 candidate04 保全 APK，先确认其完整 304,110,831 字节、SHA-256 `bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2` 与安装前原始证据相等，再从其 v2 signing block 提取证书。candidate04 与 candidate06 当前证书 DER 的摘要一致，为 **`e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`**，与两份既有 apksigner 记录一致。此处确认相同证书身份，不代替实际升级安装及数据保留验证。

构建结果 SHA-256：`2fe9158f4351c702966eab89934a3202e8bfc4ffd7843a7134af66dedf29a856`；收集结果 SHA-256：`475243da98ca206e52a4868df0cbbfd7b135da606bff6875932a34bc4cd55e64`。

产品 aggregate：`f409cc270772c6ff8a66e6a92576cae8b375409ff40619ebfbb44566f286526c`；完整输入 aggregate：`4d52edcb2c2851105ede8fa0399ba2dd10f6e0e2af93bb1bc7d77afc580fa301`。

## 证据与边界

`verify.py` 独立检查程序实际单次 exit 0，878 个逐文件和记录断言全部通过；这些不是 878 个功能测试。`command.json` 保存实际调用结果；`result.json` 保存断言、模型完整清单、当前两 APK 的 signing block/证书身份及 14 份来源证据身份。原始完整 ZIP 清单以 collector result 的准确 SHA 绑定，未重复复制。剩余空间高于 2 GiB。

证书 DER 解析是身份读取，没有重新做密码学签名验证。本次 apksigner 结论严格限定为：既有验证成功结果与原始日志相等，并且该验证绑定的 APK 字节目前未改变。结果不授予设备安装/升级、数据保留、运行、首次离线 OCR、原生输入、录音、iOS 或像素验收。
