# APP-001 FIX07 新建响应 access 同次采纳：独立有限静态审查

- 审查日期：2026-11-03。
- 冻结实现：`4ddb0f98c3551535b98c383d27ef3cebd205d9b6`，隔离目录 `/private/tmp/apple-notes-paper-selection-07b`，基线 `8b9d6af`。
- 结论：本次有限静态门槛通过，未发现需阻断该候选合入与构建的新增问题。此结论不代表实际 Android 纸张切换已通过，也不关闭原 `e117f929…` 安装包失败或整体像素/交互验收。
- 未修改实现、依赖或锁文件；未占用 Mac/Android、未构建安装包、未在主工作树 git add/commit。

## 范围与实现

独立核对完整基线差异。产品修改仅为 `src/App.tsx` 的 createNote 响应类型和同一次 `setWs` 更新：加入返回 note 的同时采纳 `n.access ?? prev.access`。其余差异为既有定向检查扩展和开发证据三份文件。未发现 hydrate、AccessGate、原生 Session/Store、clearSensitive、纸张关闭/书签、保存队列或 pending 清理逻辑的产品修改。

原失败原因及实际观测范围以 `app-001-fix-07-cause-01.md` 为准。本候选让新建笔记的 epoch 条目与 note 同时进入 workspace；首次合法纸张刷新不再因本次 createNote 丢弃 access 而出现旧条目缺失、返回 epoch=0 的差异。它没有把缺失 epoch 归一化为 0，也没有豁免真实授权变化。

## 原生链路与 fallback 边界

已直接检查冻结源码，实际原生链路如下：

1. `src-tauri/src/lib.rs` 的 `workspace_action` 调用 `mutate`；createNote 不需要 barrier，进入 `Session::ordinary`。
2. `src-tauri/src/session.rs` 的 ordinary 先检查 token 和 pending，再调用 Store；返回前调用 `tagged`。tagged 从 `snapshot` 生成并附加完整 access。snapshot 遍历当前 Store notes，新创建 note 包含 epoch（默认 0）和真实 authorized 状态。
3. `src/bridge.ts:156` 的 native action 等待 IPC 响应，再调用内部 accept，createNote 使用既有 read 模式。`accept` 在取不到 `value.access` 时先抛“后端未提供授权状态”；存在快照时先执行 `accessGate.accept`，成功后才 return value。AccessGate 拒绝错误直接向上传递。
4. `src/App.tsx:845` 的 createNote 只有在 action 成功返回后才确认 revision、执行同次 workspace 更新及选中 note；既有 catch 负责失败提示。

因此 `?? prev.access` 不会让原生缺失 access 的响应继续被采纳。其兼容用途与当前 browser preview 源码一致：非 native action 的 createNote 返回普通 note，无 access 字段，最后 structuredClone 返回；此处 fallback 保留已有 workspace access。`Pick<Workspace, "access">` 的 access 仍是可选类型，并不是编译期原生协议保证；本结论依赖已核实且未改变的 bridge 运行时拒绝链路。

这次只核对既有授权边界与所改调用的连接，未扩展为全量授权协议或并发时序审计。

## 定向检查独立复跑

在冻结隔离目录，临时链接主目录现有 node_modules，未安装/下载依赖；复跑后删除链接，`git status --short` 为空。

| 检查 | 独立结果 | 实际覆盖与限度 |
| --- | --- | --- |
| `node scripts/check-document-identity.mjs` | 26 项通过，退出 0 | 生产 JSON 比较器、真实 PM schema/state/history、从当前 App AST 抽取的 createNote/hydrate/key、实际 AccessGate。 |
| `pnpm test:access` | 16 项通过，退出 0 | 既有生产响应门的有限 delivery-order / revision 边界用例。 |
| `pnpm typecheck` | 通过，退出 0 | 当前 TypeScript 类型检查。 |

新增 4 项覆盖新建响应与其 access 同次进入 workspace、首次纸张样式刷新保持 key 且不调用清理、旧授权条目缺失仍调用清理，以及等待响应期间 epoch 或 session 更新时旧响应被拒绝且不插入 note、不替换最新 workspace。原有真实正文变化、session/epoch 清理、pending/unauthorized 等用例继续通过。

检查中的 action 是测试替身：它调用真实 AccessGate 后返回构造响应；并未执行真实 bridge/native IPC。setWs 也是同步测试环境，不挂载 React，`clearSensitive` 由记录器替代；所以“never clears editor”用例名的可验证含义限于抽取回调没有调用清理器，不能证明实际 Editor/View/DOM 身份或光标已保持。bridge 缺 access 先拒绝的边界来自以上直接源码核对，并非这 26 项中的 IPC 运行用例。

## 后续验收边界

可进入主任务合入、冻结构建来源与 APK 构建。仍须在含本修改的实际安装包上重跑原生 grid-large 失败点，记录取消和实际选择两次操作各自的完整正文、selection、键盘状态以及 Editor/View/DOM 身份；并保留真正正文变化及授权变化的有界检查。原 `e117f929…` 的运行失败不能由本次静态结果追认通过。Mac 窗口关闭独立实际验收与此报告分开，未在本次执行。
