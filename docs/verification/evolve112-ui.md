# evolve112 Agent 接入设置：develop 交付

2026-11-17。工作树 `Apple-Notes-Clone-evolve112-ui`，分支 `codex/evolve-112-ui`。

本交付仅为独立前端模块及开发阶段定向检查，不承担自己的独立 verify。未接 Preferences/App，未修改 Rust，未操作用户应用、实际授权、原配置或资料库。真实宿主落盘、stdio/MCP 全链路与独立 verify 留给后续负责者；下述合成 transport 不构成落盘证据。

## 输入依据及文件

- 阅读 `docs/architecture/agent-mcp.md`、`agent-ipc.md`、`docs/ui/adaptive-presentation.md`。
- DTO 按只读宿主工作树 `Apple-Notes-Clone-evolve112-host/src-tauri/src/agent_host/types.rs` 的 `HostSettings`、`GrantInfo`、`CreateGrant`、`CreatedGrant`、`ConnectionConfig`、`AuditEntry` 对齐。
- 新模块：`src/AgentSettings.tsx`、`src/AgentSettings.css`、`src/agent-client.ts`。
- 开发检查：`scripts/check-agent-settings-browser.mjs`；`scripts/check-agent-settings-fixture.mjs` 仅为该检查服务的浏览器入口，不单独用 Node 执行。
- 本工作树 node_modules 链接到主工作树的既有依赖；未修改依赖清单或锁文件。

## 组件接入契约

```tsx
import AgentSettings from "./AgentSettings";

<AgentSettings
  folders={workspace.folders}
  onClose={returnToSettings}
  returnFocus={agentSettingsTrigger}
/>
```

`AgentSettingsProps`：

| prop | 类型 / 默认 | 用途 |
| --- | --- | --- |
| folders | `readonly Folder[]`，必传 | 复用现有 Folder；内部只接受 default/normal/quick，排除 smart/trash。初始目录选择为空，不递归隐式授权 |
| client | `AgentClient`，默认 `agentClient` | typed transport injection，仅供组件检查或明确的宿主适配；注入返回仍经相同 DTO 校验。生产省略，调用者若注入需保持引用稳定 |
| mobile | `boolean`，默认 false | true 仅显示首版桌面可用说明，不请求宿主、不呈现运行开关 |
| onClose | `() => void`，可选 | 显示“返回设置”，交由父组件关闭或返回分类页 |
| returnFocus | `HTMLElement \| null`，可选 | 组件卸载后，在仍连接、可用、非 inert/hidden 时返回入口焦点；调用者保持引用稳定 |

父组件应仅在 Agent 分类活动时挂载，或切走时卸载，避免隐藏分类长期保留授权配置。当前文件不承担父级设置页的分类路由、外层焦点约束或宿主访问撤销遮挡；这些继续由原有设置/访问边界持有。

页面自身滚动；创建对话有独立滚动、`aria-modal`、打开聚焦名称、Tab/Shift+Tab 循环、焦点外逃约束和 Escape 关闭。创建前取消不调用 create；提交已开始时取消/关闭/Escape 被禁用，避免把已提交请求描述为取消。成功返回原创建按钮。若父级强制卸载，已提交的宿主写入不能被前端取消，迟到响应只被丢弃；重新进入必须读取宿主实际列表。

开关只显示已确认状态，初始默认关闭文案不冒充读到的宿主状态。开启后才允许创建；读取、新建、修改为独立复选框。显示授权有效/过期/撤销/接入关闭状态、真实目录范围及凭据引用、近期操作元数据。关闭总开关不把既有授权标成已撤销。

## 客户端 API / DTO

`AgentClient` 全部为 Promise：

| 方法 | Tauri command / 参数（均附 `expected`） | 返回 |
| --- | --- | --- |
| settings() | `agent_settings` `{expected}` | AgentHostSettings |
| setEnabled(enabled) | `agent_set_enabled` `{enabled, expected}` | AgentHostSettings |
| createGrant(input) | `agent_create_grant` `{input, expected}` | CreatedAgentGrant |
| revokeGrant(grantId) | `agent_revoke_grant` `{grantId, expected}` | AgentHostSettings |

`expected` 在调用时直接来自既有 `bridge.accessGate.expected()`。返回时再次检查 access generation/session/epoch；原生不可用明确报错，没有 localStorage、演示数据或浏览器持久化后备。set/revoke 返回完整 HostSettings 是本模块的宿主接入要求，真实宿主集成须确认命令签名和返回与此表一致。

导出 DTO：`AgentScope`、`AgentGrant`、`AgentOperation`、`AgentHostSettings`、`CreateAgentGrant`、`AgentConnection`、`CreatedAgentGrant`。HostSettings 字段 enabled/hostSessionId/workspaceId/incarnation/runtimeDir/grants/recentOperations；CreateGrant 字段 clientId/scopes/folderIds/expiresAt；CreatedGrant 字段 grant/connection，其中 connection 为 workspaceId/credentialRef/runtimeDir。

验证器拒绝未知/缺失字段、错误类型、无效或不安全整数时间、重复/空集合、非首版 scopes、跨资料库/incarnation 的 grant、重复 grantId、connection 与 grant 身份/引用不匹配。创建响应还必须与请求的名称、有效期、权限和目录集合一致；授权不能静默扩张。输入名称最多96个 UTF-16 code units；CreateGrant/GrantInfo 的 folderIds 为非空、唯一、最多10,000个，ID 与 host 的 valid_id 一样检查首尾空白、控制字符和128 UTF-8字节。scopes 独立按首版3项枚举检查且非空/唯一，grant列表上限256、近期操作200，不再把256混用于目录集合。runtimeDir 在 settings 和 created.connection 均为必需的无控制字符绝对路径。时间为 Unix 毫秒。宿主仍须执行最终权限、文件夹、有效期和容量验证。

错误文本只来自前端安全消息，不直接显示任意 transport error 或输出无效 DTO，防止凭据/请求内容进入界面。近期操作仅呈现 DTO 中的 clientId/tool/noteId/at/outcome，不宣称具有持久审计历史。

## 配置复制

可执行文件路径初始为空；填写绝对路径前不生成可复制的假配置。页面明确提示不负责安装或检查文件，未安装时配置不可运行，用户填写路径不代表文件存在。

`agentLaunchConfig(binaryPath, connection)` 输出：

- stdio JSON `command` / `args` 片段。
- TOML `[mcp_servers.cybernote]`，字符串按转义后的字面量输出；客户端外层配置依其实际支持方式调整。
- 参数仅为 `--workspace-id`、`--credential-ref`、必需的 `--runtime-dir`。runtime 统一取 HostSettings 的权威路径，不持有、不显示、不复制原始 credential。

HostSettings 必须包含宿主实际 runtimeDir。新建和既有授权的两种配置均使用此值；创建回执的 connection.runtimeDir 必须与当前 settings 一致，否则拒绝采用。移除只在新建期间缓存 connection 的状态及猜默认目录的文案；刷新/卸载后重新载入仍从 host 获得准确路径，不从资料库路径推导。

Clipboard 失败时提示手动复制；成功提示只在 Clipboard Promise 成功后出现。配置仅保留在组件内存，离开或重新加载清除。

## 开发检查

执行：

```sh
pnpm typecheck
PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs \
CHROME_PATH=/absolute/path/to/chrome \
node scripts/check-agent-settings-browser.mjs
```

检查使用隔离的 headless Chrome profile 和临时 Vite 服务，实际挂载生产 React 组件、实际 DOM/焦点/键盘/Clipboard/CSS，数据与 Tauri transport 为合成 fixture。未启动用户桌面应用、未读写用户授权/配置/资料库；没有创建第二个 Store。

2026-11-17 最终开发检查结果：`pnpm typecheck` exit 0；`check-agent-settings-browser.mjs` exit 0，输出8组实际组件/transport检查，生产组件页无未处理 pageerror。执行环境为本机既有 Chrome + Playwright Core；未新增依赖。检查期间修正了 fixture 在 React StrictMode 双 mount 下“一次性加载失败”被第二次读取掩盖的问题，最终加载失败/重试断言使用显式解除的失败状态。

覆盖：加载与空态分离、默认关闭、开关失败保留旧值；主动目录选择并排除 smart/trash；read/create/update 分别单独授权；空输入禁止调用；取消与 Escape 零 create；名称焦点、Tab 循环、关闭回触发器；创建失败保留输入；busy 防重入并阻止取消；撤销确认清除配置；绝对路径与实际 Clipboard 复制、引号/反斜杠转义；长名称/缺失目录/过期/近期操作；浅深两种样式下360×440窄短窗滚动；加载重试、父级返回焦点、native 不可用、mobile 不调用；实际 agentClient 的四个命令与 expected；严格 DTO/input 拒绝与访问代际迟到响应拒绝。

结果仅报告 develop 定向检查，不标注独立 verify PASS。真实宿主持久化、撤销与关闭后的 IPC 行为、主 Preferences 接入、AppKit 叠层及准确安装包验收尚未执行。

## 未接入点

后续装配者在 Preferences 注册 Agent 分类并传入现有 folders，处理父级返回及分类生命周期。须在原访问/同步遮挡内挂载，不旁路访问边界；移动端不开放本机运行开关。未修改 App、Preferences、types 或任何已有组件，未管理 worktree 或合并分支。

## 两项 UI 独审阻塞的 develop 修复

2026-11-17，UI 基线 `3ce89d07`；先行 host 补齐提交 `48b4711c`（HostSettings 必需 runtimeDir、真实目录边界/重启/撤销回归）。本次只改 typed client、AgentSettings、两个定向脚本和本文。独审报告与任务状态不改；待 Parfit 增量独审，本文不自授 SOURCE_PASS。

- HostSettings/CreatedGrant.connection/配置生成统一要求准确的绝对 runtimeDir，未知/缺失字段仍严格拒绝；组件新建回执与已确认 settings 的 runtime 不一致时拒绝采用。刷新和重新挂载都使用重新获取的 HostSettings，JSON/TOML 必带该路径。
- folderIds 独立校验10,000上限，scopes独立校验支持枚举与唯一性。空/重复/非法目录、10,001个目录、非法/重复/空scope继续拒绝；native availability 和 accessGate.expected/迟到响应检查原路径保留。
- 用真实 host 新回归重新生成安全 DTO `/tmp/evolve112-real-host-settings-fix.json`，不沿用 Parfit 旧无 runtimeDir 的 `/tmp/evolve112-valid-host-settings.json`，不改其原探针或原失败结果。
- 实际 browser 检查读取真实 host 创建的257及10,000目录 settings，组件全部显示、总开关/撤销仍可用；调用撤销时匹配真实grantId并采用真实 host.revoke_grant 返回的 DTO，确认撤销和配置清除。对两个真实 DTO 都执行刷新及完整重挂载，并通过实际 Clipboard 对 JSON/TOML 的全部参数作精确相等断言。
- 以上是实际 host 返回值→生产 parser/component 的安全 DTO 回放，浏览器 transport 不是实时 IPC；原 host 测试已实际创建及撤销。原私有 runtime 在测试结束清理，没有声称这些临时配置能在测试结束后连接或证明 Session/SQLite/最终装配。

执行（UI树；无主Tauri target/用户App/原库）：

```sh
pnpm typecheck
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
EVOLVE112_UI_SETTINGS_FIXTURE=/tmp/evolve112-real-host-settings-fix.json \
node scripts/check-agent-settings-browser.mjs
git diff --check
```

结果：typecheck退出0；浏览器12组检查通过、pageerror为空，含40个非法边界（create/settings目录与scope、settings/connection/launch的runtime缺失或非法）、257/10,000正向目录界限、真实host DTO加载/撤销、custom runtime重载后的两种配置、创建回执runtime不一致拒绝，以及原native不可用/accessGate用例。日志 `/tmp/evolve112-ui-fix-typecheck.log`、`/tmp/evolve112-ui-fix-browser.log`。不设置 fixture 环境变量时脚本明确报告未执行真实 host DTO 回放，不把合成结果冒充该项证据。

重生成真实 host DTO 使用 host树的 `ui_contract_real_settings_and_revocation_support_257_and_10000_folder_ids` 测试，设置 `EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111`、`CARGO_TARGET_DIR=/tmp/evolve112-host-fix-target`、`EVOLVE112_UI_SETTINGS_FIXTURE=/tmp/evolve112-real-host-settings-fix.json`，其完整命令及23项host回归结果见host树 `docs/verification/evolve112-host.md`。未修改主线内部契约文件或App/Preferences/其他模块。
