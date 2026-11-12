# FINAL101 Android 网络配置 lint 窄修独审

2026-11-09；审查者 `/root/design100_independent`，与作者不同。审查范围 `3d94416d79b9e5e046122ce4c20d47defdb65dd1..2d6560be8174e2d3b69f0a635d38e67911b1202e`。结论：**接受窄修源码整合；新批次实际release构建仍待FINAL101**。

## 直接原因与产品边界

实际首次release日志 `artifacts/releases/20261109-modernization101/android-build.log:834` 和 `:876` 均指向 `<domain>127.0.0.1</domain>` 的 `Missing includeSubdomains attribute [NetworkSecurityConfig]`。`:app:lintVitalUniversalRelease`因此失败。日志有Rust release完成和Kotlin编译记录；不是推测Rust或网络连接故障。

作者仅修改手写 `src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml` 的一个属性与注释，另增说明文档。独审标准XML解析确认：

- 唯一根 `network-security-config`，唯一 `base-config` 为 `cleartextTrafficPermitted="false"`。
- 唯一 `domain-config` 为 `cleartextTrafficPermitted="true"`，只有唯一 `domain`，文本精确为 `127.0.0.1`，属性精确为 `includeSubdomains="false"`。
- 无嵌套domain-config、其他domain、通配符、其他全局属性或调试覆盖。原先未指定属性默认不包含子域，显式false保留原有精确loopback边界。
- 无Gradle、Manifest、lint规则/baseline/豁免、Kotlin/Rust或其他产品源码差异。`git diff --check`通过。

同时解析**实际已生成的旧release merged manifest**，确认application真实指向 `@xml/network_security_config`，`usesCleartextTraffic`为字面量false。其实际 `packaged_res/universalRelease/packageUniversalReleaseResources/xml/network_security_config.xml` 与修正前版本逐字节相同。故这是参与release的真实资源，不是未链接旁路文件。

## 独立 lint 因果复现

使用本机Android SDK命令行 lint **9.0.0 [14742923]**，创建两个隔离、非Gradle项目fixture；二者使用同一份上述实际release merged manifest、`target=android-36`，仅网络XML分别取Git基线和修正后版本。命令结构：

```text
.../cmdline-tools/latest/bin/lint --check NetworkSecurityConfig --exitcode --text <fixture>/lint.txt <fixture>
```

`--check`仅限制本次隔离fixture的独立因果探测，不修改产品lint配置；实际release仍须运行全部原有lint。

| 独立fixture | 退出码 | 实际检测结果 |
| --- | --- | --- |
| before（基线原XML） | 1 | `Missing includeSubdomains attribute [NetworkSecurityConfig]`，1 error |
| after（显式false） | 0 | `No issues found.` |

原样stderr/stdout、两个manifest/XML和lint文本，以及SHA汇总保留在 `artifacts/android-final101-lint-independent/`。`result.json`明确 `actualNewReleaseBuild:false`，不把独立检测器fixture称为新安装包已通过。原实际release失败报告仍保留于父级首批目录。

## 后续门槛

该XML属于手写产品输入，旧source stamp及首次Mac候选不能继续标为最终同源包。父级整合后重新prepare并用同一新stamp构建两端，只有实际 `lintVitalUniversalRelease` 与其他构建任务、包内主入口/资源、签名和设备验证完成，才可发布。此次没有Gradle/Cargo整包、ADB、关闭lint或放宽HTTP；审查者未改产品源码。
