---
id: app-mac-ordinary-option-insertion42
scope: Native Mac ordinary folder name Option-Tab text insertion
status: in-progress
depends-on: [app-mac-ordinary-tab-loop37]
---

## Objective

在普通Mac新建文件夹名称中，OptionTab按当前选区插入单个U+0009并保持焦点；OptionShiftTab有限末尾路径同样插入；保留真实输入事件、React受控草稿及原生undo/redo。该项独立于37的普通Tab循环，不改系统策略/原生按键监视器。37源经不同作者审查并合入后root才创建本项隔离分支和START；现在只是pending设计，尚未放行实施。

## Context

读docs/ui/smart-folders-macos.md、original35全选替换、docs/research/mac-folder-option-insertion-original40/README.md的中间caret/后缀/OptionShiftTab观察、docs/research/mac-folder-option-history-original41/README.md的后缀替换/真实CmdZ恢复CD选区/重做，以及docs/research/mac-folder-option-insertion-readiness40/README.md及最终独立进程05结果。原版证据均为未保存草稿/Computer Use，原版删除暂停。source-ready不能替代实际新包键路由验证。

## Contract and paths

只在native macOS、main、普通新建（!mobile、!folder、!draft.smart）、可编辑名称input内处理key=Tab且alt=true、ctrl/meta=false；Shift可有可无。非组字、非keyCode229、未defaultPrevented且非busy/warning。采用37的可信Tauri+平台+窗口gate，Mac浏览器预览不接入。其它修饰、普通Tab、普通键入、智能/编辑/手机/独立窗和原生搜索保持既有路径；不扩大37局部导航范围。

允许依据readiness40的当前真实WK证据，在输入仍聚焦时使用同步浏览器insertText编辑命令插入单TAB，通过真实beforeinput/input和现有onChange→update→draft链，按当前selectionStart/End自然替换。不用setRangeText、直接setDraft、合成InputEvent或重放OS键作为伪原生历史后备。不自行全选/移焦点，不改名字trim/保存验证，也不把TAB变为空格或文本\t。命令失败或异常不能伪称成功或重发第二次插入；保草稿/选区、显式沿现有错误路径给出可理解反馈，不泄露工程细节。实际控制流和错误边界由作者报告后固定。

失败边界（root在START前明确）：能力/目标/选区预检失败不得调用编辑命令；命令返回false或抛异常且未变更时保留原值和选区。浏览器命令若异常地已经部分修改或发出真实input，不承诺无法实现的事务回滚；保留其可见现值、真实输入状态链和已有历史，显示错误，停止本次操作，不自动重发/手工重置/额外undo。核查要分别记录无变更失败与部分生效异常，后者不得标成功或原快照零变更。此为显式失败处理，不是允许正常路径缺少React同步或历史。

2026-11-05 root按作者有限阴性结果进一步限定：上段“保可见现值”仅适用于产生真实input、已进入受控draft链的部分生效。人为命令仅用原生value setter改DOM而无input时，React显示错误的正常重渲染会恢复最后真实draft，光标及原生历史不承诺原快照事务一致。应如实记录命令内DOM、重渲染后终点与历史影响并计明确失败；禁止为这种异常手拼draft、合成input、额外undo或把自然受控重渲染称无损回滚。正常浏览器insertText路径仍必须有真实事件、正确值和选区及可验证历史。

原生编辑历史必须有真实WK受控生产表单证据：局部CD替换后undo恢复完整值和CD选区，redo恢复TAB结果；不能只测value最终相同。普通输入混合与至少连续两次插入/撤销边界有限检查，避免跨场景共享undo历史假阳性。该API的当前可用性来自本机实测，不据此保证所有未来WebKit版本，失败不得静默破坏草稿。

原版[连续草稿43](../../research/mac-folder-option-sequence-original43/README.md)补证：默认全选后键入QA-OPT43-ABCD、Right、两次OptionTab，一次CmdZ回默认名称且全选，一次重做恢复合成名和两个TAB。不得自行强制每次TAB独立undo分组；41的局部CD替换历史及43的连续同组历史须分别有限验证并披露差异。

root创建独立worktree后，产品仅src/SmartFolderForm.tsx、必要窄src/ordinary-folder-option.ts新helper及37的native-keyboard.ts可读复用；原则上不改37controller/native插件/权限/样式/依赖/锁。新增路径若确有必要先报告。证据只在docs/verification/mac-ordinary-option-insertion42/。不读用户DB、不删除或改系统设置。

## Verification

作者有限生产组件事件路径（非只调用候选helper）、真实WK受控input/React/onChange/原生history，覆盖全选、中间caret、CD局部替换、末尾、ShiftOption、持续键入/undo、命令失败草稿保全，以及各native/平台/模式/组字/修饰排除。场景隔离历史，保留全部失败与阴性对照。37普通Tab/ShiftTab有限回归。使用已有离线工具与自有缓存/target，不下载。

固定产品提交后由不同作者独审，再合入准确Mac包。实际Computer Use在同一原版合成草稿序列核OptionTab、CmdZ/CmdShiftZ和名称值/选区/焦点，并复验37普通导航、普通智能往返/取消及侧栏不退化。开启系统导航、多窗和全原版交互仍无自动通过结论。

2026-11-05 root START42：37源阶段已独审合入，创建/private/tmp/apple-notes-ordinary-option-insertion42-01，develop_app唯一作者。仅本项两产品路径；以root最新已提交主线为创建基线，禁止修改主树及37隔离树。完整行为/像素仍待准确包验收。

2026-11-05 root源接收：独审1185项有限核查PASS、20成员index7d3370ca…，root重新核184作者与20独审成员全部匹配，准确两产品逐字合入a840308，作者证据6a46358。37/42/45已串行独审接收，下一Mac14先冻结后构建并实际CUA。此任务仍in-progress，不授真实OS键或完整交互PASS。

2026-11-05 root实际有限接收：准确Mac14 source d9ce9c4及实际47经不同作者复核；参见 `docs/verification/mac-ordinary-keyboard47-root-acceptance.md`。37/42当前系统导航关闭的指定故障路径有限通过，开启导航/多窗/IME不扩大通过；45干净48局部选中改善成立，自然态与Mac13完整raw/sRGB零变化，但字形/底色/不利阈值与整体像素继续开放。
