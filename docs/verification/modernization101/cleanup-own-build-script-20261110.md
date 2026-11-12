# 自有构建脚本缓存清理结果

2026-11-10T10:59:25–10:59:28Z，父级明确批准[预检](cleanup-own-build-script-preflight-20261110.md)中的18文件allowlist后执行。**18项成功删除，0跳过，只unlink文件，未删除目录或扩展范围。** 每项删除记录及原始元数据/SHA保存在`artifacts/modernization101/cleanup-own-build-script-20261110.json`；该记录含批准清单SHA，便于独立复算。

执行前及unlink序列前两次检查：无Cargo/rustc/clang/Gradle活动构建，精确18文件lsof均exit1且输出为空。逐文件regular类型、dev/inode/mtime_ns/size/nlink/SHA与冻结预检一致，4份保留的第一方build.rs来源均存在。最后一次stat再核未变化才unlink。

删除逻辑总量275,855,008B，记录分配275,865,600B（约263.1MiB）。文件系统可用空间读取与df同源的statvfs：删除前13,090,222,080B，删除后13,176,557,568B，观察净增86,335,488B（约82.3MiB）。此净变化混有APFS共享块与并发写入，**不将263MiB或净增数冒充可精确归属的物理释放量**。

前后流式SHA核对106实际Mac入口、Mac ZIP、Android APK均完全不变，分别为`92161da1…`、`1cdae91c…`、`56d1c324…`，完整摘要在JSON。实际entry/dylib/so、out/codegen/frontend、原始证据、正式签名包、冻结原件、共享依赖和未知appearance-density全部保留，旧6项静态库未重删。未操作UI/设备、未构建、未改README F1或其他产品源码。结果交父级与不同reviewer只读复算。
