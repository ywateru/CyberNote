# Smart U09 Mac 产物独立核查

**pass：准确 Mac 包来源、完整封存、允许签名差异和派生 adhoc 严格验签。** 无安装/运行/持久化/原生输入/像素或 Android 验收。详细报告见 `../../../plan/reviews/mac-smart-u-independent09.md`。

源 HEAD `7ab867d416f48ea23913907c87fd6d058833e1cb`，301 产品路径与已独审 fix13 `8e8fe7e320e34a2b9c27bf7c7e794662ad988da4` git tree 完全相同。产品 aggregate `b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897`；320 项输入 aggregate `abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6`；freeze SHA `33d823170db2ed0685ccdbd26af6a0cd459dcc124d73f409aa28fec08c658561`。

| 文件 | 用途 |
| --- | --- |
| `input-manifest.json` | 核查开始固定 38 项作者记录、旧输出及完整 app/ZIP/命令日志，结束逐项不变 |
| `fresh-signature-checks.json` | 全新只读 codesign/file 六命令；原件 strict exit1 保留、派生 strict exit0；adhoc/identifier/arm64 展示 |
| `verify.py` / `result.json` | 1,056 项身份与完整性断言通过；固定来源、四次输入快照、当前320输入、301固定blob、工具hash、nonce、旧输出权限/inode、两完整app与两ZIP、允许差异、日志链、当前dist |
| `verify.fixture01.py` / `attempt01.*` | 首次 reviewer 适配保留的错误：最终 evidence 列表误含旧批 delivery-manifest 文件名；完整 exception/脚本保留，无产物更改 |
| `attempt02.*` | 删除不适用的最终证据引用后的成功执行记录；所有核心核查断言保留，exit0 |
| `evidence-index.json` | 本轮独立目录文件封存清单 |

完整实物位于 `artifacts/unified-candidate06/mac-smart-u-build09/mac-attempt01/`。两个 ZIP 完整 payload 与各自 app 字节/hash/mode 一致，无重复 entry 且 CRC 正确；原 app 未被派生签名覆盖。

| 关键实物 | SHA-256 |
| --- | --- |
| 原始完整 ZIP | `d935f86ab7d25c95b953fe70c6bf4c883b1837198a6006067f86d899228c8adb` |
| 原始可执行 | `33c5635855372ec7f8fe6c6110d813366b645335b259bff549d5b6e55e1262a5` |
| 派生完整 ZIP | `02d51696b6d350847835ec596e244c526074c4d3793e2d494dc3b0e51ae8a663` |
| 派生可执行 | `32613a70664293b214b1713293a3744570b0c13f1f37ce588267a5b162842191` |

原 strict exit1 为 canonical 双包保留流程明确记录的结果，不称为原件签名通过；派生签名 exit0 仅本地 adhoc，无 DeveloperID/公证。未独立反解可执行内压缩前端资源；构建输入范围是显式列出的输入及身份快照，不是完整 OS/SDK/传递依赖可复现性。

只读核查，未执行构建/测试/签名/启动，未写 target/cache/产品/工具，未 GUI/安装/ADB/用户库/原版删除，未 stage/commit。Android offlineMarkerMissing 失败状态不受本报告影响。**STOP，target/cache 已释放。**
