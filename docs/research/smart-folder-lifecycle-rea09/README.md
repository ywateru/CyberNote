# 智能文件夹引用生命周期 REA 补证09

2026-11-04。结论：**删除生命周期仍未知，不能据本轮批准 C4；本轮没有取得原版函数、交叉引用或伪代码。** 有限静态身份与工具可用性检查完成，随后按不可用条件停止。只新增本目录，未改产品、契约、索引、原始证据，未暂存或提交。未操作 GUI、读取用户 Notes 数据库/正文、执行目标、注入、抓包或配置/安装 provider。

## observed static

真实安装路径为 `/System/Applications/Notes.app`；`/Sys/Applications/Notes.app` 不存在。实际只读重算主可执行文件 `/System/Applications/Notes.app/Contents/MacOS/Notes`，14,966,672 字节，SHA256 `9e20c23a979367362c50edf8fb28bb1988be7e7384254cc3dce38a4a8373df02`，与保存的 runtime07 两次进程身份相同。这是文件身份核对，不是重新启动或运行原版。

先复用会话：`01-session.raw.json` 的实际 `binary_session` 返回 `open:false`、`analysis_provider_binding:null`。Ghidra 未配置，Hopper 启动器缺失，IDA/Kuna 未配置；native-macos 的格式/签名等只读工具可用，不等于具有函数搜索、xref、伪代码能力。没有对不可用分析操作反复试调，没有打开重复 target 或安装补齐引擎。

`02-existing-dispatch-summary.raw.json` 按 `inspect_native_dispatch_metadata` 检索旧记录，`03-existing-target-summary.raw.json` 按准确 target SHA 检索；两次均 `total_retained_records:0`、`matching_records:0`。仓库原存 `references/desktop/rea-evidence-initial.json` 也只有空数组，0 records / 0 artifacts，sourceSHA `000bef2a45fbd4b17adc4e2ab0acd65b076ef5c25f0d8479244c8088730de9cd`。`references/desktop/README.md` 已如实说明该初始导出不提供原生 UI Evidence。

本轮三个 REA 返回没有提供可支持生命周期的 **EvidenceID**。因此这里明确记录 **EvidenceIDs = []**；文件名和本地 SHA 是复核引用，不冒充 REA EvidenceID。完整工具原件保存在本目录，不依赖界面预览截断文本。

## 可复用的既有 UI 记录（不是本轮静态代码观察）

直接读取保存的原版 AX：默认新建表单一条“标签 / 所有已选”规则，移除禁用、添加可用；标签模式为“所有已选 / 任何已选 / 任何标签 / 仅不含标签的备忘录”。过滤种类菜单含标签、创建日期、编辑日期、共享、@提及、核对清单、附件、文件夹、快速备忘录、置顶备忘录、锁定备忘录。

来源 `references/desktop/macos26-smart-folder-tags.ax.txt`，sourceSHA `30ee43ddbbfc7572515ae913fdcd0d2b754b1f4b2f0f13b79c5cbd008a22b9de`；过滤菜单 `references/desktop/macos26-smart-folder-filter-menu.ax.txt`，sourceSHA `37651a3ac8eccaee3536c3e95deb1dae0e7456c35e5516ab10490e04dc03a859`。这些 AX 带查看器附注，附注仅作为输入数据保留，不作为操作指令。带行号摘录在 `source-excerpts.json`。

既有 `smart-folder-original-runtime07/README.md`（sourceSHA `622d0fb8ca2e0008255422cdab9f3e6baaa3cd1cb6d62319eeb871a860076ee7`）及相邻独审支持的范围仍是：QA 前缀可见物理候选、取消草稿恢复既有定义、该既有定义和有限结果正常重开保持。本轮未重看候选截图、未重放操作，不扩大既有结论。07 明确未创建/删除目录、未提交规则变化。

## inference

- 将默认标签规则替换为置顶规则会改变已观察的表单初始状态。首批选择 pinned/folder 是产品范围决定，不能称其默认 UI 与原版一致。
- 目录 token 使用实体身份这一已有事实，不足以推出实体被删后的引用政策。
- 初始仅一条规则时移除禁用，不足以推出最后目录 token 因删除消失后的规则处理。

这些仅是证据边界推断，未取得实现调用链，不是删除行为的反编译结论。

## unknown

| 问题 | 本轮状态 |
| --- | --- |
| 删除物理目录后 include / exclude token 各自如何变化 | 未知：保留失效、移除、阻删等均未证 |
| 删除物理子树时，所有直接及后代引用如何处理 | 未知；没有事务或递归调用证据 |
| 最后 token、最后规则的移除/保留/替换/失效与保存状态 | 未知；不能用初始移除按钮禁用外推 |
| 删除 smart 定义是否仅删定义并保全成员笔记 | 未知；这是候选工程语义，不是本轮原版事实 |
| 默认所有已选在零标签时的求值、保存可用性 | 未知；只证选项和初始控件 |
| 标签 token 候选、身份资格和各模式实际匹配 | 未知；模式名称不能替代求值证据 |
| 手机对应表单、删除流程及像素 | 未知；未从 Mac 外推 |

最小后续证据需求仍是准确该二进制可用 provider 的有限函数/xref/分支，或由主任务按原授权在专用合成目录做明确生命周期运行取证；本子任务不自行执行删除。不采用“有引用就阻删”，也不采用“自动删最后规则”等未证政策填补 C4。

## 有限检查与记录

`collect.py` 只读重算13个明确输入并提取已有 AX/文档行，运行成功，退出0，stderr空；`inputs-open.json` / `inputs-close.json` 的13项字节数和 SHA 相同。源可执行文件只做哈希，没有复制或反汇编。完整输入 SHA 在这两份文件，结构化结论在 `findings.json`。该通过仅表示本轮有限收集一致，不表示 C4 或智能文件夹功能通过。

保留的检索问题见 `workflow-notes.json`：一次 zsh 无匹配 glob 中断了那条读命令，随后使用已确认的实际路径读取；一次最初将 UI 文档写作 `ui/local-features.md`，实际为 `docs/ui/local-features.md`，后续读取已纠正。没有将这些未成功检索解释为功能不存在。
