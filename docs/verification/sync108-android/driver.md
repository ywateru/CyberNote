# Sync108 Android isolated driver

2026-11-12：本子任务基于 `67b35ca55c3861ee079c054ee1e434d935dff5bf` 的完整源码快照构建。只增加测试驱动与外部 Gradle init script，生产 Android 工程、同步源码、版本信息与 README 无改动。机器相关 APK、指纹、owned 映射及验证结果见同目录 `verification.json`。

## 实测范围

- 只读确认 serial `98895a3147304c3132` 解锁、隔离包不存在后，使用 `adb -s SERIAL install APK` 新安装；未传 `-r`。
- 包 `com.local.notesclone.sync108`、显示名 `CyberNote Sync Test`、启动组件 `com.local.notesclone.sync108/com.local.notesclone.MainActivity`。设备 Android 9 / arm64，minSdk 26，debuggable APK 仅含 arm64-v8a。
- CDP Input 点击真实新建按钮、编辑器、返回按钮，输入标题和两段中英文正文。只读 Tauri `load_workspace` 核对完整 document，重新打开编辑器核对 document 一致。仅对隔离包 force-stop / relaunch 后，再核对完整 note 与编辑器 document 相等。
- 首次驱动 Enter 未带 CR 文本，正文拼入标题；保留该合成数据和本地失败摘要。补充 `text` / `unmodifiedText` 为 CR 后，后续 UI 输入通过。未通过程序化 editor.commands 或直接业务 IPC 写入。
- 实际打开设置 → 设备同步，确认 disabled / zero peers；使用真实 Input 输入设备名并点击加入同步，核对空配对输入框可见。遵守本轮不生成邀请的要求，配对提交、附件读回和三端同步尚未执行，不能将本报告当作三端同步通过。
- 未读取原 `com.local.notesclone` 的笔记、数据库或内容，未停止、覆盖、清除原包。两个合成笔记均保留在新沙箱。

## 构建与隔离

在 Android worktree 执行：

```sh
node scripts/verification/sync108-android.mjs build
```

此命令复用 `scripts/android.mjs` 的 SDK / NDK 27.2 / JDK 17 发现逻辑，构建 `--debug --target aarch64 --apk`。专属 `artifacts/sync108-android/gradle-home/init.d` 加载本目录驱动配套的 `scripts/verification/sync108-android.init.gradle`；只对 debug 增加 applicationIdSuffix 和资源覆盖。namespace / Kotlin MainActivity 继续为 `com.local.notesclone`，所以显式 Activity 不能缩写成隔离包的 `.MainActivity`。release ID 不变。

Cargo target 强制为当前 worktree 的 `src-tauri/target`。本次首次构建使用 APFS clone 复制原工作区 target 缓存，之后完全独立写入，未与桌面代理共享可写 Cargo target。Gradle 使用正常缓存与 wrapper 的符号链接，Gradle home 和工程输出在本 worktree。

Tauri CLI 在 `--` 后的参数传给 Cargo，不能在那里传 Gradle `--init-script`；首次参数试探失败后改为专属 Gradle home。生产配置未为此改变。源码内嵌 build-info 的 `mode: production` 表示打包前端资产，原生 APK 本身是 debug，真实标记已由 aapt 核对。`sourceDirty: true` 来自新增未提交验证工具与构建输出，产品输入 fingerprint 在构建后重新计算一致。

安装必须先用 aapt 核对包 ID / label，且只安装到指定 serial；驱动不提供覆盖安装、清数据或卸载入口。若将来同名测试包已存在，应保留本轮数据并按测试计划决定是否更新。

## 操作 API

```js
import {
  connectAndroid, launchAndroid, removeOwnedForward,
} from '/private/tmp/cybernote-sync108-android/scripts/verification/sync108-android.mjs';

const android = await connectAndroid();
try {
  // 配对串必须由协调者在本轮后续阶段提供，只放在内存中。
  // await android.pair({ invitation, deviceName: 'Sync108 Samsung Android9' });
  // const note = await android.createNote({ title, body });
  // const saved = await android.readNote(note.id);
  const state = await android.inspect();
} finally {
  await android.close(); // 仅移除本次 connect 创建且仍完全匹配的 forward
}
```

| API | 行为与限制 |
| --- | --- |
| `connectAndroid()` | 固定 serial / package；核对唯一 PID 和 `/proc/PID/cmdline`；`tcp:0` 动态分配 forward；只接该 PID 中唯一的 tauri.localhost 页面。整个连接使用独占临时锁。 |
| `owned` | serial、package、pid、local、remote、pageId、pageURL，无密钥或正文。 |
| `inspect()` | 当前 PID、同步状态、计数和 UI 控件；笔记行文字被屏蔽。 |
| `openSync()` / `closeSettings()` | 通过可见控件打开真实同步设置 / 关闭设置。 |
| `preparePairing({ deviceName } = {})` | 真实输入设备名并打开空配对字段；返回 enabled / deviceName，便于无邀请时验证 UI。此入口已实测通过。 |
| `pair({ invitation, deviceName })` | 真实名称输入、加入同步、密码输入、连接并加入处理器；不生成邀请。默认设备名 `Sync108 Samsung Android9`。UI pairing 提交尚未在本准备轮执行。 |
| `createNote({ title, body })` | 非空单行标题和正文；以真实 Input 输入分段并返回保存的 note。返回按钮触发实际保存路径，等待 Rust 读回标题和每行正文。调用者仍应按测试用例核对完整 document。 |
| `openNote(id)` / `readEditor()` | 点击真实 note-row 并只读当前编辑器 document / text；目标须在当前列表内可见，必要时由操作员切到全部笔记。 |
| `readWorkspace()` / `readNote(id)` | 只读新测试沙箱的真实 Rust workspace / 完整 note 与附件引用。包含合成正文，调用者将其留在本地证据中。 |
| `readAttachment(id)` | 用当前沙箱访问 token 只读原附件 base64，返回 byteLength 和 SHA256。尚未有附件可实测；不提供程序化附件写入。 |
| `syncStatus()` / `syncNow()` | status 为只读真实 IPC；syncNow 点击 UI 的立即同步，返回当前 status，传输收敛需协调者随后轮询完整文档。 |
| `screenshot()` | 当前页面 PNG Buffer；发现任何非空敏感配对字段即拒绝截图。 |
| `close({ keepForward = false })` | 关闭 socket、释放独占锁；默认只移除自身精确匹配的 forward。 |
| `launchAndroid({ restart = false })` | 仅启动隔离包。restart 只 force-stop 隔离包；所有旧 PID CDP 连接失效，需重新 connect。 |
| `removeOwnedForward(owned)` | 只接受本 serial / package / PID remote，实际映射完全匹配才删除。无批量删除、无反向映射删除。 |

CLI 支持 `inspect`、`launch`、`restart`、`open-sync`、`sync-now`、`read-workspace`、`read-note ID`、`read-attachment ID`。`create-note` 和 `pair` 从 stdin 读 JSON；CLI 新建只打印 ID / revision / document SHA，配对错误不会回显邀请，包括 JSON 解析失败。勿把邀请放 argv、shell history、共享日志或证据文件。模块不暴露任意 evaluate / CDP send / 写入 invoke。

## 交接与清理

手机由 Android 子任务唯一操作，协调者在明确交接后才能通过模块编排，避免同时输入。没有创建 adb reverse；后续桌面端口拓扑由三端执行阶段单独记录。配对、后台补齐、C → A → B、A/B → C 正文和附件 SHA 验收均留待该阶段。

本次验证中的临时 connect 均已清理自己的 forward。为交接保留了一个额外 `attach` forward，其记录在 worktree 的 `artifacts/sync108-android/owned.json`，JSON 也已写入报告。普通 connect 会创建另一个临时映射并在 close 时清理，保留映射不会被其误删。进程重启后 retained 映射会过期，需删去旧映射并重新 attach。清理保留映射：

```sh
node scripts/verification/sync108-android.mjs detach artifacts/sync108-android/owned.json
```

独占锁位于 `/tmp/cybernote-sync108-98895a3147304c3132.lock`。崩溃后若遗留锁，需要操作员先确认旧驱动已退出再移除；脚本不会自动抢占其他操作。初始构建与每次输入均未访问原用户 App。合成数据与隔离 App 继续保留，等待后续三端验收。
