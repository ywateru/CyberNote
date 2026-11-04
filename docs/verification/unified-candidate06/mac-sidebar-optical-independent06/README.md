# Mac sidebar optical06 精确产物独立核验

实际执行 `verify.py`，**975/975 PASS**，进程 exit0、stderr 空。核验只读取固定源码、冻结材料、保存的原始日志、应用和 ZIP；没有运行构建、签名、签名验证或启动程序，没有读取 target/cache，也没有修改 HEAD、冻结输入或作者材料。

源码提交为 `09fee3ec05dcf3be22037e0a842ea6d2df275cff`；root 授权 SHA256 `76537ad40ba7171f48513e1debeb539dff36e8580d26c05731afc2b582ca775b`；input-freeze SHA256 `739e4028d29874e2dedd6d578342b700fffc7d9554d3e1aced4b7dc50c7c378a`。238 项产品文件与提交 blob 精确一致，汇总 `3ae36caf283a87e0e661b535bdffe7352af9d6b989c913c19c70bdafca298041`；302 项完整输入现值与冻结记录一致，汇总 `3093bdb667ef8458c7d3f15f1f89118ec68ad77f6b0249eabb751bf41d8a207d`。

准确构建记录为 `mac-sidebar-optical-build06/mac-attempt01/result.json`，SHA256 `e218be54ce5b7b53d5fd68f3394d6a5cc3f46cd22d90654d60febf1e806fd90b`；collection result SHA256 `88fe5d00bf1c34102f64cf7514540b80ac1df62f86be97db0ee54702959c82aa`。记录中的实际命令为 `pnpm mac:build`，exit0、37.921秒；输出隔离、新生成输出、四份前后输入快照、nonce、收集记录和原始构建日志均已关联。

| 保存产物 | 字节数 | SHA256 |
|---|---:|---|
| mac-original.app 可执行文件 | 16,090,480 | `d0f43257222db608608e20c2e07868c85200e1f5e3a75212d7e5cedcbfccee88` |
| mac-original.zip | 4,823,521 | `8be164891f3bc50066f32c739a86d59601d004022cf8874bbdce3c233f337bfb` |
| mac-sealed.app 可执行文件 | 16,015,072 | `f69b9e3856ebb62ee64c6547d55a420762a31e58ab3b9244391981fff239f8bf` |
| mac-sealed.zip | 4,753,057 | `56907af1d0b13ee6807a4236f67644a83b41b2baacf77744ae4931627184447c` |

两个完整 bundle 的文件、权限与 aggregate 均匹配收集记录；ZIP 无重复成员、CRC 通过，内存读取的完整 payload 与对应 bundle 相同，没有解压文件。原始 bundle 与实际新生成输出记录一致；原始包和 sealed 包只有记录中的可执行文件与 CodeResources 封装变化。

先读取实际06记录的13条命令及退出序列，再按精确计数替换05独立脚本的路径、提交和固定身份；替换与有限附加检查记录于 adaptation.json。05脚本 SHA256 `a912df32fc7d9bd09be6b2d55bbc59ccb5bfd0c8c7a599f8976a155bd5616c58` 保持原样。06实际退出序列为 `0,0,0,0,0,1,0,0,0,0,0,0,0`：第6条原始包严格验证失败原文保留；第8条保存的本地 adhoc 封装成功；第9条 sealed 包严格验证成功。对应精确 argv、日志路径、原始 stdout、受管进程组停止与无剩余成员全部核对。这里复核的是既存结果与准确字节的关联，不能冒称本次重新执行 codesign 验证。

作者 delivery-manifest SHA256 `82385d8309312bc59d08d319adc22ee780b74c2ef9dc129edf9e950d00fc61c7`，37项文件逐项匹配、source/attempt/nonce 相同，汇总 `e1e3b4c257f45a13a0a61942c5a49b1fe3d3df31a508d65653e33c1153d0b68e`。独立结果 result.json SHA256 `e06670a5e85b29c20e9b96c57d058ac83a554cf7bbb39059d2a226cda635a51a`，verify.py SHA256 `20a542e9747a4e83e991edc9a8f5a348cb524773f7ef4e116742ae9139d842b2`。

核验通过支持后续 root 使用 `artifacts/unified-candidate06/mac-sidebar-optical-build06/mac-attempt01/mac-sealed.app` 进行真实窗口比对；不构成用户目录/持久化/TCC、Developer ID、公证、Android 或像素验收。期间没有新的06 GUI证据，界面结果应另行保存和测量。
