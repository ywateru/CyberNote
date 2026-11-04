---
id: tools-android-offline-init14
scope: Guarantee the scoped Gradle offline init is evaluated on each accepted Android build
status: done
depends-on: [app-smart-u-device09]
---

## Observed problem

Android准确源`7ab867d416f48ea23913907c87fd6d058833e1cb`的`android-smart-u-build04/android-attempt01`中，真实`pnpm android:build --debug`退出0并产生新APK，但规范runner因`offlineMarkerMissing=true`退出1。日志有`Configuration cache entry reused.`，没有实际init打印。`src-tauri/gen/android/gradle.properties`启用configuration-cache；当前canonical工具只通过临时init设offline和maxWorkerCount并打印实值。原attempt输入前后比较全true、进程组已退出、临时init经身份校验已移除。失败包不收集、不安装、不将退出0当门槛通过，原日志/产物/旧输出全部保留。

Gradle官方current文档说明cache hit会跳过包括init scripts在内的配置阶段，`org.gradle.configuration-cache`可通过JVM系统属性设置。该文档只能解释风险与可选开关；不能替代本机9.6.1真实运行证明。版本化9.6.1在线文档本轮未能取得。作者须核既有本机Gradle选项/入口与实际日志，不下载工具或把网站宣传当验证。

## Required bounded correction

只修构建工具的Android有效环境/临时init与必要受控检查及说明，不修改应用、生成Gradle项目、依赖、锁、wrapper/cache内容或旧封存证据。通过真实启动层显式禁用configuration-cache，确保本次临时init被执行；继续在init中设置并检查真实offline=true、maxWorkerCount=2。不得只补一个无条件打印、忽略marker、读旧日志追认、伪造proof或接受不再执行的脚本。Mac有效环境与已有准确Mac包身份保持原样。

允许路径限定为`docs/verification/unified-candidate06/preparation/{common.py,run-build.py,collect-outputs.py,README.md}`和一个新的必要Python受控检查脚本；新作者证据放`docs/verification/tools-android-offline-init14/`。临时init可在实际设置和断言后输出当次nonce及真实offline/workers属性；runner与collector必须一致拒绝缺失/错值/旧nonce/cache-reuse，不能为了通过检查只填结果。原Mac已独审的工具/包记录保持历史字节，不回写旧冻结或收集结果。

复用固定`pnpm android:build --debug`入口和既有Gradle/JDK/NDK/cache/overlay。建议只把Android `GRADLE_OPTS`追加官方支持的`-Dorg.gradle.configuration-cache=false`，其是否足够须由本机入口与实际日志验证。若本机不支持或需扩大到其他入口，先回传root，不绕过规范工具。禁止缓存清理、升级、下载、临时改gradle.properties或重复构建以碰运气。

## Author, review, execution

先由作者完成工具窄修、必要Python受控检查，独立作者复核实际环境传递、配置cache禁用、init实值/失败拒绝、超时/进程/临时文件归属边界保持。root固定新准确工具/文档提交和新Android授权/冻结后，才单独START真实新attempt；旧Mac不重复构建，已独审的完整包沿原准确源保留。

新真实构建必须观察本次init真实offline输出，禁止cache-reuse配置日志；输入/有效环境/工具/补充依赖前后不变、进程已清空、临时文件身份清理通过，才collect并核ABI/签名/25模型。失败仍保全并停止，不据当前未接受APK安装。严格offline/jobs2、至少2GiB、每条600秒；共享target/cache独占。作者阶段无平台构建，root另行START；无GUI/ADB/用户DB或原版操作，无stage/commit，SOURCE-READY STOP交不同作者。

## External evidence

- https://docs.gradle.org/current/userguide/configuration_cache.html
- https://docs.gradle.org/current/userguide/build_environment.html
- https://docs.gradle.org/current/userguide/configuration_cache_enabling.html

本任务不关闭智能规则、设备或像素总目标，只使下一次真实Android构建拥有可验证的离线执行来源。

2026-11-05执行起点：原工具与Mac包已完成不同作者核查并STOP，见[Mac有限报告](../reviews/mac-smart-u-independent09.md)，可以开始上述工具窄修。只读作者已确认有效环境经runner、android.mjs继续传递，gradlew明确将GRADLE_OPTS解析为JVM参数；native CLI中间段及本机9.6.1实际开关仍待真实新attempt验证。作者阶段不运行正式平台构建。

2026-11-05 root接受准确`93e0e13da6e3e0efe2450684f9f909e795aeda6b`的[不同作者独审](../reviews/tools-android-offline-init14.md)有限pass；15项证据逐字节核对无差异。工具源码/参数/拒绝边界完成，真实Gradle与Android包行为仍由device09新build05单列，不追认build04。作者与审查者均STOP，target/cache已释放。
