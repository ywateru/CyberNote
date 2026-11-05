# Mac18 read-only independent package audit

结论：PASS。只读独立核包绑定源 `8022407f0b827a564fa64f693b5c7e7f6220b42e` 与freeze SHA256 `469c75c5817f1f8e7197e5074257dc8b38ae209ae1eef9339614ca353285efa5`。证据与runner位于本目录，独立索引只覆盖本次核包，不改动原64的32项历史索引。

核查对象是root的 `docs/verification/unified-candidate06/mac-recording-autosave-build18/mac-attempt01` 和对应 `artifacts/unified-candidate06/mac-recording-autosave-build18/mac-attempt01`，没有使用Mac17代替。

- 独立重算353项产品聚合 `8b4557edcc8d18a3144cea44f4437cfcb70d9956c95670ed39603ebf0bc48d95`、374项完整输入聚合 `8de71e6d7ff91118bdd1c69b7b54bce42000cbde9a56632210fa1463d31ecb15`，确认四份build/collection前后快照除时间外与freeze完全相同；374项当前实际字节均与freeze相同。355项Git tracked输入也与准确source commit字节相同，19项pnpm/Android生成input-only字节单独列出。7个冻结工具当前字节亦匹配。
- 89个 `src` 和 `src-tauri/src` 产品文件与独审测试源367逐字节相同。成功核查起止root均为证据提交 `0633b0ec48ec6720b4140ca2e51c6196f82d649a`；与802的差异仅为文档证据路径，未将证据提交误称为新的产品源。
- build exit0、nonce与collection绑定，build-result自身SHA匹配。原app/dist在构建前隔离，旧输出仍在prior-outputs且字节未变；新生成原app与collected original逐文件同，新原executable与被保留的旧产物不同。两个完整zip均检查无重复entry，包内全部文件字节匹配完整bundle，未解包到产品目录。
- 独立重新读取两个app的签名。原包strict再次exit1，原因仍为“code has no resources but signature indicates they must be present”，失败保留；sealed派生包strict再次exit0，identifier `com.local.notesclone`，本地adhoc，CDHash `f0f493c3b0e99196daa5aeba6dbe2e8b65504086`。collection记录仅一次签名变更；本轮只执行display/verify，没有签名。
- 独立解析Mach-O并比较37个section，签名前后逐字节一致；bundle差异只限可执行文件签名与新增CodeResources。核查前后两个app逐文件大小/模式/哈希相同，两个zip哈希不变。

| Mac18 sealed identity | Value |
| --- | --- |
| ZIP SHA256 | `b0e589cc33c63eedede792452365f0d1ca3f5c3205b8410aeea723f4c2dfb3a1` |
| ZIP bytes | 5,007,062 |
| Executable SHA256 | `20c8f1d9735653cd782df9088b35d0d487cfc431242f50a86b9776b78e96a238` |
| Executable bytes | 16,691,568 |
| CDHash | `f0f493c3b0e99196daa5aeba6dbe2e8b65504086` |

初次runner错误地要求全部374输入均tracked，在pnpm生成依赖处停止；没有触及artifact或codesign阶段。修正为全部374比当前字节、仅355 tracked比source commit，随后核查通过。此独审宿主假设及修正记录于reviewer-attempts.json，不是产品失败。所有实际只读codesign stdout/stderr原样保留。

本轮不构建、不占native编译槽，不运行GUI、设备、麦克风、音频导出，不修改产品、产物、签名或权限。源与包身份核查不能替代Mac18现场录音持久化、WebKit、权限、双窗口或像素验收。原包strict失败不隐瞒，sealed仅本地adhoc，不宣称Developer ID或公证；冻结范围也不等于全部OS/SDK/传递依赖可复现。
