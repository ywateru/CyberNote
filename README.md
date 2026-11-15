# CyberNote

Rust + pnpm 开发的本地备忘录应用，目标平台为 macOS 和 Android。Tauri 2 提供原生窗口和安装包，React/Tiptap 提供编辑器，Rust/SQLite 保存笔记与附件元数据，图片、录音和其他附件独立存储为本地文件。不接入 iCloud。

当前为可运行开发版，完整原版交互及逐像素一致目标仍在进行。功能是否完成以各次交付的准确版本和验证范围为准，见[文档索引](docs/INDEX.md)。

账户同步最新桌面测试包为 `29c87810`，已完成本机两个独立客户端的设备列表、推送、拉取和双向验证。使用[测试端 A](scripts/verification/account110-desktop-a.command)／[测试端 B](scripts/verification/account110-desktop-b.command)启动，步骤与范围见[手动测试指南](docs/verification/account110/MANUAL-TESTING.md)和[结果及保留失败](docs/verification/account110/RESULT-LATEST.md)。[代码归并与空间清理](docs/verification/account110/workspace-cleanup01/README.md)已保留该包及两个测试库。下方安装包表仍是此前双端同源交付版本。

## 最新安装包

<!-- latest-installers:start -->

| 平台 | 安装包 | 版本 / 构建时间（UTC） | 源码 |
| --- | --- | --- | --- |
| macOS | [CyberNote.app](<artifacts/releases/20261110-modernization106/CyberNote.app>) | 0.1.0 / 2026-11-10T08:05:59.823Z | bf26dae17f97 + 74c0a8bbe365664d |
| Android | [APK](<artifacts/releases/20261110-modernization106/android/CyberNote-Android-arm64.apk>) | 0.1.0 / 2026-11-10T08:23:18.611Z | bf26dae17f97 + 74c0a8bbe365664d |

双端源码指纹一致；功能与平台差异见[功能对应表](docs/platform-feature-matrix.md)。本机包不纳入 Git，验证范围见各平台交付 manifest。

<!-- latest-installers:end -->

[Mac ZIP（含字体许可与来源说明）](artifacts/releases/20261110-modernization106/CyberNote-Mac.zip)；Mac随附字体[OFL许可](artifacts/releases/20261110-modernization106/notices/noto-cjk/OFL.txt)与[来源说明](artifacts/releases/20261110-modernization106/notices/noto-cjk/README.md)。Android分发时请同时保留交付目录内的[OFL许可](artifacts/releases/20261110-modernization106/android/notices/noto-cjk/OFL.txt)与[来源说明](artifacts/releases/20261110-modernization106/android/notices/noto-cjk/README.md)；这些是APK旁随文件，裸APK不包含完整许可交付。

Mac视频最新：[live10有限独核](docs/plan/reviews/app-final106-mac-videos-live10-independent.md)接受faststart视频激活、96秒时长、初段推进及86.8%后段定位。随后正常播放点击被Mac系统锁定拒绝；后段继续播放、明确暂停和tail-metadata视频均未验收。两端剩余原生检查需本人正常解锁后续接；详见[剩余验收前提](docs/verification/modernization101/remaining-native-prerequisites.md)。下方较早记录按各自时点读取。

Mac最新续验：[WAV live09有限独核](docs/plan/reviews/app-final106-mac-wav-live09-independent.md)接受90分钟录音的激活、正确时长、起始推进、作者记录的一次约91%后段定位及最终结束状态。AX设置进度未成功；后段即时数值仅有作者动作记录，不能当连续推进采样。两MP4仍在分项验收，Android仍待本人正常解锁。下段live08锁定为此前时点，不覆盖这次新结果。

106双包已完成[同源、实际入口及包内资源独立核验](docs/plan/reviews/app-final106-packages-independent.md)，源码指纹为`74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a`（446输入），**尚未完成双端原生功能验收**。[Mac后续live08记录](docs/verification/modernization101/final106-mac-runtime-live08-author.md)重新确认了准确106设置身份，已显示中文SVG实际画廊缩略图并从附件返回、定位到自有备忘录。90分钟WAV已导入，首次播放操作被Mac系统锁定拒绝，播放/时长/seek尚未确认；两份MP4未导入。早先[选择器阻碍](docs/verification/modernization101/final106-mac-runtime-author.md)和[双进程观察限制](docs/verification/modernization101/final106-mac-parent-observation.md)保留为历史记录，不覆盖live08的新证据。Android此前安装尝试exit1、随后报告设备缺席；当时失败输出未保存，原因未知。[只读诊断03](artifacts/final106-android-package-readonly-03/report.md)曾发现包登记保留但代码目录缺失；随后于10:29 UTC执行一次保数据修复安装并返回Success，设备实际APK摘要与106完全一致，[安装证据已独核](docs/plan/reviews/app-final106-android-install0304-independent.md)。这仅确认安装身份；输入法、格式面板和媒体功能仍按真机分项验收，不计完整通过，也不证明此前代码目录缺失的原因。其他能力与历史证据见[Mac/Android功能对应表](docs/platform-feature-matrix.md)和[验收记录](docs/verification/modernization101/final-audit.md)。

**原Android r2正文长按选字会关闭格式面板的FORMAT102失败仍未关闭；106的Android横屏布局修复不等于解决该历史故障。** Mac为本机ad-hoc签名，未公证；Android使用本地Debug证书，均非商店正式签名。此前Mac录音检查遇系统麦克风授权超时，完成录音后的刷新未核验，实体触摸板捏合也未实测。包为本机生成产物，不纳入Git。

## CyberNote 桌面重构

“显示选项 → 查看附件”提供图片/视频、音频、文稿和全部附件画廊，支持试听录音、图片浮动预览，以及从附件跳转到所属备忘录并选中、滚动定位。已在此前功能快照中包含附件画廊；本轮新增功能以顶部安装包范围为准。[使用与行为](docs/ui/attachment-gallery.md) / [验证记录](docs/verification/cybernote-desktop/ATTACHMENT-GALLERY.md)。

设置页已分为外观与字号、备忘录、设备同步、存储空间、导入与备份五类。桌面采用左侧分类栏，移动端采用分组首页和子页；打开设置时保留顶部工具栏。详见[设置页规格](docs/ui/preferences.md)与[验证及本机产物](docs/verification/cybernote-desktop/SETTINGS-REDESIGN.md)。

桌面端已按新设计稿重构侧边栏、连续顶部栏、笔记列表和录音卡，并采用方形眼睛的新图标。设置 → 外观与字号提供独立的“界面字体大小”和“编辑器字体大小”，均提供极小、小、中、大、极大五档；默认中档为界面 14px、正文 16px，选择会自动保存，界面文字、图标、行高、间距和原生顶部栏同步缩放，编辑器字号独立控制。搜索栏已统一普通、悬停及聚焦边框。

本轮补齐表格的行列标记、整行整列选中和插入/删除菜单；修复小字号原生工具栏图标裁切，录音与标签改为仅显示图标。

附件保持独立原文件存储，新增 SVG 等图片类型识别、图片直接粘贴为附件、附件剪切/拷贝/粘贴和 Mac 文件打开/Finder 入口，图片预览采用黑色背景与圆角窗口。

历史设置交付：[设置样式验证](docs/verification/cybernote-desktop/SETTINGS-REFERENCE.md)；其他桌面历史记录见[统一菜单](docs/verification/cybernote-desktop/UNIFIED-MENUS.md)、[附件文件与剪贴板](docs/verification/cybernote-desktop/ATTACHMENT-FILES.md)、[表格与图标](docs/verification/cybernote-desktop/TABLES-AND-ICONS.md)。当前可用安装包统一见顶部“最新安装包”。

## 历史交付（2026-11-07）

以下记录保留原交付时点，供回溯；不作为当前最新安装入口。

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

默认 Mac 输出为 `src-tauri/target/release/bundle/macos/CyberNote.app`；使用 `CARGO_TARGET_DIR` 时，以该 target 下对应路径为准。应用标识为 `com.local.notesclone`，与系统 Notes 分开。

Android 需要 Android SDK / 平台 36、Build Tools、NDK、JDK 17 及 Rust `aarch64-linux-android` target。可通过 `ANDROID_HOME`、`NDK_HOME`、`JAVA_HOME` 配置，具体构建规则见 `scripts/android.mjs`。

```sh
pnpm android:init            # 仅在原生工程缺失时初始化
pnpm android:dev
pnpm android:build --debug   # 默认 arm64 APK
pnpm android:build           # release，正式分发需配置签名
```

构建不要求安装或重启现有设备。浏览器预览使用独立预览存储；正式安装版通过 Rust 保存，浏览器结果不能替代原生平台验证。

## 版本与同源交付

应用版本以 `package.json` 为源；变更后运行 `pnpm version:sync` 同步 Tauri/Cargo，Android 直接读取该版本并生成 versionCode。`pnpm build` 会检查版本一致性，并把真实 UTC 构建时间、Git revision 与产品输入 SHA256 注入设置 → 外观与字号 → 版本信息。开发预览明确显示“开发预览”，不伪造安装包时间。

```sh
pnpm version:check
pnpm release prepare --out artifacts/releases/current/source-stamp.json
CYBERNOTE_RELEASE_STAMP=artifacts/releases/current/source-stamp.json pnpm mac:build
# 保留该次 dist 与最终签名 Mac 包，再按同一 stamp 构建 Android
CYBERNOTE_RELEASE_STAMP=artifacts/releases/current/source-stamp.json pnpm android:build
```

源文件变化后旧 stamp 会被拒绝；两端实际构建时间可不同，产品输入指纹必须一致。包内核验与 README 发布命令见[构建交付流程](docs/architecture/build-delivery.md)。顶部安装入口指向本批已独立核验的同源包，历史快照只在历史记录中保留。

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
