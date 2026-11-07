# Apple Notes Clone

Rust + pnpm 开发的本地备忘录应用，目标平台为 macOS 和 Android。Tauri 2 提供原生窗口和安装包，React/Tiptap 提供编辑器，Rust/SQLite 保存笔记与附件元数据，图片、录音和其他附件独立存储为本地文件。不接入 iCloud。

当前为可运行开发版，完整原版交互及逐像素一致目标仍在进行。功能是否完成以各次交付的准确版本和验证范围为准，见[文档索引](docs/INDEX.md)。

## 当前交付

更新于 2026-11-07，已整合到本地主分支 `main`。安装包为本机生成的交付产物，不纳入 Git；克隆仓库后需自行构建。

| 平台 | 本机安装包 | 本次状态与证据 |
| --- | --- | --- |
| macOS ARM64 · Mac32 | [ZIP](artifacts/editor94/备忘录-Mac32.zip) / [应用](artifacts/editor94/备忘录.app) | 标签回车提交、正文 Tab 插入、附件右键菜单和导入记录内部化；准确构建、独立核包通过。[Mac32 交付](docs/verification/editor94/DELIVERY.md) |
| Android ARM64 · Android21 | [APK](artifacts/sync91/备忘录-Android21.apk) | 快速画廊首页、本地附件及双向同步；在隔离模拟器完成正文/原文件同步、恢复与图片导出验收。[同步交付](docs/verification/sync91/DELIVERY.md) |

Mac32 为本地 ad-hoc 签名包，未公证；Android21 为 debug 包。Mac32 后续改动没有重新生成 Android 包，两端不能视为相同的完整 UI 版本。旧包、原始失败和原 Android 未保存录音现场保留。

近期改动：

- [编辑器键盘94](docs/verification/editor94/DELIVERY.md)：`#标签` 后回车生成标签并正常换段；普通正文 Tab 插入制表符，表格导航和列表缩进优先，支持撤销/重做。
- [附件与导入93](docs/verification/attachments93/DELIVERY.md)：正常来源附件继续导入，额外生成的原始记录不显示为正文卡；图片、音视频和文件提供右键菜单。
- [Apple 备忘录导入92](docs/verification/apple-notes-import92/DELIVERY.md)：Mac 设置 → 数据中选择并复制系统备忘录，源数据不修改；真实来源附件导出仍有明确限制。
- [双向同步91](docs/verification/sync91/DELIVERY.md)：支持可达 LAN / ws / wss 地址的配对和同步；实际 VPN、实体手机及原版像素范围单列。

## 运行与构建

需要 Node.js、pnpm、Rust；macOS 原生构建需要 Xcode Command Line Tools/macOS SDK。项目固定 pnpm 版本见 `package.json`。

```sh
pnpm install --frozen-lockfile
pnpm dev                    # 浏览器预览
pnpm mac:dev                # macOS 原生开发
pnpm mac:build              # 构建 .app
```

默认 Mac 输出为 `src-tauri/target/release/bundle/macos/备忘录.app`；使用 `CARGO_TARGET_DIR` 时，以该 target 下对应路径为准。应用标识为 `com.local.notesclone`，与系统 Notes 分开。

Android 需要 Android SDK / 平台 36、Build Tools、NDK、JDK 17 及 Rust `aarch64-linux-android` target。可通过 `ANDROID_HOME`、`NDK_HOME`、`JAVA_HOME` 配置，具体构建规则见 `scripts/android.mjs`。

```sh
pnpm android:init            # 仅在原生工程缺失时初始化
pnpm android:dev
pnpm android:build --debug   # 默认 arm64 APK
pnpm android:build           # release，正式分发需配置签名
```

构建不要求安装或重启现有设备。浏览器预览使用独立预览存储；正式安装版通过 Rust 保存，浏览器结果不能替代原生平台验证。

## 测试

```sh
pnpm typecheck
pnpm build
pnpm test:schema
pnpm test:editor
pnpm test:native-toolbar
pnpm test:rust
```

日常交互检查使用[统一调试入口](docs/debugging.md)，通过命令、HTML/DOM、固定合成媒体和隔离工作区验证。按改动选择相关分组，避免反复操作系统界面。调试功能不进入生产包。

```sh
pnpm debug group notes --out /private/tmp/notes-debug-result
```

各证据明确区分模拟 OS/媒体、真实 Editor、Rust Store、原生设备和原版像素。最新键盘修复的作者15项、标签回归27项、独审17+5项和schema96用例均通过；不据此宣称真实输入法服务或所有手机已验收。[测试策略](docs/testing.md)。

## 本地数据

- Mac 数据目录为 `~/Library/Application Support/com.local.notesclone/`；Android 使用应用私有目录，卸载会清除数据。
- `notes.sqlite3` 保存文档和元数据，`attachments/` 保存媒体原文件。设置 → 数据可查看数据库、附件占用及导入/导出信息。
- [系统备忘录导入](docs/apple-notes-import-usage.md)保留普通来源附件；内部原始记录用于来源追踪、去重及完整备份，不显示为普通附件卡。
- [设备同步](docs/sync-usage.md)使用可达地址和配对信息，不依赖 iCloud。匿名隧道地址变化后按说明更新连接。
- 锁定、完整备份、恢复及同步的格式、权限和故障边界见[架构契约](docs/architecture.md)，不能直接修改受管数据库或附件来替代应用操作。

## 文档入口

- [需求](docs/requirements.md)、[UI 与架构](docs/architecture.md)、[参考资料和原录屏](references/README.md)
- [文档索引](docs/INDEX.md)、[交付计划](docs/plan/README.md)
- [Mac32 键盘修复](docs/verification/editor94/DELIVERY.md)、[Mac31 附件菜单](docs/verification/attachments93/DELIVERY.md)、[Android21 同步](docs/verification/sync91/DELIVERY.md)
- [合入 main 前的历史 README](docs/history/readme-before-main-2026-11-07.md)

历史记录保留原时点和失败事实；当前状态以本页及对应交付记录为准。
