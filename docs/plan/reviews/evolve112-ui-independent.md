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
