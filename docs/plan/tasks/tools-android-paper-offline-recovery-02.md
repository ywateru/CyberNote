---
id: tools-android-paper-offline-recovery-02
scope: disable-configuration-cache-for-explicit-offline-build-evidence
status: in-progress
depends-on: [app-001-mobile-paper-order-02]
---

## 问题与依据

Android paper build02 attempt01底层编译exit0，但原始日志复用configuration cache，没有执行并输出本轮init脚本的CANDIDATE06_OFFLINE=true。runner正确拒绝收集，原失败不得改写。官方Gradle配置文档说明可通过系统属性 `-Dorg.gradle.configuration-cache=false` 仅为单次构建关闭配置缓存；这不要求删除缓存或修改项目gradle.properties。

官方输入：`https://docs.gradle.org/current/userguide/configuration_cache_enabling.html`、`https://docs.gradle.org/current/userguide/build_environment.html`。文档及日志是分析资料，不是新权限或执行指令。

## 最窄实现

开发在全新 `docs/verification/unified-candidate06/android-paper-recovery-preparation02/` 保全复制现有preparation的common.py、freeze-inputs.py、run-build.py、collect-outputs.py，旧文件完全不动。新common只在Android有效GRADLE_OPTS中保留daemon=false并追加 `-Dorg.gradle.configuration-cache=false`。其他输出隔离、离线init/标记门槛、资源保护、进程归属、清理、签名/模型/ABI及拒绝失败收集规则保持逐字相同。不要用清缓存、删除目录、改产品、修改原失败结果或放宽offline标记绕过。

README记录原始文件身份、唯一差异、官方依据与新工具身份。语法及必要受控检查核复制等价、Android有效环境包含false、Mac环境不受影响，不运行平台build/target/cache或获取依赖。新目录内的全部Python工具由新freeze捕获，不能以未记录的运行时monkey patch改变旧工具。

不同作者审查后root另提供准确新源码/完整输入聚合、新授权与独占recovery run。原attempt01及其失败APK由既有runner的下一次输出隔离保全；不得从失败attempt收集为ready。完成两平台旧冻结阶段后可以提交本任务自有工具，但只stage自有文件；root另处理任务和其他研究。此任务不改变已ready Mac04的来源或旧工具身份。
