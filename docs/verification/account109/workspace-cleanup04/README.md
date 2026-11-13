# Account109 build-cache cleanup

2026-11-13，按用户“清理中间无用文件，保持硬盘空间”的要求完成。删除 12 个已结束构建的 Cargo target 目录；精确路径、Cargo marker、删除前目录条目和分配字节、进程引用检查及磁盘前后记录见 result.json。删除前确认没有 cargo/rustc/Gradle/ninja/clang 编译进程，所有目标均为 /private/tmp 下的真实目录，含 CACHEDIR.TAG 与 .rustc_info.json，无 .git，且无运行命令引用。仅删除记录中列明的目录，不进行通配符删除、工作树 prune 或全局缓存清理。

这些目录的 du 分配量合计约 42.56 GiB。APFS 共享块与系统同期活动使它不等同实际回收；本次磁盘空闲量从约 3.83 GiB 增至约 27.30 GiB，观测增加约 **23.47 GiB**。此值是该时间窗口的文件系统差额，不能逐目录归因。

保留可复用的 /private/tmp/cybernote-account109-mac-ec4348c6-target-01，最新 920fa9cf GUI、既有候选/结果/日志、两份桌面测试库、Android 数据、源码工作树和全部净化草案。未读取 DB/grant、改动系统网络、重新运行测试或修改旧封存根。旧构建回执仍记录历史路径/哈希；其中已删除的 target 不再被视为现存可执行产物，未来如需复验须按原源码/锁文件重建。未来优先复用保留 target，构建任务结束后清理失去用途的新增缓存。

独立只读复核确认 12 目录均不存在，保留共享 target、两测试根和新草案存在（不枚举内容），当前 GUI 的 203,933,696 字节与原 SHA256 一致，relogin04 三项归档校验和匹配。复核未读 DB/grant 或运行 App/网络/native 构建；有限回执见 independent-review.json。
