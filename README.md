# CyberNote

**CyberNote 是一款本地备忘录应用，核心目标是让你和 AI 在本机一起使用、整理和管理自己的备忘录。**

你可以像平常一样记想法、写待办、收集图片和录音。需要回顾或整理时，可以让 AI 在你授权的文件夹里查找旧记录、汇总几篇笔记，或把整理结果存成一篇新备忘录。你和 AI 使用同一个资料库，整理后的内容可以直接在应用里查看和继续编辑。

## 能做什么

- **记录和整理**：用文件夹、标签和搜索管理备忘录，在正文里写清单、插入表格、保存图片、录音和其他附件。
- **与 AI 协作**：在 macOS 上，把支持 MCP 的客户端（如 Codex CLI）连接到 CyberNote。可以只允许搜索和阅读，也可以按需单独授予新建、修改权限。
- **保管自己的资料**：备忘录和附件默认保存在设备上，日常记录不需要登录。可以导入、导出和备份资料；需要跨设备使用时，可选择账户同步，或配置自己的 WebDAV、S3、GitHub 存储来加密同步。Mac 还可以从 Apple 备忘录复制导入。

## 下载与更新

前往 [GitHub Releases](https://github.com/ywateru/CyberNote/releases) 下载。平台差异见 [macOS 与 Android 功能对照](docs/platform-feature-matrix.md)。

| 平台 | 下载 |
| --- | --- |
| macOS（Apple Silicon） | DMG 用于手动安装；发布页也提供应用内更新使用的 ZIP。应用采用临时签名，尚未通过 Apple 公证。 |
| Android（arm64） | 下载签名 APK。覆盖安装时，APK 的签名须与已安装版本一致。 |

已安装的应用可以在「设置 → 关于」检查更新。发布页同时提供 SHA-256 校验文件。

### 本地构建记录

<!-- latest-installers:start -->

本地构建产物由发布工具记录；下载安装请使用上方 GitHub Releases 链接。

<!-- latest-installers:end -->

## 开始与 AI 协作

1. 打开 Mac 上的 CyberNote，在「设置 → Agent 接入」开启本机接入。MCP 适配器已随应用安装。
2. 为客户端授权，选择允许访问的文件夹、权限和有效期。第一次可以仅授予读取权限。
3. 在「配置与连接」复制配置到客户端，保持 CyberNote 运行。试着问：「从『项目记录』里找出上周的会议备忘录，汇总已经决定的事项。」
4. 如果希望 AI 把结果写回备忘录，再为目标文件夹授予相应的新建或修改权限。例如：「把刚才的结果存成一篇新的会议备忘录。」不用时可以撤销授权。

本机接入指客户端在 Mac 上通过 MCP 访问本机资料库。它不要求 AI 模型也在本机运行；使用云端模型时，客户端可能会把读取到的内容发送给模型服务。Android 可以使用备忘录和同步功能，MCP 接入由 Mac 端提供。

详细步骤见 [Agent 接入指南](docs/agent-usage.md)；本地资料管理和同步见[设置说明](docs/ui/preferences.md)。

## 本地开发

CyberNote 使用 Tauri 2、React、Tiptap 和 Rust，笔记以 SQLite 保存，媒体附件存为独立文件。开发需要 Node.js、pnpm 和 Rust；Mac 原生开发还需要 Xcode Command Line Tools。Android 环境与打包步骤见[构建与发布说明](scripts/publish/README.md)。

```sh
pnpm install --frozen-lockfile
pnpm dev          # 浏览器预览，使用独立的预览存储
pnpm mac:dev      # 启动 macOS 原生开发版
pnpm typecheck    # 检查 TypeScript
```

未固定源码的本地发行构建会分配下一个版本号。详见[版本和构建规则](docs/architecture/build-delivery.md#版本编号)。技术架构、各端验证和历史交付见[文档索引](docs/INDEX.md)。
