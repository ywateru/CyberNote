# Mac25准确本地构建

构建源码 head `2709aa55`（产品最终 `ad3a069f`）。`CARGO_NET_OFFLINE=true pnpm mac:build`自然退出0，完整42.634s，291项跟踪输入前后相同。准确manifest、命令、wall和SHA见[result.json](result.json)，完整原始日志与驱动同目录保留。

原构建 app 完整保存在 `artifacts/ui-hierarchy8081/mac-original.app`。原 app strict codesign自然exit1，未将该结果记作通过。交付副本采用本机 ad-hoc 重新签名，strict/deep验证自然0；只有可执行签名与CodeResources可变，原件输入未变。ZIP使用该交付副本，原前端dist单独冻结在mac-dist供独立核包。此为arm64本地开发包，未公证、未安装或启动，不是实包像素/OS运行验收。

- [Mac25 ZIP](../../../../artifacts/ui-hierarchy8081/备忘录-Mac25.zip)
- [交付应用](../../../../artifacts/ui-hierarchy8081/备忘录.app)
- ZIP SHA256：`a097dfcd27bddac55af23d31f4a79065c3a4f4ebe840f5116689780fe7ef60a2`
