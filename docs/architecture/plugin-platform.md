# CyberNote 插件机制：架构与迁移评审稿

状态：M0/M1-lite 与声明式外部包安装已实现；第三方脚本、硬件接入、同步/模型/Agent 适配器仍为提案。日期：2026-11-26。源码调查基线：CyberNote `4c7abbd3`、本地 `refs/magpie` 的 `593ea43`。界面与交互见[插件中心与工作区扩展](../ui/plugin-center.md)。

## 0. 当前实现状态

本轮已落地“内置插件 + 声明式外部包”的完整最小闭环：从 ZIP 或 GitHub 安装、预览确认、安装后关闭、启用/停用、升级、卸载、宿主渲染界面和失败隔离。目标仍是证明“清单 → 原生权威状态 → 窗口投影 → 宿主 UI/回退”的整套路径，而不是提前开放第三方代码或硬件权限。

| 已实现 | 源码位置与行为 |
| --- | --- |
| 共享清单 | `src/plugins/catalog.json` 同时由 Rust（`include_str!`）和渲染层读取；内置 ID、版本、平台、贡献、权限与严格设置 schema 只维护一份 |
| 原生注册表 | `src-tauri/src/plugin_runtime.rs` 校验清单、平台可用性、设置类型和未知字段；状态存于应用数据目录的 `plugins.json`，首次及后续写入保留 `plugins.json.bak`，临时文件 flush 后原子替换 |
| 命令与事件 | `plugin_registry` 和 `plugin_update` 仅对受信任的主窗口/文档窗口开放；读取返回带 `revision` 的快照，更新执行部分设置合并并广播 `notes-plugins`，渲染层拒绝旧 revision |
| 失败关闭 | 状态文件损坏、版本未知或无法读取时，快照带 `stateError` 并关闭全部插件；更新被拒绝，原文件不改写 |
| 设置页 | 新增「插件」分类和服务端驱动的插件中心：列表、筛选、搜索、启用开关、生成式设置表单、权限/贡献/状态详情 |
| 首个迁移功能 | `cybernote.attachments.inspector` 默认启用，向附件右键菜单提供只读「显示信息」；关闭后入口与已打开信息面板一起撤回，并在信息面板中应用 `showByteCount`、`showRecordedAt` |
| 声明式外部包 | `external manifest.json` 使用 `manifestVersion`、`apiVersion`、`platforms`、`permissions`、`contributes`、`config`、`ui`；外部包不能申请权限，不能覆盖内置 ID，不能包含脚本、原生库、页面或安装命令 |
| 安装与维护 | `plugin_preview_archive` / `plugin_install_archive`、`plugin_preview_github` / `plugin_install_github`、`plugin_uninstall` 只对受信任窗口开放；安装记录包含来源、版本、归档与清单 SHA-256、安装时间，状态与目录写入失败会回滚 |
| 包边界 | 归档最大 16 MiB、展开最大 32 MiB、单文件 8 MiB、256 项、8 层；拒绝绝对路径、`..`、符号链接、加密 ZIP、可执行位、可执行/脚本/页面扩展名、重复或大小写冲突路径，以及多个 `manifest.json` 造成的歧义 |
| GitHub 安装 | 只接受 `https://github.com/{owner}/{repo}`、`/tree/<ref>/<subdir>` 或 `owner/repo#subdir`；通过 `api.github.com/.../zipball` 下载，重定向只允许 GitHub HTTPS 主机，无凭据、无本机/内网访问，有 90 秒和 16 MiB 上限 |
| 示例插件 | `examples/plugins/cybernote.sample/` 提供无脚本示例；`pnpm plugin:package` 生成发布用 `cybernote-sample-plugin.zip`。示例包含宿主渲染区块和可见性设置，用于验证安装、启用、设置与卸载 |
| 设备预留 | 注册表快照只暴露 `devices.bluetooth`、`smartPen`、`recordingDevice` 三个只读布尔能力，当前均为 `false`；尚未申请蓝牙/麦克风权限或扫描设备 |

未实现且仍按本文后续阶段评审：Markdown 导入/导出、同步或备份 provider、模型与 Agent 工作流、第三方可执行代码、隔离外部页面、蓝牙 broker、SmartPen 点读/手写和智能录音设备接入。**当前“外部包”只包含宿主可解释的声明式 UI、设置和贡献描述，不运行包内任何代码。** 浏览器调试后端提供同形状的合成注册表，只证明前端契约，不提供真实安装或设备能力。

本轮定向验证：`pnpm typecheck`；`cargo test --manifest-path src-tauri/Cargo.toml plugin_runtime::`（15 项，覆盖合法/损坏 ZIP、路径穿越、歧义清单、内置 ID、升级/降级、卸载、损坏状态与 GitHub 地址/重定向边界）；`cargo check --manifest-path src-tauri/Cargo.toml --features access-boundary-proof`；桌面设置回归 177 项、移动设置回归 191 项；附件文件/剪贴板/预览集成 16 项。以上是源码、Rust 单测和浏览器合成边界证据，不是 macOS/Android 安装包或实体智能笔/录音设备验收。

## 1. 目标与首期范围

让同一套插件声明驱动管理界面、命令、面板和服务选择，让现有可选功能逐个迁出主应用的装配代码。**插件提供界面、转换或适配能力；CyberNote 继续拥有笔记、账号、权限和提交。** 用户禁用插件后仍能启动、打开和编辑笔记、读取已有附件、执行完整备份与恢复。

当前支持随应用发布的内置贡献，以及经过宿主验证的**声明式外部包**：只读附件信息面板继续验证 UI 挂载、禁用和回退；外部示例验证 ZIP/GitHub 安装、安装后关闭、升级、卸载和宿主渲染区块。Markdown 导入/导出、同步/备份 provider、模型/Agent 工作流仍按后续阶段推进。[智能笔和录音设备](plugin-devices.md)只定义宿主能力和接入契约，不装配蓝牙服务或设备插件。第三方可执行代码、公共商店、后台 Agent、自动跨设备安装和远程页面嵌入均不属于当前范围。不改变 CyberNote 当前默认启用行为及旧数据格式。

## 2. Magpie 的实现及取舍

Magpie 有三条不同路径，不能把内置模块、第三方页面和第三方脚本当作同一种权限。以下路径相对于 `refs/magpie/`，该目录是本地参考，未随 CyberNote 版本库分发。

| 路径 | 实现依据 | CyberNote 取舍 |
| --- | --- | --- |
| 内置模块 | `internal/pluginrt/pluginrt.go`：`Manifest` 声明 `Requires` / `Provides`，`plugins/all/all.go` 集中装配；`Reconcile` 先逆序撤销不再满足条件的模块，再按服务就绪启用；`Ctx` 负责贡献和清理。`config.go` / `schema.go` 合成 `plugins.yml` 与默认值，处理 `InUse` 与表单校验 | 采用集中装配、依赖检查和逆序清理。内置 UI 采用宿主注册的 React 组件，不用全局脚本；正在工作的插件可先暂停再关闭，不能因为 `in use` 静默重启或绕过撤权。异步 I/O 和窗口 ACK 不持有注册表或 Session 锁 |
| 内置 UI | `internal/gui/assets/kernel.js`：`window.magpie` 的 `plugin/setup`、页面 slot、配置更新、UI kit、翻译和单页错误边界；Library、Sessions 等将页面资源迁出主窗口，保留关闭时的宿主回退 | 采用固定插槽、共享组件、局部错误边界、分模块维护。保留编辑器、导航、保存、平台桥的现有实例和入口 |
| 第三方页面、面板、菜单 | `internal/plugin/page.go` 解析 `package.json` 的 `magpie.page/panels/actions/permissions`，验证本地资源与槽位；`internal/gui/pluginpage.go` 提供资源、CSP 和授权读取；`internal/gui/assets/pluginpages.js` 用隔离 frame、消息桥和超时，页面还能替代白名单内置视图；部分混合插件有本机 service 路径 | 采用声明式挂载和有限消息桥。许可声明不是授权，不提供本机服务代理或自选端口；页面替换需用户主动选择，绝不按安装顺序抢占；仅考虑非核心视图 |
| 可执行插件、模型与 Agent | `internal/plugin/host.go` / `host.js`：Go 启 Bun 子进程，经有界消息、流与取消管理执行；`internal/plugin/{providers,tools,agent}.go` 将贡献纳入各类注册；`docs/subsystems/provider-plugins.md` 记录厂商登录、请求、用量从内置向插件迁移，Gateway 仍掌握路由和配额 | 采用执行与 UI 分离、类型化适配器、统一用量和迁移归属。不引入 Bun/npm 安装链，不把子进程当安全沙箱；首期只使用内置适配器，未来运行外部代码需独立运行时和安全评审 |

## 3. CyberNote 接入位置与所有权

| 当前源码与契约 | 待加接入点 | 不迁出 |
| --- | --- | --- |
| `src-tauri/src/lib.rs` 编译期注册 `notes-ui`（macOS）、`notes-media`、`notes-auth`、`notes-scan`；`src-tauri/capabilities/` 定义原生权限 | 新产品插件注册表调用受管原生服务 | 现有 Tauri 插件是平台桥，不是可从磁盘热加载的产品插件；禁止运行时改 Tauri capabilities |
| `src/Preferences.tsx`、`src/confirmed-settings.ts`、`src-tauri/src/settings_host/` 管理设置与窗口协调 | 插件中心、宿主生成设置表单、权威状态回执 | 原设置保存 owner、全窗口协调、锁屏、权限对话框和安全模式 |
| `src/shells/WorkspaceShell.tsx`、`src/presentation/resolver.ts`、`src/editor-menus/`、`src/native-toolbar-controller.ts`、`src/themes/` | 宿主将贡献投影为菜单、工具区、页面及主题；统一 Web 与原生意图校验 | `EditorSession`、保存队列、录音、IME、导航、原生系统栏与主题解析 |
| `src-tauri/src/application/` 的 `NotesApplicationService`、`src-tauri/src/agent_access/` 和 `src/agent-window.ts`；见[主应用模块](application-modules.md)、[Agent MCP](agent-mcp.md) | 插件代理调用同一业务服务；外部写入复用目标保护/保存屏障、幂等回执和窗口刷新链 | 同一个 `Session`、`Store`、正文与附件事务；插件授权不能替代 MCP 客户端 grant，反之亦然 |
| `src-tauri/src/cloud_sync/{protocol,engine,runtime}.rs`、`src-tauri/src/local_backup/`；见[设置、云端同步与更新](settings121.md) | 云端对象传输适配器、可选备份目的地 | CyberBus 账户与设备传输、加密、冲突、归档恢复、调度和活动配置切换 |

```text
Built-in manifests / verified local packages (later)
                         |
           Native registry + lifecycle + grants
                /                        \
   UI projection (per window)          Capability broker
   command / slot / theme / view          |
   host renderer or isolated frame        +-- domain adapter registry
                                          +-- application / archive services
                                                      |
                                               Shared Session -> Store
```

注册表和有效授权由原生宿主唯一持有；各窗口只接收带 `registryRevision` 的清单投影，拒绝旧版本事件。插件 ID 不用显示名，内置 ID 由应用保留。业务模块通过显式注入的接口使用注册表，不互相导入插件实现。多个实现提供同类能力时由用户或现有配置选定；无配置时使用宿主默认，不按发现顺序偷偷选择。Web 预览只接合成 registry，不假装拥有原生安装、凭据或文件权限。

## 4. 清单、生命周期与兼容

以下是当前已实现的外部包清单形状；应用发布版本、清单 schema 与插件 API 独立。它只声明宿主可解释的贡献，不包含所选笔记的读取权限或可执行入口。

```json
{
  "manifestVersion": 1,
  "apiVersion": "1.0.0",
  "id": "cybernote.sample",
  "name": "示例插件",
  "description": "宿主编译的声明式示例。",
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
        "body": "这段文字由 CyberNote 宿主渲染。"
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

当前 `ui` 只开放 `plugin.detail` 纯文本区块和 `visibilityConfig` 布尔开关；没有 HTML、脚本、React 组件、外部 URL 或原生桥入口。`contributes.commands/panels/themes/devices` 是宿主路由声明，外部包不能自行解释或执行。示例完整文件在 [`examples/plugins/cybernote.sample`](../../examples/plugins/cybernote.sample/manifest.json)，可用 `pnpm plugin:package` 生成确定性 ZIP。

未来阶段才考虑的结构化入口如下；它必须经过独立 schema、隔离与授权评审，不能直接沿用当前安装器的默认放行：

```json
{
  "contributes": {
    "views": [{ "id": "inspector", "title": "Note Inspector", "entry": "ui/index.html" }]
  }
}
```

- **校验。** ID 采用反向域名格式，局部 ID 只用小写字母、数字和 `-`，跨插件引用用 `pluginId:contributionId`。校验 SemVer、平台、贡献引用、设置 schema、UI 槽位和尺寸上限；外部包当前拒绝任何权限、未知字段、多个 `manifest.json` 和可执行内容。`cybernote.*` 内置 ID 保留，外部包不能覆盖或伪装。未来若引入依赖，同名服务重复、环依赖必须拒绝，缺服务显示阻塞原因。
- **启用。** 安装与启用分离；第三方初始关闭，不在安装时执行。启用依序校验兼容性、依赖、配置与有效授权，暂存贡献，成功后一次发布新投影。视图与业务处理器按需启动；单个面板失败只影响该面板，初始化失败撤销已登记资源。保存的是用户意图与配置；运行态分为 `disabled` / `blocked` / `enabling` / `active` / `disabling` / `failed` / `quarantined`，安装中的暂存件不出现为可运行插件。
- **关闭与撤销。** `active` 不是持续授权。先阻止新请求并提升授权/激活代次，再撤掉入口、取消任务、关闭 frame、释放订阅/句柄，最后逆序清理依赖。普通停用遇到进行中的同步/备份，先提示用户进入安全停点；撤权无需等待，已跨不可逆提交点的工作仅完成宿主提交/回执，不再向插件交付数据。授权存储失败时立即锁定插件并显示恢复动作，不报“已持久撤销”；可验证的授权不能恢复前不得重新启用。用户主动关闭、授权缺损和安全模式不能由默认值覆盖。
- **升级与回滚。** 当前只允许更高版本升级；同版本和降级拒绝。包先解压到私有暂存目录，校验通过后原子替换 `<data>/plugins/<id>`，配置保留，启用状态回到关闭。状态写入失败会恢复上一版目录和注册表；卸载先把目录移出再提交状态，失败可恢复。新增权限、目标或发布者变更在未来有权限的清单中必须重新确认；没有安全旧版则停用隔离。
- **分发。** 当前支持公开 GitHub 仓库和本地 ZIP。GitHub 只接受 `github.com` 的仓库/树地址，经 `api.github.com` 的 zipball 下载，重定向仅允许 GitHub HTTPS 主机，不附带用户凭据，不访问 localhost 或任意内网。ZIP/GitHub 都不执行安装脚本，插件包及授权不会随账户同步或备份迁移。散列只检验完整性和升级一致性，**不代替发布者信任**；未来签名/商店仍需独立评审，当前界面必须明确显示来源。

### 4.1 安装器执行顺序

```text
Preview -> Read bounded bytes -> Validate ZIP entries/manifest -> Show source & conflict
Install -> Revalidate -> Extract to private staging -> Atomic directory swap
        -> Atomic plugins.json update -> Broadcast notes-plugins
Failure -> Remove staging / restore previous directory and state
```

| 阶段 | 强制规则 |
| --- | --- |
| 来源 | 本地文件必须是普通文件且非符号链接；Android `content://` 先复制到应用私有暂存；GitHub 仅 HTTPS 公共主机和固定 API/下载重定向 |
| 归档 | 只接受未加密 ZIP；限制归档/展开/单文件/条目/深度；拒绝绝对路径、`..`、反斜杠、盘符、隐藏路径、`__MACOSX`、符号链接、设备文件、可执行位和重复/大小写冲突 |
| 内容 | 拒绝脚本、页面、WASM、原生库、安装包、快捷方式等扩展名；外部清单不能声明权限；只提取所选插件根目录下的文件，忽略仓库归档中根目录之外的无关文件 |
| 清单 | 唯一 `manifest.json`；`manifestVersion=1`；API major 匹配；ID/版本/平台/设置/贡献/UI schema 严格校验，未知字段拒绝 |
| 提交 | 暂存目录写入并同步后替换；`plugins.json` 使用临时文件替换并保留 `.bak`；目录或状态写入失败都回滚 |
| 恢复 | 安装记录存在但文件缺失、清单被修改或版本不一致时，该扩展不作为可运行插件出现，`installErrors` 显示原因并允许移除记录；内置插件不受影响 |

## 5. 能力与数据边界

宿主权限代理只暴露有类型、可撤销的操作。有效授权取清单声明、用户授予范围、平台支持与当前访问策略的交集；敏感操作额外要求明确用户动作及一次性目标授权。客户端传来的插件 ID、笔记 ID 或路径都不作身份/访问证明。调用绑定插件版本、窗口、运行实例、授权代次及目标代次；执行前、跨异步交付前及写提交前复验。消息层有请求 ID、截止时间、并发/载荷上限、取消及幂等键；只回稳定的错误码与可本地化说明，例如 `PERMISSION_REQUIRED`、`STALE_CONTEXT`、`UNAVAILABLE`、`CONFLICT`、`LIMIT_EXCEEDED`、`TIMEOUT`、`CANCELLED`。已提交但刷新失败单独返回回执，不自动重放。

| 能力及阶段 | 插件可做 | 宿主必须做 |
| --- | --- | --- |
| `format.import/export`，M1 内置 | 声明扩展名/MIME 与能力，将输入转换为受限文档/暂存媒体，或由只读快照编码；同时命中多个处理器由用户选择 | 系统选文件与保存位置、头部探测、句柄限时、解析配额、清洗 HTML/URL、校验 schema 和附件关系；先预览损失/新增数，再按原事务提交；完整归档格式不交给第三方实现 |
| `attachment.preview`，M2 起 | 为明确选中的非核心文件类型提供受限预览 | 复核锁定状态和附件归属，只提供有界、不可转授字节流；禁用/失败回到宿主预览或下载；不泄漏原始路径或宿主 URL |
| `ui.view/panel/command/theme`，M0–M2 | 在白名单槽位贡献 UI、命令或语义配色 | 复用固定 Shell 与主题解析；授权、编辑器和系统菜单永久保留；色板仅允许版本化 token 数据并验证明暗和对比度，不提供全局 CSS、字体 URL、React context 或 Editor 实例 |
| `backup.destination` / `sync.transport`，M3 内置 | 在指定目标对加密对象做读写、修订检查等操作；声明只读、单写者、条件写或特定多写者协议 | 宿主拥有密钥、保存/恢复屏障、调度、加密、快照、保留、重试、冲突与一致性；启用前探测实际能力，不能把普通覆盖写伪装成 CAS，也不自动把任务切到别的服务或保留远端删除权限 |
| 外接 UI，M2/M5 | M2 安装包内的独立页面/面板；M5 可选独立外部客户端，通过单独评审的授权接口工作 | 第三方站点用系统浏览器打开，不附带正文、身份或服务令牌；现有 macOS MCP 保持使用明确 grant 的工具接口，MCP 不是通用 UI 传输。不为外接 UI 暴露 localhost、主窗 RPC、任意回调地址或 Android 假入口 |
| `agent.workflow` / `agent.tool`，M4 内置 | 用户触发总结、提取待办或整理，产生结构化候选动作；工具进目录但默认不给模型调用权限 | 宿主拥有可见上下文、工具白名单、步数/时限、取消及实际提交。正文、网页和模型输出都是数据；不能提升授权、自动执行模型输出或跳过写入确认。插入应用原目标书签与版本，文档变更后不盲写。对外 MCP 暂不自动发布插件工具 |
| `model.provider`，M4 内置 | 声明模型、支持的输入和流式协议，处理协议映射与厂商错误 | 宿主保存凭据引用并负责受管网络、流取消、成本预算和用量；预览发送范围、服务和模型；不静默换云服务、扩展数据范围或用失败重试重复计费。默认不记录提示词、正文、请求头或密钥 |
| `device.adapter`，后续硬件试点 | 通过宿主 `device.bluetooth` 使用经批准的设备 profile，产出点读码、笔迹、录音文件或采集事件 | `device.input` 路由核验设备、授权、窗口和笔记目标，复用速绘、录音及附件提交；隔离 UI 不直接接触蓝牙或设备原始数据。接口与验收见[硬件设备插件](plugin-devices.md) |

### 首批业务调用契约

| 调用 | 最小输入 → 输出 | 状态所有权与提交点 |
| --- | --- | --- |
| Markdown 导入 | 用户选择的文件流 → 文档草稿、暂存附件引用、可定位的转换警告 | 宿主绑定预览与输入摘要、目标资料库及操作代次；确认后沿 Store 事务新增笔记。禁用原始 HTML 和远程资源抓取，不承诺富文本无损；解析/取消失败只清理暂存 |
| Markdown 导出 | 用户选定的笔记快照 → 有界结果流、丢失项报告 | 宿主按快照生成并预览损失；确认后写入系统选定目标。目标文件不交插件写；输出完整验证前不替换已有文件 |
| WebDAV 试点 | 受管连接与对象键、密文字节、预期 `Revision` → 新 `Revision` 或类型化冲突 | 协议适配器不解密；宿主区分远端不存在与读取错误，版本冲突时刷新预览，不用无条件覆盖重试 |
| 选区摘要试点 | 冻结的用户选区与所选模型 → 有序文本事件、终态与用量 | 流结束不写笔记；用户应用时重新确认同一笔记、文档版本及选区目标，经宿主编辑事务提交，可走现有撤销路径 |

### 第三方 UI 与执行隔离

- 首个第三方通道只允许签名的本地资源；优先试验不带 `allow-same-origin` 的脚本 iframe、隔离资源源和严格 CSP，禁网络、外部资源、弹窗、表单、宿主存储、剪贴板/文件与原生桥。阻止 iframe 自导航与权限跳出；CSP 不是唯一边界。宿主桥以 `event.source` 绑定确切 frame，握手绑定随机会话与代次（不能信任 opaque origin 的 `null`）；只处理白名单消息、有限高度和选中上下文；关闭 frame 即吊销引用。不要依赖 CSS 或隐藏 Tauri JS 全局来隔离 `invoke`。
- 原生宿主逐命令核验调用窗口和权限，不把 frame 当成其父窗口的授权主体验证；同时验证直接请求、协议资源与 bridge 均不能触达主窗命令、Cookie 或资产 URL。如真实 WKWebView 或 Android WebView 无法证明以上条件，只开放宿主渲染的声明式 UI/主题，不开放可执行第三方页面；不为兼容性降级放权。
- 网络只允许宿主发起的领域请求。目的地、方法、一次请求的数据范围由权限与目标策略决定；外部提供商使用 HTTPS 受管客户端，重定向重新校验，不访问本机或非允许内网；现有内网 WebDAV 若支持，应保留明确手动配置和单独策略。密钥在原生凭据存储，由客户端向批准目的地附加，第三方 UI 和未来运行时均不读明文。正文离开设备前明示目的地；收回许可阻止后续发送，不能撤回远端已接收数据。
- 将来若开放可执行转换器或 provider，候选是具备内存、时间、中断和显式 host import 限制的 Wasm；须单独验证分发政策、性能和真实双端能力。无默认文件系统、网络和进程权限，不开放任意 JS/Bun、动态库、Shell 或执行 npm 包。通过 UI 隔离测试不等于通过可执行插件评审。

## 6. 现有功能迁移清单

| 优先 | 候选 | 迁移与回退 |
| --- | --- | --- |
| 首期 | 附件详情 | 已从附件右键菜单和只读信息面板抽出插件贡献：菜单入口、信息面板字段和设置都跟随插件状态，关闭时立即撤回入口与已打开面板；宿主继续拥有附件读取、打开、保存和导出。内置配色仍是后续候选；选择额外配色后，停用时有效主题回到 Classic，偏好保留、明确提示，不改正文或重建 Editor。若引入外部主题 ID，须同步更新前端和原生归档校验、离线回退与跨版本策略后才开放 |
| 第二批 | Apple 备忘录导入、附件导出、可选扫描/OCR UI | 现有 Apple 导入保留 macOS 主窗口、预览和复制语义，文件访问权限及 Store 提交流程仍归宿主；附件导出复用系统 picker 和授权；扫描/OCR 仅迁入口和展示，不迁原生相机/Vision/Android 权限或已有素材。Markdown 是新增试点，不宣称现有功能 |
| 高风险后置 | WebDAV / S3 / GitHub；OneDrive / 百度网盘 | 先以内置 WebDAV 验证 adapter contract，旧 provider ID、连接配置、密钥引用和用户启用状态不变；再逐个迁移。OneDrive 个人版/组织版、百度不可变 heads 分别保留各自能力，不混作同一个条件更新协议。真实账号与设备仍按[现有契约](settings121.md#首批网盘-oauth已实现待真实账号验收)另验 |
| 选择性迁移 | 备份目的地、MCP 测试界面 | 只迁可选备份目的地或附加展示，系统恢复页、默认本地备份与备份格式保留；可将 MCP 测试器做成内置可选页面，启用、授权、撤权、包内适配器和私有 IPC 仍归宿主 |
| 不迁移 | 正文 schema、编辑与保存、附件生命周期、CyberBus、登录、锁定、软件更新、安全模式 | 保留始终可用的核心入口。首期无自定义持久化节点、关系 schema 或同步 wire；插件停用不能使已有笔记无法读写 |

迁移按“默认启用保持当前表现、显式关闭验证回退”的顺序。新增注册成功后才撤掉旧调用入口；同一服务不能同时运行新旧两条任务。若配置转换必需，以旧值建立只读输入并仅更新插件拥有的字段；不迁真实凭据明文，不重置显式 `false`。配置、授权、插件私有数据与已产生的笔记/备份分开：禁用或卸载不清理笔记、不操作远端。删除插件私有数据/凭据为独立确认。安全模式在加载插件之前接管；它公开的是核心可用性，不代表成功恢复第三方权限。

## 7. 分期与验收门槛

阶段是依赖顺序，不是当前交付承诺。M3 与 M4 在 M1 之后可分别推进，不依赖 M2 的第三方执行能力。硬件单独排期：M0 保留语义能力查询、适配器和输入接口的设计；未来以内置适配器验证原生蓝牙与输入路由，独立于 M2，不占用 M0/M1 的实现验收。

| 阶段 | 建议责任方 | 可关闭的交付门槛 |
| --- | --- | --- |
| M0 内置 UI 基座 | 桌面/移动 UI、Rust 宿主 | 固定注册、设置入口、面板、配色、默认与停用；两窗状态一致，坏面板可单独重试，安全模式不加载插件，输入/Undo/录音无回归 |
| M1 文件能力 | 编辑器、Store | Markdown 导入预览→一次提交→跨窗更新；导出明确有损映射，格式冲突可选；取消/撤权/旧目标无写入，附件原字节与完整归档往返不回归 |
| M2 声明式第三方 UI（已实现 lite） | 平台、安全、UI | 当前放行 ZIP/GitHub 的宿主渲染区块、设置与贡献描述；安装后关闭、升级/卸载/来源展示、路径与可执行内容拒绝、原子写入和损坏记录隔离已通过 Rust/前端回归。仍未放行可执行页面，后续隔离探针通过后再单独开放 |
| M3 同步/备份 adapter | 存储、同步 | WebDAV fixtures 校验密文/条件写/冲突、暂停/恢复与超时；新旧配置和回执一致，只读与多设备策略不混用。无空闲单例、无重复传输、关闭仍可恢复本地归档 |
| M4 模型/Agent | 应用服务、模型、隐私 | 一个内置 provider 和选区摘要流程；模拟流式取消、429、账单不明、目的地变更、上下文污染、锁定及写入确认。没有供应商的离线状态不影响编辑器 |
| M5 扩大生态 | 发布、安全 | 独立评审外部客户端协议、可执行运行时、信任链和撤回机制，再决定是否发布 SDK 或目录；先有平台安全证据再开功能开关 |

横向验收：单元/契约检查覆盖 manifest、依赖、权限矩阵与回执；集成检查用隔离应用数据、模拟网络和受控延迟覆盖禁用/卸载/退出/睡眠、资源回收、撤权后的晚响应与同步写入竞态；浏览器检查 UI；实际 macOS 安装包和 Android 签名候选验证资源加载、桥隔离、原生菜单、返回/IME、前后台和权限弹窗。不得用 fixture 或构建成功替代真实双端安全和数据验收。

## 8. 待评审决策

| 决策 | 建议与收口条件 |
| --- | --- |
| 第三方首发是否运行 JS？ | 默认否。M2 只有在原生桥隔离、网络与导航阻断、资源回收实机证据齐备的端开放；其余端保持声明式方案。平台和安全共同签字 |
| 是否开放替换内置 UI？ | 只评估可恢复的辅助集合视图，且用户明确选择、可一键还原；设置、编辑、解锁、备份恢复永不开放替换。产品和可访问性评审先做 |
| 插件来源如何信任？ | 当前仅支持公开 GitHub 与本地 ZIP，界面显示实际来源，SHA-256 只做完整性；不声称签名或发布者认证。签名包/商店需先明确签名根、换钥、撤回离线策略与 Android 分发约束 |
| Agent 自动化与模型默认策略？ | 默认离线不上传；先批准一次选区摘要与显式写入。联网附件、常驻后台、批量工具及模型代理需另案评审 |
| 首批可选业务适配器？ | WebDAV 验证修订与网络边界；Apple 导入、MCP 测试器等只迁 UI/注册入口，不重写已有服务。维护者以历史兼容和回退实测裁决 |
| 是否开放硬件给外部插件？ | 先验内置 SmartPen 的点码和手写，再按真实录音设备验证文件导入。外部适配器、后台捕获和实时录音控制需另行评审，不随第三方 UI 一起放行 |
