---
id: evolve-116
scope: release-integration
status: pending
depends-on: [evolve-112, evolve-115]
---

# Agent与双端最终整合交付

## objective

以准确源码和实际运行包验证MCP、授权、双端UI、主题和既有同步的组合。按manifest交付Mac/Android与MCP适配器，维护当前入口和已知限制；不得把标识核验等同于业务或像素通过。

## context

- `docs/plan/project-evolution-20261116.md`
- `docs/architecture/agent-mcp.md`、`docs/architecture/theme-presentation.md`
- `docs/ui/adaptive-presentation.md`、`docs/architecture/build-delivery.md`

## path

- 真实联调与设备验证脚本/记录、发布manifest
- `README.md`、`docs/INDEX.md`、`docs/platform-feature-matrix.md`
- 本轮设计/任务的状态与实际偏差更新

## verification

运行相关核心/前端/协议回归；真实harness搜索、读取、新建、追加、冲突更新、撤销；用户并发编辑不丢内容。开启同步后另一独立客户端及Android读取同一内容，关闭同步仍本地可用。主题、字号、布局、原生IME/Back/菜单逐项记录。最终只更新实际构建且核验的包入口，保留未通过与未执行范围。

明确承接113的原生验收：准确APK上验证320px操作触达、五档真实字号、横屏/分屏音频控件身份与owner、输入法/insets出现隐藏与系统Back、长按选字时格式面板保持（FORMAT102）、边缘返回与表格横滚/选字/速绘的手势竞争。源码或浏览器模块done不满足这里的门槛。

适配器按[构建交付补充](../../architecture/build-delivery.md)保留独立`mcp.json`与最终文件摘要，不假设现有双端publish工具会验证它。真实harness配置须使用最终可执行位置；临时授权与凭据不进入发布物。

## 隔离环境与同步范围

本轮同步验收优先复用既有手工配对路径，在两个独立桌面资料库和本轮新建Android模拟器之间验证agent写入后的完整正文、元数据及附件引用。明确记录实际连接拓扑；ADB映射仅证明该映射路线，不推断局域网、移动网络或账户设备同步。账户同步仍按各自已有验收范围，不因本轮手工配对成功扩张为账户三端通过。先完成配对和身份稳定，再由真实设置页建立MCP授权，避免把配对引起的身份变化误判为授权持久化失败。

Android准备目录为`artifacts/project-evolution/android-isolated-20261116T203629Z-dc8cf7db/`，元数据见该目录`env-metadata.json`；只完成创建，尚未boot/安装/验收。使用现有API36 ARM64 image、私有ANDROID_AVD_HOME/ANDROID_USER_HOME、2GiB数据盘、2GiB RAM、无快照和宿主采集。未来serial候选为`emulator-5580`，启动前检查端口及实际设备身份；所有adb命令显式限定owned serial和本轮包。旧sync108 Android脚本包含历史Samsung默认值，不能直接执行其安装、启动或输入操作。保留原机、历史AVD及其快照/锁文件。

### 可提前并行的执行器准备

发布脚本准备修复已独审合入，见[evolve-116-release-verifier](evolve-116-release-verifier.md)：verifyFrontend补全严格stamp字段，合法前端可通过，错误身份继续拒绝。owned Android执行器也已独审合入`5eff3eb0`，原parked Editor观测反例已修复；main工具33项通过，明确限于fake transport/CLI边界。最终共用source stamp仍等待115及必要产品修复合入后才准备，不放宽核验来出包。

在112/115开发期间可独立准备`evolve116-android-driver`执行器，不代表116产品联调已经开始。它只依赖既有113移动身份和当前调试观察契约，path限于新执行器、其定向身份/清理检查及自身说明，不改产品App、旧Samsung driver或共享构建入口。此准备分支提交并独审后再合入；真实设备执行和最终功能验收仍须等待112/115整合及准确包。

入口必须显式接收adb路径/owned emulator serial/AVD name/package/activity/预期APK摘要及本轮evidence目录，不继承历史设备默认。运行时核对AVD、包与PID/前台/唯一WebView，变更则停止而不重放写操作；只创建并清理精确属于本轮的lease/forward/reverse，邀请串仅经内存传递。提供读取正文/设置/同步状态、可见UI交互及输入/旋转/Back的基础能力；CDP插文仅作数据准备，不能宣称真实IME验收。prepare阶段不boot、不安装、不修改IME，提供可复用机制后等待资源和准确包调度。
