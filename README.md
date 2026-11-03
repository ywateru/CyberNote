# Apple Notes Clone

用 Rust + pnpm 构建的本地备忘录应用，当前目标为 macOS 与 Android。Tauri 2 提供安装应用与原生窗口，React/Tiptap 提供编辑器，Rust/SQLite 保存笔记与附件。不接入 iCloud。

**当前为首轮可运行实现，尚未达到原版 UI/交互像素级一致，不能视为完整验收版本。** 需求、录屏保全、原版采样与差异记录见 `docs/INDEX.md`、`references/README.md`。功能已实现、开发者已自测、独立验证通过是三种不同状态。

## 运行与构建

本机已使用 Node 22.16、pnpm 10.15、Rust 1.97.1、Xcode/macOS SDK 构建。先执行：

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test:rust
pnpm test:schema
pnpm test:editor
```

Mac 安装应用的开发与构建：

```sh
pnpm mac:dev
pnpm mac:build
open src-tauri/target/release/bundle/macos/备忘录.app
```

应用标识为 `com.local.notesclone`，与系统原版 Notes 不同；请用上面的完整应用路径启动，避免打开原版。

Android 需要 Android SDK、平台 36、Build Tools、NDK、JDK 17 与 Rust `aarch64-linux-android` target。本机脚本读取 `ANDROID_HOME`、`NDK_HOME`、`JAVA_HOME`；未配置或旧 NDK 路径不存在时采用本机 SDK/NDK 27.2.12479018、JDK 17 路径。其他电脑应明确设置这三个变量。

```sh
pnpm android:init                 # 只在原生工程缺失时初始化
pnpm android:dev
pnpm android:build --debug        # 默认 arm64 APK
pnpm android:build                # release；正式分发还需配置签名
```

首轮 debug 安装包在 `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`。默认只含 arm64，文件名中的 universal 是生成目录名，不代表已包含所有 ABI。debug 包保留 Rust 调试符号，体积约 300 MB，尚未作为正式分发包优化。原生工程中自定义了媒体权限、系统栏避让与输入法 resize；重新初始化后需核对这些配置。

浏览器预览可用 `pnpm dev`，但会显示“浏览器预览”标记，数据放在单独的预览存储中。安装版始终通过 Rust 保存，浏览器预览不作为正式数据或平台功能验证结果。

## 本地数据

- Mac：`~/Library/Application Support/com.local.notesclone/`。
- Android：应用私有数据根目录（本次模拟器验证为 `/data/user/0/com.local.notesclone/`）。卸载应用会删除此目录。
- 数据库：`notes.sqlite3`，SQLite WAL；附件：同目录 `attachments/` 下 UUID 文件。
- 富文档保存为 Tiptap JSON，包含表格、清单状态、绘画笔画、附件引用；按笔记串行保存与 revision 检查，保存失败保留待保存内容并提示重试。
- 本地锁定使用 Argon2 派生密钥与 AES-GCM 加密正文；标题作为列表元数据可见。锁定时启用 SQLite secure_delete 并截断 WAL。当前含附件的笔记明确拒绝锁定。
- `.notesbackup` 为版本 1 的 JSON 归档，包含文件夹、笔记、设置及 Base64 附件；加锁笔记保留密文，其他笔记不加密。导入遇既有普通文件夹、笔记或附件 ID 时创建副本并重写引用，保留本机当前内容；系统文件夹复用。归档设置完整恢复，过期选中项按明确规则重置。导入先校验完整归档，以新文件和恢复日志发布附件，数据库失败或进程中断后按已提交引用恢复；不覆盖已有附件。当前未实现 Apple Notes 原生文件格式互通。
- 归档限制为单文件 256 MiB、单附件 100 MiB、解码附件总量 128 MiB、实体 10,000 项；JSON 对象树分配前还限制值总数和层级。富文档按实际 Editor 的节点层级、内容数量、格式标记和应用属性契约校验；默认属性可省略，无效结构会在写入前拒绝。`pnpm test:schema` 使用生产编辑器的共享扩展校验 Rust 清单与文档样例，依赖或扩展改变时会检测规则漂移。超限会明确拒绝。导出采用同目录暂存后替换，失败保留已有备份；禁止覆盖应用数据库和受管附件。

## 首轮实现范围

已编写 Mac 三栏壳、移动端文件夹→列表→编辑器导航、搜索过滤、列表/画廊、置顶、移动、最近删除/恢复、文件夹管理、明暗主题、结构化富文本、清单、表格、媒体附件、手写笔画、录音面板、本地锁定、备份与独立窗口。录音、相机和全部附件平台链路仍需独立验证，不以代码存在作为通过证据。

当前已执行的真实验证包括 Mac `.app` 与 Android APK 构建、Rust 临时 SQLite/附件/加密测试，以及安装后 Android 中文/清单/表格→强制结束→冷启动恢复→重开编辑器→系统返回的自动化回归。首轮结果见 `docs/verification/app-001-selfcheck.md`。归档可靠性修复新增真实坏归档、文件/数据库失败与六个进程退出点回归，原事务机制已由独立 QA 复核。文档 schema 补修已通过独立复核，冻结证据见 `docs/verification/app-001-fix-00-schema/`。FIX-01 新增同窗图库展开、保留选区的移动端格式面板、七种绘画纸张、短划线列表与块引用、表格转文本及仅新空白笔记的首次纯文本粘贴规则；当前 Rust 测试为 16 通过、1 个子进程专用 worker 默认忽略（可靠性测试实际启动六次），另有 65 例真实前端 schema 对照，以及真实编辑器状态/历史的表格转换边界与一次撤销回归。新 Mac 与 Android 安装产物及开发者证据见 `docs/verification/app-001-fix-01/selfcheck.md`，FIX-01 待独立验收。

安装 debug APK 后，可重跑设备回归（会在克隆应用中新增一条测试笔记，不触碰系统 Notes）：

```sh
ANDROID_SERIAL=emulator-5580 node scripts/android-smoke.mjs
```

该脚本通过 Android WebView 的本地调试接口执行真实 UI 输入，读取 Rust 工作区作断言，将截图与文档证据保存到 `artifacts/android/smoke/`。不依赖 REA，适用于本机旧 Chrome 91 WebView。

## 已知缺口

- Mac 字形、图标、工具条材质、侧栏间距和画廊卡片仍需逐项像素对照；当前 Lucide 图标尚未替换为原生 SF Symbols。图库双击同窗展开与返回已修正，尚待独立验收。
- 移动端格式面板已改为替代键盘的底部面板，并按录屏排列七种纸张；整体尺寸、系统选择菜单、手势动画和图标仍需逐帧对照。X 恢复键盘与 Android Back 关闭面板并收起键盘属于项目交互约定，录屏没有证明这些触点。
- 扫描自动裁边、OCR、转写、标签、智能文件夹、数学结果、笔记间链接、PDF/Markdown 等格式导入导出尚未实现。相应需求 F17–F19 保持未完成。
- 清单自动归类/段落折叠、附件浏览器和原版菜单完整性仍有缺口。
- Android 仅已测现有模拟器 Android 11 / Chrome 91 / arm64；真机、多尺寸、输入法组合输入与新版 Android 的系统栏仍需覆盖。iOS 未建立可运行产物，不计入已交付平台。

原版参考素材和应用数据请分开管理。原始用户录屏已保存在 `references/mobile/original/`，该目录与构建产物按 `.gitignore` 留在本机，不提交到 Git。
