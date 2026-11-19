# CyberBus 原生应用命令行验证

`scripts/verification/cyberbus-command.mjs` 为 macOS 和 Android 真实应用提供一套有界命令入口。每条命令只接受固定动作和类型化参数，调用现有生产 IPC/调试驱动，输出账户计数、工作区摘要和附件哈希；不会接受任意 JavaScript、shell、账户 payload、URL、文件字节或密钥。

这些命令用于 QA 数据目录和现有 Android QA 包，不能用于用户日常资料库。不要永久保存命令输出中的笔记/附件 ID、设备 ID、账户 subject、设备名、附件名或测试正文；故障报告只保留脱敏计数、错误码和 SHA-256。

## 公共参数

Mac 每次启动都要求绝对可执行文件路径和绝对隔离数据目录：

```sh
MAC_BIN='/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/bundle/macos/CyberNote.app/Contents/MacOS/notes-clone'
MAC_DIR='/absolute/path/to/isolated-qa-data'
```

Android 默认包名为 `com.local.notesclone.cyberbusqa`。设备必须已由用户手动解锁；命令不会绕过安全锁屏。

```sh
node scripts/verification/cyberbus-command.mjs \
  --platform android \
  --action status \
  --android-package com.local.notesclone.cyberbusqa
```

通用上限：超时 1 秒至 120 秒，诊断观察窗口 0 至 60 秒，输出不超过 1 MB。`--platform all` 同时执行 Mac 与 Android，只有不依赖单平台 ID 的动作可用。

## 状态和工作区

```sh
# 账户状态、脱敏设备计数和工作区摘要
node scripts/verification/cyberbus-command.mjs \
  --platform mac --action status \
  --binary "$MAC_BIN" --data-dir "$MAC_DIR" --slot qa-a

# 只读工作区摘要，不输出 ID、标题或正文
node scripts/verification/cyberbus-command.mjs \
  --platform android --action workspace-summary

# 输出笔记和附件 UUID，仅供本轮进程内定位附件；不要写入文档或提交
node scripts/verification/cyberbus-command.mjs \
  --platform mac --action workspace-index \
  --binary "$MAC_BIN" --data-dir "$MAC_DIR"

# 读取一个附件并返回长度与 SHA-256，不输出文件内容
node scripts/verification/cyberbus-command.mjs \
  --platform android --action read-attachment \
  --attachment-id TRANSIENT_UUID
```

`status` 会输出去敏后的 `state`、`enabled`、凭据存储方式、设备总数、在线/连接/可同步设备数、待处理/冲突计数和最近操作方向/阶段。它不输设备 ID、名称、endpoint、token、subject 或笔记内容。

## 开关、目录刷新和内容同步

```sh
# 直接切换本轮 QA 运行时的同步意图；正式 UI 仍需阅读确认框
node scripts/verification/cyberbus-command.mjs \
  --platform android --action enable

node scripts/verification/cyberbus-command.mjs \
  --platform android --action disable

# 只刷新设备目录，不传输笔记或附件
node scripts/verification/cyberbus-command.mjs \
  --platform android --action sync-now

# 对固定目标执行真实内容同步
node scripts/verification/cyberbus-command.mjs \
  --platform android --action sync-device \
  --device-id TRANSIENT_TARGET_UUID --direction both
```

`sync-device` 的方向只允许 `push`、`pull`、`both`。目标 UUID 从本轮真实状态中一次性取得，命令输出不返回该 ID。命令 ACK 只表示接受后台任务；工具保持 Mac 应用存活，并轮询同一账户、目标、方向及 `startedAt` 的操作，直到 `succeeded` 才返回成功；失败、被替换或超时返回 `DEVICE_SYNC_FAILED`、`DEVICE_SYNC_RETIRED` 或 `DEVICE_SYNC_TIMEOUT`，不能以页面 idle 代替落盘回执。`all` 平台依次执行 Mac 和 Android 的动作，两个操作仍分别等待结果，不能用一条 Mac 成功代替 Android 成功。

Mac 的 `--slot` 为诊断标签，只有 `left` / `right` 会设置双窗口位置；`qa-a` 等任意合法标签不改变原生窗口配置。账户 QA 命令直接调用有限的生产 IPC，正式界面仍要求开启、方向和目标确认。Mac 包须同时包含 `sync-e2e` Rust feature 和 `NODE_ENV=development VITE_NOTES_DEBUG=1` 前端，普通生产包不含这些 UI 驱动。

## 固定笔记和附件 fixture

```sh
node scripts/verification/cyberbus-command.mjs \
  --platform all --action create-fixture-note \
  --binary "$MAC_BIN" --data-dir "$MAC_DIR" \
  --title 'CyberBus command fixture' \
  --body 'ASCII-only command fixture'
```

`create-note` 只创建标题/纯段落；`create-fixture-note` 再附加两个固定文件：

| 名称 | MIME | 字节数 |
| --- | --- | ---: |
| `cyberbus-command.png` | `image/png` | 68 |
| `cyberbus-command.bin` | `application/octet-stream` | 4096 |

两个 fixture 的字节、名称和 MIME 固定在源码中，调用者不能覆盖。写入英文标题/正文可避免 shell 参数转义成为故障变量；真实中文和富文本由原生 UI 用例覆盖。逐平台输出附件长度和 SHA-256，跨端应相等。

2026-11-19 校正摘要读取字段：工作区实际使用 `mime` / `size`，工具对外投影为 `mimeType` / `byteLength`。旧工具曾错误读取同名输出字段，导致附件摘要忽略 MIME 和长度；新的 `attachmentDescriptorSha256` 与旧工具基线不可直接比较，必须在两端用同一修复版重新采样。它仍不代替逐附件内容 SHA-256。

## 诊断

```sh
# 单次脱敏 snapshot
node scripts/verification/cyberbus-command.mjs \
  --platform android --action diagnostic

# 先采样，等待 10 秒，再采样并返回计数器增量
node scripts/verification/cyberbus-command.mjs \
  --platform android --action diagnostic --watch-ms 10000
```

建议在两个独立终端无观察窗口采样 `diagnostic`，在两采样之间执行一次 `sync-device`，随后第三次采样并比较计数。重点分开观察：

- `sessionsEstablished`、`sessionsInbound`、`sessionsOutbound`：Noise 会话。
- `businessSessionsEstablished`：完成首帧和业务准入的会话。
- `metadataQueued`、`writerMetadataSent`、`writerSendFailed`：写出侧。
- `framesReceived`、`metadataFramesReceived`、`metadataValid`：读取侧。
- `readerErrors`、`readerNoFrameExits`、`writerExitSendFailed`：远端关闭和首帧前退出。

只有业务会话建立且正文/附件落盘、哈希一致才算同步成功；Noise 会话、设备在线和目录刷新都不能替代。

## 交互式 UI 驱动

`cyberbus-ui-live.mjs` 保持一个真实应用窗口打开，并通过逐行 JSON 接收与 `sync108-native-driver.mjs` 相同的既有动作：

```sh
node scripts/verification/cyberbus-ui-live.mjs \
  --binary "$MAC_BIN" --data-dir "$MAC_DIR" --slot qa-a
```

默认只在启动后读取一次诊断，然后等待 stdin。需要主动轮询时显式加入 `--interval-ms 10000`；允许范围为 0 至 300000，避免测试日志无界增长。

## 安全边界

- 只在 `CyberNote-CyberBus-*` 隔离数据目录和现有 Android QA 包运行。
- 不记录密码、token、subject、设备 ID、endpoint、密钥、私有路径或笔记正文。
- 不自动解除 Android 锁屏，不清包、不清数据，不删除 QA 数据库或附件。
- 旧 `probe_store` 的 Keychain 授权框不是当前应用入口；不要点击“始终允许”。桌面默认使用 `encryptedFile`，系统 Keychain 是可选模式。
- 失败时保留首个错误和前后诊断计数；不能用重新登录、重建身份或清库掩盖失败。
