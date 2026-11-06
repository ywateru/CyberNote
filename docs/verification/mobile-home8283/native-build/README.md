# Mac26准确本地构建

冻结构建HEAD `1f735ebe4881399699b6ba769e29f82a52278e7c`，293项跟踪输入before/after逐项一致。`pnpm mac:build`自然exit0，完整该命令wall 18.602s。原始构建app已复制为artifacts/mobile-home8283/mac-original.app，原strict验签exit1保留；没有覆盖或追认为成功。

交付副本备忘录.app单独做本地ad-hoc重签，`codesign --verify --deep --strict`自然0。签名只改变可执行文件与_CodeSignature/CodeResources，资源及原件保持不变。未做开发者公证、安装或运行。

[Mac26 ZIP](../../../../artifacts/mobile-home8283/备忘录-Mac26.zip)，5066010字节，SHA256 `799ff1907dc5c692e29fc6d72bd08898a3e6dd7010a3fa364717265bada2e903`。同目录mac-dist保存准确前端快照。完整命令、输入、原/派生文件清单和退出值在[result.json](result.json)及逐项日志；独立核包另见[报告](../native-independent/README.md)。
