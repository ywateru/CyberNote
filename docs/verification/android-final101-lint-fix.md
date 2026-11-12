# FINAL101 Android release 网络配置 lint 修复

2026-11-09；开发修复已由不同代理独立审核接受，实际新批次release验证待FINAL101。基线 `3d94416d79b9e5e046122ce4c20d47defdb65dd1`。

最终实际 Android release 首次构建中，Rust release 与 Kotlin 均编译成功，`:app:lintVitalUniversalRelease` 拒绝 `network_security_config.xml` 的本地 domain 缺少 `includeSubdomains` 属性。失败日志保留在主目录 `artifacts/releases/20261109-modernization101/android-build.log`，构建记录 `android-failed-build.json`，没有签名或安装失败候选包。

仅给既有 `<domain>127.0.0.1</domain>` 增加显式 `includeSubdomains="false"`，并把说明注释改成“无子域”。不改变唯一 domain、`base-config cleartextTrafficPermitted="false"` 或仅该 domain-config 的 `cleartextTrafficPermitted="true"`；没有新增公网域名、通配地址、全局 HTTP、lint baseline、lint 豁免或 build 配置改动。

作者使用标准 XML 解析核对：根元素正确，只有一个禁用 cleartext 的 base-config，只有一个允许 cleartext 的 domain-config，该配置只有唯一 domain127.0.0.1且includeSubdomains精确为false。`git diff --check` 通过。本修复阶段没有执行 native/Gradle 构建，因此不以 XML 解析声称实际 release lint 已通过。

该文件是手写产品输入，必须在独立审核和主目录整合后重新 prepare；旧 `7adbdbf7…` stamp及双端候选不可继续当作最终同源交付。随后由 FINAL101 用新 stamp重新构建双端，并检查真实 Android release lint/主库与嵌入资源、签名、安装和设备行为。旧失败证据保留，不能用关闭 lint 或放宽网络替代修复。

独立审核：`/root/design100_independent`接受2d6560be窄修源码。实际旧release merged manifest/resource linkage与网络边界解析通过；SDK lint9.0.0以同一实际manifest和before/after网络XML独立重现before exit1精确属性错误、after exit0。没有运行新release整包，实际新批次lint仍由FINAL101执行。详见 `docs/plan/reviews/android-final101-lint-independent.md`。
