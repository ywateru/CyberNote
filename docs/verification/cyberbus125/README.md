# 慢握手修复与账户界面收敛

日期：2026-11-19。此记录对应慢握手修复与账户界面收敛的源码提交；不是正式发布或 Mac↔Android 端到端通过报告。原验收边界继续见 [REMAINING](../cyberbus120/REMAINING.md)。

> 2026-11-21 后续变更：凭据存储设置、`CredentialStorageSettings`、状态字段和相关 IPC 已移除；桌面只使用本地加密文件，Android 只使用 Keystore 保护的本地加密文件。本页中关于可选 Keychain 和“登录与安全”折叠项的 UI 描述属于 11-19 历史时点，不能作为当前产品行为。

## 修复与证据

发现用主动 Noise 握手原来只有 2 秒，而被动端和协议允许 10 秒。较慢的 Android/中继路径可能被主动端提前关闭。将发现握手统一为协议的有限 `HANDSHAKE_TIMEOUT`；显式业务操作仍遵守调用方 deadline，未改变认证、账户隔离、撤销或暂停规则。

先添加 `delayed_probe_noise_exchanges_metadata_in_both_roles`，旧实现对晚 3 秒响应的真实 Noise 对端报 `Io(Kind(BrokenPipe))`。修改后主动/被动两角色均完成 metadata 收发并通过 owner 校验。增加无响应对端的期限退出回归。

`delayed_probe_metadata_crosses_native_relay_without_p2p` 使用三个真实 embedded EasyTier 实例、真实 smoltcp 字节流与真实 Noise/SDK owner。全部关闭 P2P、UDP/TCP 打洞及外部 STUN，两端只连接 loopback 中继，确认路由 `cost=2`、next hop 为中继；被动握手晚 3 秒启动，双方仍收到并验证 metadata。该测试证明本地中继及慢握手路径，不证明公网或 Android 正文附件传输已通过。

## 验证工具修复

- `cyberbus-command` 的任意 QA 标签原被写入 `NOTES_SYNC_E2E_SLOT`，原生只接受 `left/right`，默认命令会在 hello 前退出。现在仅两个位置值影响窗口，普通标签仅用于报告；`cyberbus-ui-live` 复用同一配置。
- Mac 账户命令原调用需要已打开账户页的 UI handler，且其返回值为 inspect 包装；开启/定向同步只打开确认框。QA 入口改为有限、类型校验过的生产 IPC，与 Android 一致。正式 UI 的确认流程保留。
- `sync-device` 不能用 ACK/页面 idle 作为成功：现在保持拥有的 Mac 进程存活，等待同一账户、目标、方向、开始时间的后台任务结束，明确拒绝失败、替换和超时。单次原生 driver 请求上限 60 秒，操作等待可按 CLI 配置至 120 秒。
- 附件摘要和 fixture MIME 原错误读取工作区不存在的 `mimeType/byteLength`；现在读取生产 `mime/size`。新增 MIME、长度变化改变摘要的回归。**修复版附件描述符摘要不能与旧工具基线直接比较**；逐附件字节 SHA-256 仍需单独采样。

## 账户 UI

沿用既有主题和系统字体；将凭据存储抽为独立 `CredentialStorageSettings`，移到设备列表之后的“登录与安全”折叠项。仅有实际选择变化时显示应用按钮；登录期间展示实际使用的存储方式。缩短重复说明，隐藏本机重复摘要与内部账户 subject，保留目标设备的在线/可同步状态和笔记摘要。

同一次操作仅在打开的确认框或对应设备行显示一份进度；设备已从目录消失时在本机区域兜底。相同安全错误代码/阶段的即时错误与账户错误合并展示，不同错误各自保留。需要退出重登录时使用账户区域唯一的退出入口，仍需确认。开启许可、同步方向、改名和凭据切换继续使用原生 `<dialog>`、键盘焦点及身份变化栅栏。

`account125-ui.mjs` 使用真实 React 页面和显式 JS IPC fixture，验证存储折叠、取消不执行传输、进度单处展示/收起后继续、状态和即时错误去重、唯一退出恢复入口；截图覆盖桌面 1280px 和移动 320/390px 深浅色。该工具不认证、不模拟真实传输成功。

## 已执行检查

| 检查 | 结果 |
| --- | --- |
| CyberBus SDK unit tests | 99 passed / 0 failed / 1 ignored（既有诊断微基准） |
| CyberBus facade | 3 passed / 0 failed |
| notes-cyberbus bridge/store | 32 passed / 0 failed |
| 主应用 `account::` | 42 passed / 0 failed |
| 主应用真实 Store/Session 三项方向回归 | 3 passed / 0 failed |
| Node CLI、账户 DTO、登录/确认与 Android 附件组合 | 97 passed / 0 failed |
| 真实 React 浏览器布局/交互 | 桌面及移动均通过；6 张深浅色截图已目视复核 |
| TypeScript | `pnpm typecheck` 通过 |

命令日志留在本机 `/tmp/cyberbus125-{sdk-tests,bridge-tests,account-tests,direction-tests,node-tests,ui}.log`，不含测试凭据；截图位于 `/tmp/cyberbus125-ui/`。旧的红测日志为 `/tmp/cyberbus125-probe-before.log`。不把这组定向回归称为全库测试。

## 真机结果与剩余边界

Android QA 包以 `adb install -r` 保留数据覆盖安装。最早启动采样的目录尚未恢复，没有本机条目，因此即时 `identityPreserved=false` 不是身份已变化的证据。后续单独等待 `ready` 和本机目录后，执行强停/重启并再次等待目录：**设备身份一致、工作区摘要一致、登录恢复为 `ready`**。状态仍显示 `credentialStorage=encryptedFile`，它是 Android 平台后端兼容标签；本轮没有直接证明 Keystore 授权/拒绝的所有路径。

最终 UI 包再次以 `adb install -r` 升级，并在升级前后都等待 `ready` 和本机目录：设备身份及工作区摘要一致。没有清包、清数据或重建身份。

修复版 Mac 命令已能正常启动、读取真实账户与四篇笔记/六个附件。保留的 QA-B 最初退出登录；QA-A 恢复报 `account_network`；另一历史 QA 库报 `account_storage`。未清库、切换身份、复制授权或删除凭据。尝试在 QA-B 打开真实系统浏览器登录，观察到托管登录表单需要测试凭据，未填写、未重置密码；该次测试应用随后关闭。最终交付时已重新打开 QA-B 的“账户与同步”页，确认登录按钮可见，供手动完成登录。

因此 UI-18 的 push/pull/both、中文正文、PNG/文件、MIME 与字节 SHA-256 和 UI-19 公网异网仍未取得通过证据。下一步需在 QA-B 手动登录与 Android 相同的测试账户，显式开启同步，保持两端运行后执行真实传输和哈希验证。其他未执行项继续保留在原清单，不以模块/中继/设备在线代填。

## 本地 QA 构建

两平台均已使用真实前端资源构建完成；这些是调试验收包。

```sh
NODE_ENV=development VITE_NOTES_DEBUG=1 CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 \
  pnpm mac:build --debug --features sync-e2e
NODE_ENV=development VITE_NOTES_DEBUG=1 CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 \
  pnpm android:build --debug --target aarch64 --apk --ci
```

两命令均显式设置本机 vendored `PROTOC`。Android 还使用既有两 worker、关闭 parallel/daemon 的 `GRADLE_OPTS`。没有修改生产配置来替换资源或注入空 sidecar。

| 产物 | 位置 | SHA-256 |
| --- | --- | --- |
| Mac Debug app 主程序（本地 ad-hoc 签名后） | `src-tauri/target/debug/bundle/macos/CyberNote.app/Contents/MacOS/notes-clone` | `96ea58eb5d10aa5324e91264f85b68fcdb59b18b82efcbf02fbb62936dd31d39` |
| Android QA Debug APK | `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` | `cc05a2bb293a76a62335844655ca103e621fb295e637e216224b6dcedaee14ad` |

Mac Tauri 初始打包再次出现既有 `code has no resources but signature indicates they must be present`；保留此失败，使用仓库 `Entitlements.plist` 为生成的 sidecar 和 `.app` 重新做本地 ad-hoc 签名后，`codesign --verify --deep --strict` 与 Info.plist 校验通过。没有使用 Developer ID 或公证。构建日志为 `/tmp/cyberbus125-mac-package.log` 和 `/tmp/cyberbus125-android-build.log`。

签名前 packaged native smoke 曾在 hello 前超时；签名后同一 `.app` 已通过真实 native driver 的启动/ready、账户状态和工作区读取。最终 QA-B 的账户恢复也报 `account_network`，四篇笔记与六个附件仍保留；该错误继续阻断有效登录后的跨平台验收。
