# Mac-only candidate05 宽窗工具栏构建

2026-11-04，状态：**BUILD / PRESERVATION / LOCAL ADHOC STRICT VERIFY PASS；尚未启动或运行验收**。

精确冻结主线 `5201d3151462211e51d357f1f8ecc778269a3859`。此次产品变化仅为已独立审查的宽窗三栏 `toolbar.m`，SHA256 `14f9d44bdd7b890aee5f190650ad1356904c3495240299f732e758dade2e710d`。未包含 tags03；Android candidate04 保持其原有源码、产物及运行验收身份，不声称两个平台共用本次完整冻结。

## 冻结与构建

root 明确授权最终主线 SHA 后，复用 `unified-candidate04/preparation/` 的原 capture-inputs、run-build-safe-cleanup（仅 mac）、capture-outputs、seal-mac 及 common 工具。工具 SHA 保存在 authorization-precheck.json，收尾核对均不变。工具内部 candidate04 字样及生成的旧前缀属于原工具身份；本目录明确记作 Mac-only candidate05。没有重新生成 Android、额外环境 overlay、依赖下载/升级、新 features、proof 或任意编译 flags。

列明输入 285 项，aggregate `e78df0710e6229ad4062079010b7e416cb5849d0c6f74eb0ba87254da6e7bd90`。构建、收集及封装后，head、files、toolVersions、relevantEnvironment、selectedParentEnvironment、effectiveBuildEnvironment、ocrCache 七项逐项相同；主线 tracked diff 为空。列表范围及 SDK/OS/传递依赖限制继承冻结文件的 scope，不能称为完整可复现环境。

实际构建命令 `pnpm mac:build`（tauri build --bundles app），使用冻结记录的 Cargo offline=true、jobs=2 和默认生产 features。Mac-only 没有运行 Gradle 或 Android runner。单次构建 32.094s、exit0；600s deadline、每 2 秒空间监测，最低观测空闲 5,185,052,672 bytes，没有触发终止或清理。每个输出阶段均确认不少于 2GiB。

开发者事先确认标签工作只复用既有 Store CLI，无 Rust 编译或 target 写入。首个只读 ps 因权限限制失败，保存在 precheck-attempt01-failure.json；随后获工具批准重新执行同一只读检查。没有构建失败被隐藏。开工及最终 ps 均未发现 Cargo/rustc；最终明确释放共享 host target。没有删除、复制 target 或干预前置后台进程。

## 保全产物

| 产物 | 路径 | SHA256 |
| --- | --- | --- |
| 完整原 app | `/private/tmp/notes-unified-candidate04-mac-candidate05-wide-toolbar-build-01-mac-original-b96ca225.app` | 内容逐文件保存在 mac-original-identity.json |
| 原 app ZIP | `/private/tmp/notes-unified-candidate04-mac-candidate05-wide-toolbar-build-01-mac-original-b96ca225.zip` | `a27b887a4f45537e6f7ca0f439c843d73f4068417829411d5dfc0202757efc40` |
| 完整本地 adhoc app | `/private/tmp/notes-unified-candidate04-mac-candidate05-wide-toolbar-build-01-mac-sealed.app` | bundle aggregate `25317e694a6cebbd862e0433f5196fec013dd08005ffc4877716af3940564e52` |
| adhoc app ZIP | `/private/tmp/notes-unified-candidate04-mac-candidate05-wide-toolbar-build-01-mac-sealed.zip` | `ed29e5d4bf37bf478deca691096acb05360beedc861718fa23e3bd4067b19f13` |

原始 executable：16,080,752 bytes，SHA256 `b96ca225c7848b9d6afc4755fd5ae037aab2558b3773c378eecb16ae2ea36eef`。完整 adhoc 副本 executable：16,005,376 bytes，SHA256 `c4a433e1930bd4bbc07bfb0baa70e0293a28fdba32bd4882a46332176d13c96c`。

原包只有 linker 签名，strict verify exit1（code has no resources but signature indicates they must be present），已保留原始输出。另从原包创建完整 adhoc 副本，codesign 及 --verify --deep --strict --verbose=4 均 exit0。仅 executable 和 CodeResources 因签名变化；资源和原包逐文件身份不变，两个 ZIP 再次核对 SHA 相同。原包和副本分别保全，没有把签名变化冒充原始产物。

可交给 root 启动检查的是完整 sealed app 路径；本操作者未启动它。root 负责后续可审阅交付副本及 `artifacts/mac-candidate05-wide-toolbar/` 的保全，避免与运行包切换并行。证据由此目录 manifest 列明，外部 app/ZIP 以 identity 文件列明，不纳入证据目录 aggregate。

## 验收边界

没有 GUI、安装、设备、权限设置、Android 构建/运行、Notes 数据操作。构建和本地 adhoc 验签不能证明 Developer ID、notarization、TCC 授权、运行成功、真实输入法、菜单锚点、拖宽行为、无损截图或像素一致。后续由 root 串行核对确切包/PID 再运行验收。
