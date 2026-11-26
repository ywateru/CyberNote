# 插件体系重构与 UI 插件改进评审稿

状态：声明式插件安装与 UI 基座已实现，硬件/模型/Agent 仍为预留。日期：2026-11-26。

相关文档：

- [插件架构与 Magpie 对照](../architecture/plugin-platform.md)
- [插件中心与工作区扩展 UI](../ui/plugin-center.md)
- [智能笔与录音设备预留](../architecture/plugin-devices.md)
- [示例插件](../../examples/plugins/cybernote.sample/README.md)

## 1. 目标与结论

本轮把原有“只能管理内置插件”的注册表重构为“内置 + 宿主验证的声明式外部包”：

1. 本地 ZIP 与公开 GitHub 仓库都可以安装。
2. 安装前必须预览，安装后保持关闭，不能隐式运行。
3. 外部包不能执行脚本、原生库、页面或安装命令；界面只由宿主按清单渲染。
4. 插件可启用/停用、改设置、升级、卸载；失败回滚，损坏记录不会拖垮内置插件。
5. 样例插件随仓库交付，并生成 Release 用 ZIP。
6. 文件格式、UI、同步/备份、外接 UI、Agent、模型、设备等扩展点有明确的权限与阶段边界，未实现项不会以可点击占位出现。

**核心原则：清单不是授权。** 安装只证明“包被复制到私有目录并通过结构校验”，不等于允许读取笔记、联网、调用模型、连接蓝牙或提交写入。每类敏感能力都需要独立宿主服务、用户授权和提交屏障。

## 2. 分层架构

```text
Built-in catalog ─┐
Local ZIP ────────┼─> Native installer/validator -> private plugin dir
GitHub zipball ───┘             |
                                v
                    Native registry + install records
                                |
                  revisioned snapshot + notes-plugins event
                                |
              +-----------------+------------------+
              |                                    |
        Host-rendered UI                     Future capability ports
  detail sections / settings / commands      format / sync / model / agent
              |                                    |
          React windows                       Explicit host services
                                                   |
                                             Session -> Store
```

### 2.1 所有权

| 所有者 | 负责 | 不交给插件 |
| --- | --- | --- |
| 原生插件运行时 | 清单校验、安装目录、安装记录、版本、来源、状态、事件 | 不运行包内代码 |
| React 宿主 | 列表/详情、安装对话框、设置控件、声明式区块、错误状态 | 不解释任意 HTML/CSS/JS |
| 业务服务 | 编辑器、保存、附件、同步、备份、账号、模型路由、设备输入 | 插件不能绕过权限、事务或目标校验 |
| 未来设备/模型适配器 | 在宿主 API 后面处理厂商协议、流、错误映射 | 不直接持有窗口、Store、Editor 或文件路径 |

## 3. 包格式与安装

### 3.1 外部清单

```json
{
  "manifestVersion": 1,
  "apiVersion": "1.0.0",
  "id": "cybernote.sample",
  "name": "示例插件",
  "description": "宿主渲染的声明式示例。",
  "version": "1.0.0",
  "platforms": ["macos", "android"],
  "permissions": [],
  "contributes": {
    "commands": ["sample.greeting"],
    "panels": ["sample.panel"],
    "themes": [],
    "devices": []
  },
  "ui": {
    "visibilityConfig": "showPanel",
    "sections": [
      {
        "slot": "plugin.detail",
        "title": "示例插件已加载",
        "body": "由宿主渲染的纯文本。"
      }
    ]
  },
  "config": [
    {
      "key": "showPanel",
      "type": "boolean",
      "title": "显示示例面板",
      "default": true
    }
  ]
}
```

当前只支持 `boolean` / `select` 设置和 `plugin.detail` 文本区块；`permissions` 必须为空。版本升级只允许更高版本，配置保留，启用状态恢复为关闭。

### 3.2 ZIP 规则

- 归档 ≤ 16 MiB，展开 ≤ 32 MiB，单文件 ≤ 8 MiB，≤ 256 项，≤ 8 层。
- 必须恰好有一个 `manifest.json`，可在 ZIP 根目录或单一顶层目录；多个清单要求使用 GitHub 子目录地址。
- 拒绝绝对路径、`..`、反斜杠、盘符、隐藏路径、`__MACOSX`、符号链接、设备文件、加密 ZIP、可执行位。
- 拒绝脚本、页面、WASM、原生库、安装包和快捷方式扩展名。
- 先写入私有暂存目录，再原子替换；`plugins.json` 与 `.bak` 采用临时文件替换。目录或状态失败都回滚。

### 3.3 GitHub 规则

支持：

```text
https://github.com/owner/repo
https://github.com/owner/repo/tree/main/path/to/plugin
owner/repo#path/to/plugin
```

- 只接受 `https://github.com`、443、无凭据、无 query。
- 下载固定走 `api.github.com/.../zipball`，重定向只允许 GitHub 的 HTTPS 主机。
- 90 秒超时、16 MiB 上限、5 次重定向、无用户 token。
- 子目录安装用 `<archive-root>/<subdir>/manifest.json` 唯一定位，仓库其他文件不安装。

## 4. 原生接口与状态

命令仅对 `main` / `note-*` 且来源可信的窗口开放：

| 命令 | 行为 |
| --- | --- |
| `plugin_registry` | 返回带 `revision`、`stateError`、`installErrors`、设备能力和插件列表的快照 |
| `plugin_update` | 部分更新启用状态/设置，严格校验 schema |
| `plugin_preview_archive` | 读取并验证本地 ZIP，返回 id/版本/来源/贡献/冲突 |
| `plugin_install_archive` | 重新校验并安装，返回新快照 |
| `plugin_preview_github` | 下载并验证 GitHub zipball，返回预览 |
| `plugin_install_github` | 重新下载、校验并安装 |
| `plugin_uninstall` | 移除外部插件目录、安装记录和设置 |

Android 文件选择器返回的 `content://` 先复制到应用私有暂存；桌面只读取普通文件并拒绝符号链接。

安装记录包含：版本、来源类型、来源引用、归档 SHA-256、清单 SHA-256、安装时间。启动时重新读取清单并比对摘要；清单被修改、目录缺失或版本不一致时，该扩展不进入可运行列表，`installErrors` 提示并允许移除记录。

## 5. UI 插件改进

当前实现：

- 设置 → 插件：桌面主从布局，手机列表 → 详情。
- 列表：搜索、全部/已启用/需要处理筛选、启用开关、外部来源标签。
- 详情：来源、安装时间、版本、平台、能力、宿主渲染区块、权限、生成设置、设备预留、维护。
- 安装：本地 ZIP 系统选择器；GitHub 地址检查；预览后确认；安装后关闭。
- 升级：显示升级来源版本，配置保留，先关闭再切换。
- 卸载：二次确认，只删除插件文件/记录/设置。
- 失败关闭：状态损坏关闭全部插件；单个扩展损坏只显示 `installErrors`，内置插件和其他扩展继续工作。
- 浏览器预览：显示合成注册表，不显示真实安装入口，不访问文件或网络。

声明式 UI 的本轮范围仅包含：

```text
plugin.detail section (title/body plain text)
visibilityConfig -> boolean config field
config forms: boolean / select
contribution descriptors: commands / panels / themes / devices
```

不允许 HTML、iframe、React 组件、任意 CSS、远程资源、脚本或原生桥。未来若要开放隔离页面，必须先通过平台安全评审，不能复用当前“声明式”放行。

## 6. 扩展点状态

| 扩展点 | 现状 | 下一步评审门槛 |
| --- | --- | --- |
| 文件格式 | 仅描述，未开放 | 宿主文件选择器、MIME/头部探测、大小/解析配额、预览损失、一次事务提交；不把完整备份格式交给第三方 |
| 改变 UI | 已支持 `plugin.detail` 文本区块和设置 | 再评估命令菜单、工作区面板、主题 token；核心编辑器/系统菜单/设置导航不可替换 |
| 同步 / 备份 | 未开放 | 宿主持有密钥、调度、加密、快照、冲突与恢复；适配器只处理受管对象，不支持任意覆盖写伪装 CAS |
| 外接 UI | 未开放 | 系统浏览器打开外部站点不附带正文/身份/token；本地隔离页面需 CSP、资源源、消息桥、超时和原生边界实机证据 |
| Agent | 未开放 | 用户显式触发、可见上下文、工具白名单、步数/时限、取消、写入确认；模型输出不提升授权 |
| 大模型调用 | 未开放 | 宿主保管凭据与网络；发送前预览目的地/模型/范围；流取消、用量/预算、错误映射；默认不记录提示词/正文/密钥 |
| 智能笔 | 未开放，宿主能力为 `false` | 原生蓝牙 broker、用户授权、点读码绑定、手写会话、目标窗口/笔记屏障；见设备文档 |
| 智能录音设备 | 未开放，宿主能力为 `false` | 先用真实设备文件导入验证，再评估实时采集；音频完整性、原 owner、取消/断线/退出保护 |

### 6.1 智能笔插件预留路径

```text
Point code frame -> native BLE adapter -> host device router
                  -> bound command (open drawing / note action)
                  -> existing drawing session -> editor transaction

Stroke batch -> native adapter -> host input lease -> drawing panel
             -> user Done -> existing attachment/editor commit
```

插件只能声明设备适配器候选；实际 GATT profile、连接租约、点码映射和手写输入由宿主审查后实现。外部 UI 不接触蓝牙原始报文、设备地址或 Editor 实例。点读码可触发“打开指定笔记的速绘”等宿主命令，但不能直接写正文。

### 6.2 智能录音设备预留路径

```text
Device file -> system picker -> host staging -> validate container/duration/checksum
            -> preview -> existing attachment submission -> note ACK

Future live capture -> device lease -> ordered chunks -> existing recording owner
                    -> sealed file -> attachment submission
```

首版只做文件导入，不把厂商设备伪装成系统麦克风。实时采集以后另行评审，必须复用现有录音 owner、退出保护、取消和附件提交，不建立第二条音频队列。

## 7. 现有功能迁移顺序

| 顺序 | 功能 | 方式 | 回退 |
| --- | --- | --- | --- |
| 已完成 | 附件详情 | 插件控制菜单入口、信息面板和字段设置 | 关闭插件立即移除入口/面板，宿主仍可打开附件 |
| 下一批 | 附件导出、Apple 备忘录导入入口、扫描/OCR 展示 | 宿主服务不变，只迁入口与可选展示 | 关闭后回到原菜单/设置页 |
| 后续 | 内置 themes / Markdown 导入导出 | 先验证主机解析和主题 token | 不影响正文、备份和已有附件 |
| 高风险 | WebDAV/S3/GitHub、模型 provider、Agent 工作流 | 保留现有服务作为默认，逐个改 adapter | 切换失败留在当前配置，不自动迁移凭据 |
| 不迁移 | 编辑/保存、附件生命周期、账号、锁定、同步 wire、软件更新、安全模式 | 永远由宿主拥有 | — |

## 8. 验收与发布

已覆盖：

- Rust：15 项插件运行时测试，包含合法/损坏 ZIP、路径穿越、歧义清单、GitHub 子目录、内置 ID、版本冲突、升级、卸载、损坏状态、GitHub 地址/重定向。
- TypeScript：`pnpm typecheck`。
- 前端：插件中心、安装对话框、示例启用/设置/卸载的合成浏览器流程；桌面与移动设置回归。
- 打包：`pnpm plugin:package` 生成 `release-packages/cybernote-sample-plugin.zip`，并输出 SHA-256。

发布前仍需：

1. 完整 Rust/前端/附件/设置回归与真实 macOS/Android 安装包验收。
2. Android 实际 `content://` 文件选择器、GitHub 网络和卸载焦点验证。
3. 若发布签名 APK，使用既有 release keystore；缺失签名材料不能伪造发布成功。
4. 将示例 ZIP 作为 Release asset，与双端安装包、receipts 和 checksums 一并核验。

实体智能笔/录音设备未实现，因此本轮不以设备插件通过作为发布条件；但安装器、权限拒绝、能力 `false` 和 UI 不出现可点击占位必须通过。
