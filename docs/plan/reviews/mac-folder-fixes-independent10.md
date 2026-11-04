# Mac folder fixes package10 — independent review

2026-11-05（本地日期）：**PASS / STOP**。本轮准确 Mac10 包门槛通过，470 项检查无失败；仅交回 root 实际运行验收，不代表 UI、重启持久化或原版像素通过。

源码身份 `de372d31e0578a7f2619413c0abde6a8439bb3c6`，freeze `fe317d0ab73b237370e50f48d3c681b2927b47efc69ca77353da5141660d9a87`。九字段授权、root 冻结复核、构建/收集结果及四份完整前后快照一致。320 个明列输入和 301 个产品文件逐字节复核，聚合一致，结束时仍保持；39 个本轮作者/产物证据文件初末相同。按本轮禁 Git 约束，没有独立读取提交对象，source ID 的证明限于上述固定记录链和当前精确字节。

完整原 bundle、派生 bundle、两份 ZIP 的全部载荷、CRC/hash/mode 与收集记录一致。sealed ZIP 4,866,538 字节，SHA256 `6961ea84ef4f9c047a72c119f3417218400a0beaa2bda6d42beef05351b4dc29`；派生可执行 SHA256 `56742e3842b3e3aca03a3bbd3f7fed92f017d5446578334dd7a6cf1b861e1d67`。bundle 差异只有可执行和新增 CodeResources；独立解析 arm64 Mach-O，签名均位于尾部、起点相同，移除签名区并归一化 LINKEDIT 大小与 LC_CODE_SIGNATURE 长度后，其余 16,248,496 字节精确相同。没有运行签写。

新执行 codesign --verify --deep --strict：原 linker adhoc 原件 exit1 的资源封装失败如实保留，派生件 exit0 且 valid on disk；fresh display 确认 com.local.notesclone、adhoc、arm64。旧 Mac09 输出完整保全，旧/新 inode 29381671/29435387 不同。Mac 本轮 dist 随后被 Android 构建原子保全，其完整身份仍匹配；构建和收集全部已记录进程组当前无残留。

独立首次检查因误用早于 offline14 的 Mac09 工具清单作为全相同基线而失败，是夹具前提错误，不是产品/包失败。首次脚本、失败、日志及输入记录均保留；修正为当前准确冻结的 7 个 canonical 工具后，attempt02 全通过。未改产品或 canonical 工具。

证据：docs/verification/unified-candidate06/mac-folder-fixes-independent10/。未构建、启动、GUI/ADB、设备、数据库、下载、Git 或遍历/清理共享缓存；只读记录中的准确最终产物路径。缓存/SDK 环境采用冻结前后记录，未重探共享缓存；嵌入压缩前端未独立解包重建。无 DeveloperID、公证或运行/像素结论。资源释放 STOP。
