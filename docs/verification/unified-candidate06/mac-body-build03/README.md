# Mac 普通正文尺寸候选包03

准确产品源码 `a90e55f484149be562b2aa8a6f6f298bd953c203`，包含此前已验收的侧栏直接恢复与动态菜单，以及普通段落13 CSS px受控候选。离线构建37.89秒，exit0；收集ready=true，238产品、302输入及工具/环境/补充输入前后一致。构建来源以input-freeze和根授权记录为准，后续文档提交不改变包来源。

当前可运行 [mac-sealed.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-body-build03/mac-attempt01/mac-sealed.app)，可执行16,013,344字节，SHA256 `b3c9013f48e6bbfbe466a9f0089e80b9fce9448a02074441bf3e97839c782587`；[mac-sealed.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-body-build03/mac-attempt01/mac-sealed.zip) 4,751,269字节，SHA256 `6a19c5a4f06bc7669540521c020eef5828a916ca543b4d7ab53d8fb6523c9dd1`。原始包可执行SHA af804b18e222471d287d5d0534bb59ad330a8f95ee4dcc37afa69366a3bf8d55；原ZIP SHA a244ca67d2c7075661d41c070eeb29f10192c0f4141f468900bc25638f1929bb，均原样保留。

封存时`git diff --cached --check`仅报告原始build.txt第31行末尾空白行（exit2）。这是保全的命令原始输出；未为通过格式检查改写日志或其已核验身份。

原始strict验签exit1（code has no resources but signature indicates they must be present），派生sealed的本地adhoc签名与strict验签exit0，CDHash `2cb98e26388e45b40079f18f8f42534ea3e40104`。不声称DeveloperID或公证。新包与ZIP完整payload、CRC、mode、身份及日志的 [929项独立核查](../mac-body-independent03/README.md) 通过；旧固定最终app/dist保存在本轮prior-outputs，未删除旧产物。

实际输入、正常退出重启、侧栏恢复与菜单文字见 [运行记录](../../mac-body-typography-runtime-01/README.md)；[同文局部几何](../../../research/mac-body-candidate06-geometry-01/README.md) 支持普通字形尺寸改善，但标点宽度和前几行垂直位置仍不一致。此包为继续校准的候选，不是像素验收完成版。Android保持原f18源candidate06 APK，没有把本Mac实验追认为已进入Android。
