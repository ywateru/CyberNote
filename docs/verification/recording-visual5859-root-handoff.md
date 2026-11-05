# 录音界面58/59：Mac17与Android12根交接

2026-11-05。产品准确源 `fa21657bc116431324d85b18fcbe9e1d328471fb`；其后本交接仅记录构建、原生有限运行和当前文档，不改变产品源。完整用户目标继续active，未将局部进展标为全部功能或像素完成。

## 接收范围

- 58源8a305475、59源99dbb95已由不同作者独审后合入，保持原50/55同会话、原笔记所有权和57手机保存边界。受控视图结论为SOURCE-READY / PIXEL-OPEN，未替代原生设备验收。
- Mac17/Android12串行构建和收集完成，333产品及352完整输入逐项相同。不同作者[构建身份独审](unified-candidate06/recording-visual5859-independent/README.md)为BUILD-IDENTITY-PASS，独立索引SHA256 `d04abccbbead3b490cf00fe3b57c5a076f9d0dd69df2da37263c789d80d8cbe6`。各平台冻结、失败、派生及来源限制见[准备说明](unified-candidate06/recording-visual5859-preparation/README.md)。
- Mac17由Computer Use正常打开，有限检查未开始收音时的独立窗/右栏同会话、正文编辑与恢复、切换B搜索、文件夹显隐恢复和保存音频播放/暂停/±15秒。[作者记录](recording-visual5859-mac17-runtime/README.md)与[独立证据审查](recording-visual5859-mac17-runtime/independent-review.md)区分实际操作叙述、归档端点和内部未知。作者18文件身份保持，独立索引SHA256 `b7d15a5cca2604442ca8d22bd3dbcc62fb32d390840ae1cd616728accc8d0403`。独立结论LIMITED EVIDENCE ACCEPT / ACTIVE-CAPTURE OPEN / PIXEL-OPEN。

## 本机产物

| 平台 | 文件 | SHA256 |
| --- | --- | --- |
| Mac17 ZIP | artifacts/unified-candidate06/mac-recording-visual-build17/mac-attempt01/mac-sealed.zip | 69ad925b7f44b9e2469f69a58061013d5c9382b87982a60b74481092c21a7487 |
| Mac17可执行 | 同目录mac-sealed.app/Contents/MacOS/notes-clone | b1edcf317019bb9443ab3fd745cbee79e70cda4ac3b7134e6833b42201b3f895 |
| Android构建12 APK | artifacts/unified-candidate06/android-recording-visual-build12/android-attempt01/android-original.apk | 533369f55e8fd927abbe9f5fff17468798db954566488b530d22c689253779f6 |

Mac为arm64本地adhoc派生签名，原始包strict失败与原字节保留；派生strict/deep通过，无DeveloperID、公证或TCC结论。Android为arm64-v8a debug/v2签名，未安装。各端完整来源、ZIP/模型/签名与身份见各自构建说明，不以产物存在判定运行完成。

## 保留与后续

用户明确“保留当前现场，暂不继续手机设备验收”。原Android构建10的13秒未保存File没有备份、安装、关闭、停止、重启、播放或导出操作，不再次请求此前本地备份。原版删除/恢复实验继续暂停。原用户录屏及桌面截图原件、旧包、失败证据和工作树均保持。

Mac此前新Start授权请求无返回仍开放，本包未重复Start；不重设TCC或降低签名安全要求。新包持续收音时进行双模式切换、编辑/搜索并保存回原A的原生验收仍未通过。保存音频44:58只是已显示时长，未解码或试听其有效性；本轮最终暂停在137.7秒，±15端点为137.7→122.7→137.7。完整像素、字体/材质和手机波形等残差保留；[手机波形60准备](../research/mobile-recording-wave60-readiness/README.md)仅只读测量，尚未实施。整体目标不标complete，也不因手机子项暂停而暂停全部开发。

本次封存只新增/更新README与docs，无产品变更，不重复原生构建或视图测试。版本差异空白检查仅在两份原始build.txt报告AGP原日志尾随空格和末尾空行，按原始证据不改写；排除这两份原始日志后的其余差异检查通过。
