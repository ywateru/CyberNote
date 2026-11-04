# Candidate06 Mac 独立字节与来源核验 01

结论：**PASS，仅限保全产物当前字节与既有来源/签名记录的独立核对**。2026-11-04，准确产品源码 `f18da0ccf8bb6e131e80e22b9752f0df2725245d`，freeze SHA-256 `2649fdde61015113a7984fa67176262fc438634ec6b84bc45264ce364bc45dce`。

本次没有执行平台构建、签名、codesign 验证或启动命令，没有读取 target/cache，没有使用 GUI。只读取冻结输入、构建及收集记录、保全的两份完整 app/ZIP 和原始命令日志；只向本目录新增证据。root 同时操作 sealed 应用的运行界面，用户目录和 GUI 状态不属于本次产物字节比较范围。

## 核验结果

- 冻结文件当前字节、授权、构建/收集的源 SHA、Mac stage、freeze、产品/完整输入 aggregate、attempt nonce 全部吻合。当前 301 个显式输入与冻结记录相等，当前 238 个产品文件同时与准确源码提交中的 Git blob 身份相等；6 个构建工具字节与冻结记录相等。
- 构建记录为 `pnpm mac:build`、exit 0、自有进程组已清理、活成员为空，输入比对和 supplemental 输入门均通过，没有停止/清理/失效错误。构建日志包含实际编译及 app bundling 完成。收集记录 ready=true，构建结果文件的字节及 SHA 与 collector 引用相等。构建前后和收集前后四份输入记录均逐字段等于 freeze（仅排除采集时间）。
- output-isolation/generated-outputs JSON 与构建结果相等。保全原件的完整文件清单与构建结果、generated app 文件快照一致。本核验不重新读取 target/dist 或 prior-outputs；这些位置在原始 collector 的来源门中检查，本次不将历史检查升级为当前重新检查。
- 当前两份 app 的完整文件清单、权限、字节、SHA-256、bundle aggregate 与收集结果相等。两个 ZIP 的完整字节/SHA 相等、无重名、CRC 全通过；内存读取 ZIP 内所有 app payload 文件的字节及权限与当前对应 app 相等。ZIP 中 `__MACOSX` 元数据被保留在原始 ZIP 字节身份和条目清单中，不计作 app payload。
- 13 份原始命令日志逐字等于收集记录中的 stdout。所有命令组清理确认；只有原件 strict 检查 exit 1，其余命令 exit 0。原件 strict 原始错误为 `code has no resources but signature indicates they must be present`，如实保留，**不记为通过**。sealed 副本独立 ad-hoc 签名后既有 strict 记录 exit 0，日志包含 valid on disk 与 satisfies its Designated Requirement。
- 原件与 sealed 当前差异逐项等于 sealingChanges，仅可执行文件和新增 `Contents/_CodeSignature/CodeResources`。Info.plist 字节相同。原件未被 sealed 签名替换。

| 当前保全文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| original executable | 16,065,840 | `13ed667bc74397676d555ef7d43252eba0ec02da8502e08dcd2bc34b33dc9077` |
| sealed executable | 15,990,560 | `152ad9e5f9fe0bc6eeab2f08bb6980b2610884ec8b43f9610ad4bc0d883f7f6c` |
| original ZIP | 4,818,155 | `f92a44f0ef5874990319625dd421f9980c61fefae3a79d5fe62fecfcddd16668` |
| sealed ZIP | 4,747,762 | `b7f601d5ad96500029216ca4b315efc31e00a5509d55580b70148c782e437505` |

产品 aggregate：`f409cc270772c6ff8a66e6a92576cae8b375409ff40619ebfbb44566f286526c`；完整输入 aggregate：`4d52edcb2c2851105ede8fa0399ba2dd10f6e0e2af93bb1bc7d77afc580fa301`。

## 证据与边界

`verify.py` 为独立、只读核验程序；单次运行 exit 0，922 个逐文件/记录断言全部通过，**不是 922 个产品功能测试**。`command.json` 保存实际调用结果，`result.json` 保存逐项断言、当前完整 app 清单、ZIP 清单及 24 份来源证据身份。剩余空间高于 2 GiB。

本次签名结论严格限定为：既有 strict 命令结果与原始日志相等，且相应签名字节目前未改变；没有重新运行 codesign。此结果不授予 Developer ID、公证、TCC、启动、持久化、侧栏交互、Android、iOS 或像素级验收。后续 root 的运行验证应独立绑定准确 sealed executable 身份。
