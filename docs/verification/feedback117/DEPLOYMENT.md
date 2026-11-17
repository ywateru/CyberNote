# 双端安装与空间清理记录

日期：2026-11-17。用户要求重新运行 Mac、安装 APK 供手工验证，并清理无用数据与中间文件。本次只构建、签名、安装、启动及检查命令结果，没有执行 UI 自动化或操作笔记。

## 当前包

发布目录：`artifacts/releases/20261117-feedback117/`。双端版本 `0.1.0`，打包来源 `c406086d5bbe7f2f32dabe0049e64a43545f56e6`，准备时源码干净，共1750项产品输入；后续文档更新不改变包内构建身份。

共同源码指纹：`31c8ed9fed41158a7dd97140e79a819faad9bb71fedc6a6a1025828008980bb7`。

| 平台 | 构建时间（UTC） | 交付路径 | 包摘要 SHA-256 |
| --- | --- | --- | --- |
| macOS arm64 | 2026-11-17T08:11:22.893Z | `CyberNote.app` | `e1fb5308bf80e1c41d50593a355dae333014f30f9313491f8e2f068044e725f9` |
| Android arm64 | 2026-11-17T08:19:34.498Z | `android/CyberNote-Android-arm64.apk` | `df44c528206e5e32c345f4ec7f0f7821ca0288742aa0f2e113a0c7dd2515dedf` |

Mac 摘要采用项目 `artifactDigest` 的目录文件摘要算法，APK 摘要为文件 SHA-256。`mac.json` / `android.json` 保存实际入口、原生二进制摘要及嵌入的 metadata/runtime 证据。构建分别运行 `pnpm mac:build` / `pnpm android:build`，共用 `stamp.json`，并设置 `CARGO_BUILD_JOBS=2`；打包完成后由 `scripts/release.mjs` 核验和更新 README 安装表。原有编译警告保留，不计为 UI 或完整功能验收。

Mac 已使用项目 entitlements 重新 ad-hoc 签名，`codesign --verify --deep --strict` 通过，未公证。ZIP 包含应用与字体许可/来源说明。Android 经 zipalign 和 apksigner 签名，v2/v3校验通过，证书与原手机安装一致；Android 字体许可/来源说明保存在 APK 旁的 `android/notices/`。前一轮 release 和 MCP 适配器不变，测试器继续填写 `artifacts/releases/20261117-project-evolution/mcp/cybernote-mcp` 的绝对路径。

## 实际运行与安装

- Mac：通过应用正常退出流程结束旧进程，没有强制终止。重新打开本轮发布目录的 `CyberNote.app`；命令确认新进程 PID `40636` 的可执行路径来自该目录，未传入自定义资料库参数。证据为 `deployment/mac-launch.json`。
- Android：连接的 Samsung SM_G9500 真机使用 `adb install -r` 覆盖安装，返回 `Success`；没有卸载或清除数据。安装后首次安装时间与 UID 均未改变，实际已安装 APK 的 SHA-256 与本轮交付包一致。显式启动 `com.local.notesclone/.MainActivity` 返回 `Status: ok`，进程 PID `19405`。证据为 `deployment/android-install.json`、`android-install.txt` 和 `android-launch.txt`。
- Android 的版本为 `versionCode=1000` / `versionName=0.1.0`。上述证据确认保留数据的安装方式和包身份，没有读取 SQLite/附件逐项核对数据；不把安装成功等同于全部功能或数据字段验收。

现在可直接在两端“设置 → 外观与字号”检查八套配色和清单；桌面“设置 → Agent 接入 → 启动 MCP 测试程序”检查手动与批量 MCP。详细手测步骤见[本轮交付](README.md)。

## 空间清理

按用户追加要求，清理154项文件/目录，原分配空间合计约 **33.7 GiB**。构建期间可用空间由约3.8 GiB恢复至约35 GiB；编译新增文件和文件系统统计变化使净可用空间变化不等于逐项原占用之和。

清理内容：

- 主 target 下旧 macOS/Android debug 缓存；只在确认当前构建使用 release 后删除。
- `artifacts/` 中已过期的非 release `.app`、APK/AAB 和独立 `notes-clone` 调试二进制，保留同目录日志、收据和截图。
- 已停止使用的项目隔离 AVD 镜像；没有启动模拟器或修改真机数据。
- 双端新包核验、安装后，删除对齐中间 APK、Gradle intermediates/临时 APK 输出，以及重复的 target 内 Mac bundle。

保留当前及已有 `artifacts/releases/` 发布包、手机安装前拉取的回退 APK、签名/安装/启动证据、前端身份快照、主 release 编译缓存、依赖与 SDK、全部用户资料库/附件、历史测试日志/截图。仍被双客户端启动脚本使用的 `account110/mac-29c87810-debug-01` 应用也保留。未清理项目以外的全局缓存或其他项目文件。

逐项路径、原分配字节、原因及保留例外记录在本机 `artifacts/releases/20261117-feedback117/deployment/cleanup.json`。历史文档中的已清理非 release 包链接只保留回溯意义；最新可用入口为根 README 安装表。上述本机产物不纳入 Git。
