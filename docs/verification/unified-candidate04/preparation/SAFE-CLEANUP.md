# 临时离线配置清理的窄修

正式候选构建拟改用 `run-build-safe-cleanup.py`。这是原 `run-build.py` 的派生验证工具，保留原文件和原 `PREPARATION-MANIFEST.json` 字节；没有改动产品源码、构建命令、环境、离线配置内容或签名/收集流程。

新脚本在独占创建临时 init 时保存设备号、inode、预期字节数和 SHA-256。结束时只对匹配的普通文件执行删除，删除前再次核对路径对应的设备号和 inode。文件被替换、内容改变、缺失、变为符号链接或删除抛出异常时，保留可读的残留身份，写入 `cleanupError` 和兼容原收集器的 `error`，继续写 `result.json`，最终返回失败。已有构建错误仍保留。

`check-safe-cleanup-boundaries.py` 仅提取新脚本的 cleanup 函数、finally 分支和退出判断 AST，不导入或执行 CLI 顶层。它在本次新建的合成临时目录中验证六种情况：正常自有文件、被新 inode 替换、原 inode 内容改变、替换为符号链接、文件缺失、模拟删除权限异常。六项均验证结果记录落盘和退出状态；非正常项也验证原收集器会因 `error` 拒绝。合成文件及每项结果保留，路径和结果哈希见 `safe-cleanup-boundary-check.json`。

路径检查不是原子条件删除，生产执行仍必须串行所有同缓存使用者；本修复不承诺在进程崩溃或 SIGKILL 时执行 finally。证据目录须可写且仍有空间，无法保证底层写入失败时结果也能写出。

本次仅运行 AST 解析和上述合成文件检查。没有运行构建/冻结，没有触碰真实 Gradle init、缓存、target、进程、设备或 GUI，也没有下载、提交或更改原证据。源码差异见 `safe-cleanup-source.diff`，新增文件身份见 `SAFE-CLEANUP-MANIFEST.json`。
