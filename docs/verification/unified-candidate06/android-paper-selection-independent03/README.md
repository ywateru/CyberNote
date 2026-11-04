# Android paper selection build03：独立准确产物检查

结论：**PASS，且在任何ADB/安装之前完成source/assets/APK/certificate门槛。** Source `093986d170ef279fbce0f66e59891fd5f94aecad`，freeze SHA256 `39190998b264a76345eebe66bcd39642ff4c512f1422ec65b88399b644369d9d`，root authorization SHA256 `68edde9e7ae7d605879914c5312c71012ddbb4662170545a1906a6d6f6dbe8bc`。准确产物是 `artifacts/unified-candidate06/android-paper-selection-build03/android-attempt01/android-original.apk`，177,445,114 bytes，SHA256 `d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c`。

`verify.py`只把已封口recovery02独核工具的准确路径/HEAD/freeze/APK/结果SHA/aggregate切换到root本次明确授权，并添加authorization SHA断言；原5份recovery02工具目录保持。`adaptation.json`记录变换。独立实际执行一次，882项通过，result SHA256 `2c785ab7fa242e769e0ff88b82792378268cee29d1f78c136f0bf01d60e31b4d`。

302份完整输入、238产品、5工具与冻结身份一致；238产品逐项核准确source Git blob；product aggregate `c888cc902f9f05da636c827c2b030200732967bcfd4fb52743000e877333bc60`，完整输入aggregate `aa8a862312b923f56bb4046dbacd780175a79bf080991647a38e5d121392ea28`。四份build/collection前后快照、nonce、离线标记、退出/清理门槛、生成输出/收集身份均闭环。关闭时302输入再次核过，artifact-gate.json在root结束freeze前完成；之后root获准推进桌面修改，不再依赖共享HEAD保持原值。

APK全部1066 ZIP成员重新读取，CRC/大小/压缩大小/hash与collection相同，无重名；ABI仅arm64-v8a。25个OCR模型共2,490,310bytes与冻结AAR记录及旧candidate04模型记录一致，不读当前构建缓存，不表示OCR运行通过。当前APK v2签名块证书DER独立解析，与旧准确包和记录一致。

此外 `signature-verify.json` 是**本轮新执行** apksigner verify --verbose --print-certs，exit0、v2 true，证书SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。这补充了882检查中“直接证书DER+已有验证日志”的边界，没有仅复用旧签名结果。

包内Web资源另直接从已签名APK的 `lib/arm64-v8a/libnotes_clone_lib.so` 解压Brotli流：

| 资源 | 完整解压后SHA256 | 对应构建记录 |
| --- | --- | --- |
| CSS 57,388bytes | f656b0340a3276cbcaf91518468dda58a1396ae002b94398991e4f6d9a893ebe | 逐字节相同 |
| JS 936,869bytes | 7360fb711564032aaa66f1259d738e502369e051ecd971278049ded74e3c7fa6 | 逐字节相同 |
| HTML 478bytes | 8e45ecd828bf323df3aceeb31c7a6fb5d6ff745dbfac5f010e60518fdf63278a | 编译器序列化后结构相同 |

HTML与dist的498bytes不同：doctype大小写、空白、void tag、crossorigin空属性序列化；用标准HTMLParser归一化后的全部开始/结束tag、属性、非空白文本和doctype token逐项相同，引用准确本轮CSS/JS。不是把HTML说成字节相同。`artifact-gate.json`记录规范token和PASS门槛；`extracted-assets/`保留解压字节。`verify-embedded-assets.mjs`与各probe日志保留读取方法。最初明文查找/重压字节匹配没有命中，随后直接Brotli解压成功；第一次embedded-assets-audit.json对HTML字节要求显示INCOMPLETE，最终canonical比较明确处理序列化差异，没有覆盖该原始记录。

此目录不运行build、不下载/升级、不操作target/cache，不注入WebView，不读数据库，无产品/旧证据/共享index修改、stage或commit。设备验收单列于 `docs/verification/android-paper-selection-runtime03/`，此产物PASS本身不授予手机行为或Apple像素一致。所有本目录检查结束，manifest封口后不再写入。
