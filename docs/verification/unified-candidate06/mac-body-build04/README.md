# Mac body build04 准确包交付

2026-11-04。`mac-attempt01` 构建退出0，收集退出0，`ready=true`；不同作者对已保全包、源码和签名记录的独立核对929项全部通过。本说明只汇总既有材料，没有重建、重签名、重测或启动应用。ready与独审结论限定于包字节和所保存来源证据；原版正文几何、输入与像素验收另由root处理。

## 准确来源与产物

- source HEAD：`62244d445b19321a3fe773ffa074563c56970595`。
- 产品238项，聚合：`560f9826b44320f184493f8f522a2cfefaf78a7e4e7c1faad8fa001e1190583d`。
- 完整输入302项，聚合：`2131ac2abe616b6599b2f7c77665ec095874b2c37cbb2e8be2b5450e4dcffc3f`。
- 冻结SHA256：`0d3917a81a90ff6ad41d44df534bf77002bf9db9e929c2dc598c60f6e10a0f2c`。
- 固定构建命令：`pnpm mac:build`，耗时53.898秒；本轮nonce：`73025aa6222a4f78bf0af29730a7401e`。

交付使用本次保全的 [mac-sealed.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-body-build04/mac-attempt01/mac-sealed.app) 或 [mac-sealed.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-body-build04/mac-attempt01/mac-sealed.zip)。原件分别保全为 [mac-original.app](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-body-build04/mac-attempt01/mac-original.app)、[mac-original.zip](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-body-build04/mac-attempt01/mac-original.zip)，与签名副本明确区分，不依赖之后可能被替换的target输出路径。

| 产物 | 字节数 | SHA256 |
|---|---:|---|
| 原始主程序 | 16,088,752 | `5d141e371059a1e21b40fc5ddb95e659513223a22a7eb28fe523e072b2ffd66b` |
| 原始ZIP | 4,821,851 | `c5c49145a02f50af7577b6d7ebc9e9d165df2af52698b310dee54693ed6c0a4e` |
| 签名副本主程序 | 16,013,344 | `db92182330f81f0adfef38d5a9a103e705f166c27c3ff5d3578a8a0e0df85a8e` |
| 签名副本ZIP | 4,751,359 | `8410de42fa8dc5aa3da0e64a1a45c976563c537eb6506ea6ac4ed5a904534f46` |

原件bundle聚合为 `8e71fa595de2337d51085895c688231d0785abb3081a8679a0ebc47584c8a064`；签名副本bundle聚合为 `834e2f07087e548d21e9c4de33e653da21d371be937623833fe8aafef4925104`。各文件完整清单保存在收集结果内。

## 签名与保全边界

原包linker adhoc签名的strict校验退出1，原始错误为 `code has no resources but signature indicates they must be present`，该事实与原件均保留。另复制完整原包后生成本地adhoc签名副本，收集时deep/strict验证退出0。副本仅主程序和CodeResources变化，Info.plist保持相同，原件未变。

这是本地adhoc签名，**没有Developer ID或Apple公证**，没有由本次构建/收集证明TCC、启动、原生输入、存储恢复或UI像素一致。不同作者独审是将现存签名日志与准确包字节相连，没有重新执行codesign或启动应用。

工具在固定输出路径原子rename保全旧包/旧dist，记录源路径在构建前为空，再核本次生成身份。完整输入与补充资源在构建和收集前后均一致，构建最低可用空间77,346,566,144字节。既有freeze-summary的FROZEN ONLY保留其冻结阶段原始状态；本轮后续授权、成功构建、收集和独审记录共同构成交付来源。

## 证据入口

- [准确root授权](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/root-authorization-mac-body-build04.json)、[输入冻结](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-build04/input-freeze.json)、[冻结摘要](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-build04/freeze-summary.json)。
- [原始构建日志](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-build04/mac-attempt01/build.txt)、[构建结果](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-build04/mac-attempt01/result.json)（SHA256 `da5715bae1b9eb75f1d3d78b022855f38f904c5a7ee567d036b44782d4726276`）。
- [输出隔离](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-build04/mac-attempt01/output-isolation.json)、[新生成输出身份](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-build04/mac-attempt01/generated-outputs.json)、[收集结果](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-build04/mac-attempt01/collection/result.json)（SHA256 `87a04f899bb6df8909001b5a7a65c7fb007f445965261bdc9fd483ea36318bf9`）。构建与收集前后的完整输入记录保留在同一attempt目录。
- [不同作者独审说明](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-independent04/README.md)、[独审结果](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-independent04/result.json)（929/929，SHA256 `366f83974a685f9b88003be90a04a7e2ed34c24461a5e691b07c94b7f9f34ccb`）、[独审执行记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-body-independent04/command.json)。

本README新建于包收集和独审之后，仅为准确交付索引；没有修改旧manifest、freeze、原始日志、结果或独审材料。
