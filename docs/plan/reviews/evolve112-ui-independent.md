# evolve112 UI 独立审查

日期：2026-11-17。审查者未参与实现。被审提交：`6b0c54b0313fa6a7fab48e8e247c8b0982445fc9`。

## 结论

**BLOCKED：2项P2 blocking，0项P1。** 作者定向检查通过，但新增独立边界实际复现公开配置与HostSettings兼容性缺口。必须由develop修复并复核后才能给UI模块SOURCE_PASS。真实宿主装配仍为integration-open，未因未接Preferences/Tauri或未运行原生应用而判阻塞。

范围仅新增的`src/AgentSettings.tsx`、`src/AgentSettings.css`、`src/agent-client.ts`、作者两个检查脚本及`docs/verification/evolve112-ui.md`；只读关联host DTO/容量及IPC启动参数契约。工作树仅新增本报告，不改产品代码/脚本。未启动用户应用、操作手机、访问原库或真实授权；浏览器为隔离headless profile，transport为合成fixture。

## Blocking发现

### P2 B1：重载既有授权后，自定义runtime的复制配置不可运行

位置：`src/AgentSettings.tsx:118`、`:183`、`:221`；`src/agent-client.ts:25`、`:145`；`docs/verification/evolve112-ui.md:72`。关联host `src-tauri/src/agent_host/types.rs:92`的HostSettings也不含runtimeDir。

复现：使用非默认runtime的创建回执，刚创建时配置包含准确`--runtime-dir`；点击页面“刷新”（等价于重新进入后读取HostSettings），选同一有效grant查看配置，再复制stdio JSON。实际Clipboard结果仅有workspace-id/credential-ref，**丢失runtime-dir**。适配器按`docs/architecture/agent-ipc.md:37`转到默认目录查找私有凭据，自定义runtime的凭据在那里不存在，因此这份公开配置无法连接原授权。TOML使用相同args构造，同样受影响。界面说明不能替代可运行配置，也不能把支持的自定义runtime缩减为“只能刚创建时复制”。这不是要求本轮完成真实宿主接线。

最小修正：固定HostSettings安全返回准确runtimeDir，与Rust/TS DTO及严格解析同步更新；在创建与既有grant配置中始终使用权威目录，禁止无声退回默认。该字段不含rawcredential。增加“非默认目录创建→刷新/重新挂载→JSON/TOML复制仍保留准确目录”的回归用例，并由后续真实装配验证适配器查找成功。

### P2 B2：合法257目录grant使整个设置页不可用，无法撤销

位置：`src/agent-client.ts:94`的`strings`硬限制256；`:108`用于读取grant.folderIds；`:140`也用于创建输入。`src/AgentSettings.tsx:123`在该解析错误后清空settings。

真实host `runtime.rs:193`允许最多10,000个显式目录。独立Rust探针调用被审真实AgentHost与111真实agent_access，成功创建257目录grant并导出HostSettings（仅安全元数据）；把这份真实DTO交给生产client解析器得到`AgentClientError("dto")`，交给实际组件后整个页只有错误态，没有运行开关或撤销按钮。一个合法grant阻断该workspace全部授权的UI管理；创建对话也可以勾选257目录，但最终被无提示容量约定的前端上限拒绝。

最小修正：拆分scope和folderIds的集合校验，folderIds上限对齐host 10,000；继续拒绝空集合、重复ID及无效值。对257及10,000合法边界、10,001非法边界补client/组件用例，至少保证合法HostSettings可展示和撤销。若决定收紧host容量，必须作为共享契约统一修改并处理已有合法记录，不能只在UI拒绝。

两项均已在审查过程立即通过对话通知。向主线程的额外跨线程工具投递被工具明确拒绝（不允许向native ancestor发送）；未声称该工具通知成功。

## 已通过的独立核对

- 开关使用宿主确认状态；失败保留旧值。创建不隐式选择目录、不递归、不混入smart/trash，read/create/update可独立授权。
- 实际client四命令带既有accessGate.expected，返回时核对generation/session/epoch；不可用与错误显示使用安全消息，无localStorage或持久化后备。
- 创建响应扩张scope或改变incarnation，组件均拒绝采用，不显示可复制配置；失败撤销保留确认的grant/config，不泄露任意transport错误。
- dialog焦点/Tab/Escape、busy防重复与禁止伪取消、父级返回焦点；窄短窗浅深样式滚动。clipboard失败仍保留手动配置，不误报成功。
- rawcredential不进入启动配置；JSON/TOML按参数数组生成，无shell拼接。上述B1要求增加的runtimeDir是路径元数据，不要求输出secret。

## 实际命令与结果

在UI工作树运行：

```sh
pnpm typecheck
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/check-agent-settings-browser.mjs
```

均退出码0：typecheck无错误；作者**8组**实际DOM/transport检查通过，生产页无未处理pageerror。其覆盖和合成transport限制与作者记录相符，不能据此声称真实宿主落盘、撤销IPC或MCP端到端已通过。

独立临时脚本`/tmp/evolve112-ui-independent.mjs`通过临时Vite入口挂载被审生产组件/client，复用作者fixture作为transport，阻止外部网络请求，不改仓库脚本：

```sh
node /tmp/evolve112-ui-independent.mjs
```

退出码0：**6项边界完成，4项PASS、2项BLOCKING_REPRODUCED，pageErrors=[]**。脚本以“缺陷确实存在”为复现断言，退出0不代表缺陷已修复。完整临时结果：`/tmp/evolve112-ui-independent-results.json`。

- B1实际复制前args含`--runtime-dir`及创建回执目录；刷新后实际Clipboard args只有`--workspace-id`和`--credential-ref`。
- B2真实HostSettings的folderIds.length=257，生产parser返回dto错误，实际DOM没有开关/撤销操作。
- 其余4项：撤销失败保持状态并净化错误、Clipboard拒绝保留手动文本、创建响应scope扩张拒绝、创建响应跨incarnation拒绝。

B2真实宿主数据由只在`/tmp`的补充harness生成，lib绝对路径引用被审host源码、仍提取真实111 agent_access定义；文件仅含HostSettings，测试私有目录结束清理：

```sh
EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111 \
CARGO_TARGET_DIR=/tmp/evolve112-host-target \
cargo test --manifest-path /tmp/evolve112-host-independent-harness/Cargo.toml --offline --locked ui_contract_real_host_accepts_257_explicit_folder_ids
```

退出码0：**1 passed，0 failed，25 filtered out**。host源提交`a10b53fe654428e2eae737bbce025001076fbd3f`，111 HEAD `868c6dcf960cb3c92f3c9330ec22fbaf7431fe91`。未改两个工作树中的任何产品文件。

临时脚本首次启动引用了不存在的plugin-react/dist/index.mjs而失败；改用本机既有包导出的index.js后运行成功。这是临时验证入口修正，不是产品变更。

`git diff --check`与报告暂存后的`git diff --cached --check`：退出码0，无输出。

## 装配与后续

宿主独立模块报告已提交`29404612bf357913ba3b2afa005f6ed1e872b2eb`，结论MODULE_SOURCE_PASS / integration-open；本报告B1要求同时补齐host对外安全配置元数据，B2要求共享容量一致。真实Preferences/访问遮挡、Tauri命令签名、唯一Session/窗口协调、stdio→IPC→SQLite及准确原生包未装配执行，保持open，不算已通过。incarnation轮换必须停止旧host并重新授权，不要求沿用旧授权。

P1/P2 nonblocking缺陷：0。待develop修复上述2项后，限定复核相关契约与边界即可，不需重跑整个历史测试集。

## 2026-11-17 两项阻塞修复的独立复核（最新结论）

被审UI修复：`5b67db3eb7e54fba7a1e827cb951cc72e5600abb`；配套host修复：`48b4711c`。**MODULE_SOURCE_PASS / integration-open；历史B1、B2均关闭，当前P1/P2 blocking 0。** 上文BLOCKED及首次复现为历史记录，保留原文；本段是当前修复版本结论。本轮只追加本报告，未修改产品代码或作者脚本。

### 阻塞关闭依据

| 历史发现 | 源码修复与独立验证 |
| --- | --- |
| B1：自定义runtime重载后丢失 | `agent-client.ts:126`把runtimeDir列为必需字段，`:112`统一验证无控制字符绝对路径；HostSettings、CreatedGrant.connection、launch均使用该验证。`AgentSettings.tsx:170`拒绝创建回执与当前host runtime不一致；`:183`始终从settings.runtimeDir生成配置，不再依赖创建时缓存。实际创建→刷新→完整重挂载后的JSON/TOML及Clipboard参数精确一致；再改变模拟宿主返回的权威runtime并刷新，配置采用新值而不复用旧创建目录。TOML通过独立Python tomllib解析后与期望command/args相等。 |
| B2：257目录合法grant阻断页面 | `agent-client.ts:95`目录集合独立限制10,000，按128 UTF-8字节、非空/唯一/无首尾空白/控制字符检查；`:104`scope单独按3项支持枚举校验。真实host生成的257/10,000目录created/settings/revoked DTO均被三条生产解析路径接受；实际组件显示全部目录，开关可用、撤销请求使用准确grantId，采用真实host撤销DTO后显示已撤销并清理配置。10,001目录在input/settings/created三条路径均拒绝。 |

与主树最新`docs/architecture/agent-ipc.md:57`必需runtimeDir、10,000物理目录及独立scope契约一致。真实host runtimeDir增量已通过对应宿主独审追加段。本结论没有豁免任何原阻塞。

### 本轮实际命令

```sh
pnpm typecheck
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
EVOLVE112_UI_SETTINGS_FIXTURE=/tmp/evolve112-host-independent-runtime-settings-final.json \
node scripts/check-agent-settings-browser.mjs

node /tmp/evolve112-ui-independent-recheck.mjs
```

结果均退出0：typecheck无错误；作者脚本**12组通过**（含真实host安全DTO回放及40个非法边界）；独立复核**9组通过，pageErrors=[]**。独立解析边界含**33项正向、49项反向**，不是把脚本退出0当作缺陷复现成功：本次断言明确要求B1/B2已修复。

独立9组：

1. 含中文、空格、引号、反斜杠的自定义目录与可执行路径，创建、刷新、完整重挂载及权威目录变化后，实际JSON/TOML/Clipboard准确；TOML另经Python 3.12的tomllib解析，不只与实现相同的字符串拼接比较。
2. 撤销失败保持确认grant/config且不泄露transport原文。
3. Clipboard拒绝仍保留手动复制文本。
4. 创建响应扩大scope时拒绝采用。
5. 创建响应跨incarnation时拒绝采用。
6. 创建响应runtime与已确认settings不一致时拒绝采用。
7. 真实host 257目录DTO的加载/刷新/重挂载/准确复制及可撤销。
8. 真实host 10,000目录DTO的相同行为，全部目录实际渲染、开关和撤销入口保留。
9. 三条解析路径验证257/10,000目录、128 UTF-8字节ID、合法opaque ID和全部7种非空scope组合；拒绝10,001目录、129字节ID、重复/空/空白/控制字符目录、空/重复/非枚举scope以及缺失/非法runtime。

临时复核脚本和结果分别保留在`/tmp/evolve112-ui-independent-recheck.mjs`、`/tmp/evolve112-ui-independent-recheck-results.json`。原`/tmp/evolve112-ui-independent.mjs`和历史结果未覆盖，仍用于追溯原失败场景。

真实安全DTO由本轮独立运行的真实host harness生成；最终上游改为主工作树，不再依赖旧111树：

```sh
EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone \
EVOLVE112_UI_SETTINGS_FIXTURE=/tmp/evolve112-host-independent-runtime-settings-final.json \
CARGO_TARGET_DIR=/tmp/evolve112-host-independent-author-final-target \
cargo test --manifest-path src-tauri/src/agent_host/harness/Cargo.toml --offline --locked -- --test-threads=1
```

host树执行结果23 passed / 0 failed；独立host另有6项边界通过。host运行中的实际创建及撤销，与UI对安全created/settings/revoked DTO的消费分别验证；UI使用fixture回放这些返回值，**没有实时IPC、没有真实Preferences/Tauri装配、没有最终Session/SQLite/窗口或原生端到端验证**。测试临时runtime已清理，不声称测试结束后的配置仍可连接。

临时TOML检查首次调用系统Python 3.9因缺少tomllib未运行完成；改用本机既有Python 3.12后9组全过，未安装依赖或修改产品。host检查中观察到的共用target产物复用和100ms expiry时序敏感已在host报告追加段如实记录，最终采用独立target与主树上游串行23项全过。

修复提交增量、工作树`git diff --check`及报告暂存后的`git diff --cached --check`均退出0；用字节前缀比较确认原报告完整保留。当前无新增P1/P2 nonblocking缺陷；真实UI/native装配继续open，由后续装配验收承接。
