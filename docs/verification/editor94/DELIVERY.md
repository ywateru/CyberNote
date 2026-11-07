# APP94 标签回车与正文 Tab

源码实现、独立定向复验、Mac32 准确构建及不同代理只读核包均完成，本轮两个键盘缺陷修复交付。

## 行为

- 在普通正文输入合法 `#标签` 后按 Enter，生成标签并正常换段，下一段不会继续带标签格式。原空格提交保留，不扫描旧文本自动升级。标题、普通列表、任务列表和表格中的回车仍按编辑器既有行为执行。
- 普通正文或标题按 Tab，插入字面制表符；选中文字时替换选区，焦点保留在编辑器，可保存及撤销/重做。表格单元格导航和列表缩进优先于正文插入，Shift/Control/Meta/Alt 修饰键及正文外控件导航保持原处理。
- IME 组字期间不抢回车或 Tab；无效标签、代码/链接、只读和不可提交内容保持既有边界。单独选中图片/附件/绘图或全文 AllSelection 时，Tab 不删除所选内容。
- 无 keydown 的可取消 `beforeinput insertParagraph` 走相同回车链；仅在明确换段后给原标签加 mark。候选只存活于同步调用栈，阻止回车后不会误用在后续输入上。键盘优先级与标签 schema 分离，存储格式及 Rust wire 不变。

## 验证

| 层次 | 结果 |
| --- | --- |
| 作者真实 NoteEditor | 最终冻结 15/15，通过中英文 Enter、换段、单次 Undo/Redo、soft input、列表/表格、组字与选区保护；全 src 哈希前后不变 |
| 既有标签回归 | 27/27，包括空格提交、合法性、真实 App 保存及保存失败 |
| 独立实际 App/Editor | 17/17，自然 0，49.866 秒含清理；普通 Enter/Tab、保存快照、焦点、Undo/Redo、列表/表格、修饰键、只读、正文外导航 |
| 独立附加边界 | 5/5，自然 0；NodeSelection/AllSelection 保护、原 handler 绑定/顺序/只执行一次、noop 后 Enter、soft input/composing/noncancelable |
| schema 与生产 | 作者及独立各 96 文档用例/原 manifest 相同；typecheck、Vite 和生产调试入口排除均自然 0 |

作者结果与原失败见[作者记录](author/README.md)，独立基线、第一次修复失败与最终复验见[独审记录](independent-recheck/README.md)、[源码审查](../../plan/reviews/app-editor-keyboard94.md)。最终独立两轮均 86 个 tracked src 前后哈希完全相同、干净工作树、无 renderer 异常。

首次修复发现的空事务漏提交、非文本选区 Tab 替换及 schema mark rank 问题均已修复并保留原证据。作者原 trimEnd 测试误判、组字/外部控件的独立 fixture 调整单独说明。source02 在中间 cherry-pick 状态运行，清理卡住后仅 owned 测试 node/esbuild SIGTERM、exit143，明确不作准入；最终通过轮均自然退出，未覆盖旧失败。

## 包与范围

批准产品主线 `3684205aab7b837ee917ec25fde2c9a0cdd93c24`，仅修改两个产品文件。实际构建入口 `a9a4e1ff1898cf689269044b1d0d7c8d51654c79`，后续改动为文档和测试证据；动态 341 个产品输入在构建前后及打包后逐字节一致。编译自然 0 / 43.655 秒，[完整构建记录](mac-build/result.json)保留原日志。

[备忘录-Mac32.zip](../../../artifacts/editor94/备忘录-Mac32.zip)，7,048,136 字节，SHA-256：`d898df41ea066d0fc95cae1962f41dc733e9694f0fe3466307a47cf17109af71`。Mac32 使用 `artifacts/editor94` 独立目录，保留 Mac31/Android21。

原始 bundler/linker 签名 strict 1 与无 entitlement 原样保留；交付派生包显式使用源 Entitlements 重签，实际 Apple Events entitlement/Info 相符，strict 0。本地 ARM64 ad-hoc 包，未公证。

最终不同代理只读核包自然 0 / 13.047403 秒。动态 341 个输入与批准 Git/实际入口/构建前后清单一致；ZIP 完整文件字节/权限、原始与派生全部内嵌前端资源/JXA、签名外 Mach-O 全字节、Info 和实际 entitlement/strict 签名均通过。[最终核包](final-independent/README.md)。未运行、重签或修改应用，不将核包等同于原生运行。

全部新增运行采用合成隔离数据和真实 React/Tiptap/SaveQueue、既有 JS protocol backend；保存快照检查不是重新运行 Rust Store 或真实用户数据库。受控 composition/beforeinput 证明共享编辑器边界，不代替真实 Mac 输入法服务、手机软键盘设备或原生 App 按键送达。未访问真实 Notes、用户数据库、麦克风、Android 设备或旧 AVD，没有新增 Rust target。
