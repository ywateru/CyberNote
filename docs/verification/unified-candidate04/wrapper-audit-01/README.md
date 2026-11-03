# Wrapper 离线复用审计

实际 wrapper JAR SHA-256：`497c8c2a7e5031f6aa847f88104aa80a93532ec32ee17bdb8d1d2f67a194a9c7`。REA 静态归档 Evidence：`ev_2b9247b8a461faba2bd69b42cdab46243755e8cc24b5a1bc77ec210fe74b9f2e`；归档会话已关闭。Java 语义结论来自本机既有 JDK javap，未执行 wrapper 或目标字节码。

`wrapper-javap.txt` 中 Install.lambda$createDist$0 的 38..74 字节码分支检查 distributionDir.isDirectory、zip.ok.isFile 和 verifyDistributionRoot 成功后立即返回，早于 forceFetch；verifyDistributionRoot 要求根目录中恰好一个 isDirectory 成员及其 lib 中恰好一个 launcher。File 的这些检查跟随符号链接，未观察到此分支拒绝链接。默认目录结构已实际满足；在 selected hash 目录仅添加目录链接和 marker 链接预计可进入此成功分支，partial 与完整 ZIP 均不会被读取/替换。失败分支会删除 marker 并进入获取/清理，不能把此预测推广为任意目录均安全。

createDist 的 360..590 字节码将锁定在 selected zip.lck，以 RandomAccessFile("rw") + tryLock 获取后调用上述分支，随后 release/close；未观察到该锁路径 write/truncate。成功快速返回不写默认分发目录。完整分发目录身份见 distribution-identity.json：701 文件、156,462,363 B，canonical JSON tree SHA-256 `5d04bbac8ee3616cfaebaf086e4ffad8986cc40cbbee53f21b08e37055646fd4`。默认 .ok 是真实0字节文件，无完整 ZIP；launcher 唯一。它是已有工具的内容身份，不等同于对发行方的认证。

主工程实际入口为 AGP9.3.1、Kotlin插件2.2.10，两缓存均有对应 jar/pom/module。此检查不证明所有传递依赖可离线解析。首次 javap 命令因第四个锁类使用旧包名返回1，但前三类完整输出已保留；后续只对实际包名再次反汇编成功。

Android attempt02 已开始下载 Gradle 分发包并在60%日志后停止，留下95,820,438 B的part，不能声称该尝试无下载。Gradle init 的 offline 不能约束先行的 wrapper 分发层。本目录仅只读审计；随后授权的两个链接及独立 wrapper --version --offline 结果另在 ../wrapper-reuse-01 记录，不覆写本审计或失败现场。
