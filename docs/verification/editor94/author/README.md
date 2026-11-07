# APP94 作者定向验证

最终产品冻结 `630d9b8c`，基于 `d09a26e8`，产品仅修改 `src/note-tag-extension.ts` 和 `src/editor-schema.ts`。原 APP93 分支保留，当前实现位于 `codex/editor94-develop`，未改 main。完整源码身份和自然退出状态见 `validation.json`。

- `keyboard-final`：真实 React NoteEditor，15/15，通过，中英文 Enter、单次 Undo/Redo、下一段无 mark 泄漏、无 keydown 的 `beforeinput insertParagraph`、标题/普通列表/任务列表/表格 Enter、两个 composing guard、重复事件、附件/绘图 NodeSelection 与被阻止 Enter 的同 tick 后续 split。对应 runner `f8b8ba97`，产品 `630d9b8c`。
- `tags-regression`：既有真实 Editor/App 标签检查 27/27，通过，包括空格提交、既有标签有效性和 App 保存失败边界。
- `production-final`：`pnpm typecheck`、`pnpm build`、既有 `check-production` 全部自然 0。生产 debug API 缺席，URL 不能重新启用，包内 debug/mock 标记不存在，renderer errors 为空。Vite 仅有现有 chunk 大小提示。
- `schema-96.json`：`pnpm test:schema` 自然 0，96 个文档用例，原嵌入 manifest 完全相同；未改 Rust schema 或 wire。

最终 DOM、标签回归各保存实际 `src` 和 runner 的前后 SHA-256。生产检查另保存全部动态产品输入的前后 SHA-256；三个范围前后均精确一致。验证期间产品和 runner 冻结。浏览器及生产命令的 stdout/stderr 与自然退出状态分别原样保留。

`dom01-failure.json` 保留最初失败，但其中作者 focus command 与真实按键之间缺少完成等待，不能将所有 Enter 快照作为准确键盘基线；独审另有准确真实键盘基线。`dom02-failure.json` 保留首产品 Enter 被 Tiptap 失败命令的空事务消费候选的真实失败。`dom03-failure.json` 保留 Tab 断言使用 `documentText.trimEnd()` 的错误：快照中的实际正文已经是 `left\t`；之后改为检查原始 JSON 文本。dom03 附近有源码改动，不作为最终冻结证据。dom04 是 schema 修复前 15 项成功结果，最终由 dom05 替代。

`first-schema-failure` 保留 mark 优先级改变 schema rank 的真实失败。修复把高优先级输入插件放到独立扩展，原 noteTag mark 的 schema 排序保持不变，随后通过原 manifest 交叉检查。

Enter 仅在合法普通候选时同步包装既有 keymap 次序，不独立派发 mark 事务；候选只存活于该调用栈。失败命令的完全空事务可更新候选 state 身份；任何文档/选区变化消费它，实际换段仍需映射 token、前段末尾、新段首和当前折叠选区共同证明。Tab 优先级低于表格/列表，只处理普通 TextSelection，NodeSelection/AllSelection 不拦截。

范围：合成隔离文档、headless Chromium 和受控 composition/beforeinput 事件；证明共享 Editor 的无 keydown 路径，不声称真实移动 IME 或设备验证。没有真实 Notes、用户数据库、麦克风、Android/AVD 或 OS 自动化操作，没有创建或使用新的 Cargo target。Mac32 构建驱动单独提交 `67cdade4`，等待 root 最终 main 源码准入。
