# 普通文件夹名称 Option-Tab：受控输入与原生历史实现准备40

READY STOP。结论只覆盖自有不可见 WKWebView 中的受控 React 19 文本输入；未改产品，也未授予产品按键路由、发布包或整体 UI 一致性通过。808/808 个证据断言通过。原版41后缀替换、撤销恢复 CD 选区、重做恢复 TAB 的保存端点，与候选的对应编辑端点一致；这不是原版和克隆完整键盘路径一致的结论。

本轮仅读取主树名称输入链、封存的 original40，以及 root 后续明确提供的 original41。没有读取 changing37 工作树，没有 Git、ADB、数据库、下载、用户应用操作或 OS 键盘注入；没有依赖、锁文件、产品源文件或共享构建缓存修改。唯一写入范围是本目录。编译临时目录和模块缓存也在本目录。

## 主树受控输入链

`src/SmartFolderForm.tsx` 的已冻结字节：约175行 `draft/setDraft`；约210行 `update` 合并名称并清空错误；约598行桌面名称 input 的 `value={draft.name}`、`onFocus` 全选和 `onChange => update({name:e.target.value})`。约350行的普通桌面范围是 `!mobile && !folder && !draft.smart`。约199行已有非组合态 Escape 取消。未改变这些代码，也未读取37的候选改动。

候选只需要让浏览器编辑产生的 input 走现有 onChange；直接拼接状态不能被称为原生编辑历史。

## 原版输入基线与选区校正

`QA-OPT40-ABCD` 实际13个 UTF-16代码单元。光标中间位置3；末尾 `CD` 是半开区间[11,13]；末尾插入位置13。早期实验03误用了[10,12]/12，并把名称长度误记12，故其后两个输出不对应原版场景；原实验和源文件全部保留，不用于最终通过。original40本身的保存AX没有这项索引错误。

original40显示中间 OptionTab 得到 `QA-\tOPT40-ABCD`；选中CD后 OptionTab 得到 `QA-OPT40-AB\t`；末尾 OptionShiftTab 得到 `QA-OPT40-ABCD\t`，焦点均仍名称。这里 `\t` 表示单个真实 U+0009。original41使用等长 `QA-OPT41-ABCD`，提供CD替换后 CmdZ恢复原名及CD选区，CmdShiftZ恢复TAB结果及名称焦点的额外保存证据。original41只作为明确端点对照，不据此推断所有编辑分组或多步历史。

## 自有实验方法

现有离线 Playwright 的精确 WebKit 可执行路径不存在，未下载浏览器。使用现有 esbuild、React19和react-dom打包最小受控名称fixture，通过系统 AppKit/WebKit编译自有宿主。WK数据存储为nonPersistent，不使用用户浏览器配置。

最终05每个场景单独启动一个自有进程，清空跨场景历史。自有NSWindow位于屏幕外，未显示、未激活；每组原始stderr均记录 `visible=0 key=0 main=0 undoManager=1`。没有NSWindow的早期03可以插入，但没有可用undo历史，因此不是最终依据。最终05三个候选和两个对照各只运行一次，全部有35秒外部上限，自有runloop25秒上限，实际每组约0.4至1秒。

fixture按当前选择调用 `document.execCommand('insertText', false, '\t')`，随后等待React事件更新；再做一次无关React重新渲染、一次真实 `execCommand('undo')`、一次 `execCommand('redo')`。记录DOM值、state、output、起止选区、焦点、命令返回值、queryCommandEnabled，以及beforeinput/input/React onChange事件。isTrusted=true指WebKit生成的编辑事件，不表示经过实体键盘或真实用户按键路径。

## 最终05结果与候选比较

| 候选／对照 | 选区与结果 | 受控状态及重新渲染 | 原生编辑历史 |
| --- | --- | --- | --- |
| execCommand insertText，光标3 | `QA-\tOPT40-ABCD`，光标4 | DOM/state/output一致，重新渲染保留 | undo恢复原名/光标3；redo恢复结果/光标4 |
| execCommand insertText，CD [11,13] | `QA-OPT40-AB\t`，光标12 | 三者一致并保留 | undo恢复原名及[11,13]；redo恢复结果/光标12 |
| execCommand insertText，末尾13 | `QA-OPT40-ABCD\t`，光标14 | 三者一致并保留 | undo恢复原名/光标13；redo恢复结果/光标14 |
| setRangeText，CD [11,13] | DOM暂为TAB结果，光标12 | state/output仍原名；无关render使DOM回到原名 | 初始及插入后undo不可用，undo/redo均false，无编辑事件 |
| plain setDraft，CD [11,13] | DOM和state得到TAB结果 | 重新渲染保留 | 初始及插入后undo不可用，undo/redo均false，无编辑事件 |

三个execCommand场景插入均有顺序明确的beforeinput、input、react-onChange；inputType为insertText。undo和redo分别产生historyUndo/historyRedo的相同事件链，React同步恢复。每组开始undo/redo均禁用；插入后undo启用，撤销后只redo启用，重做后只undo启用。不是仅凭布尔返回值判断历史存在。

04虽然三个候选输出和历史正确，但同一WK页面连续卸载/重挂input仍共享宿主历史；控制组的undo返回true可能指向已移除的先前字段。因此保留04作研究过程，最终以独立进程05为依据。

## 最小实现候选，尚未修改产品

可在单独后续任务中仅为普通桌面新建名称input处理OptionTab：保持37的native Option事件让行；前端在当前input聚焦、可编辑、非组合态且没有Ctrl/Meta修饰时，使用当前DOM选区调用insertText。OptionShiftTab只按目前记录的末尾场景得到支持，重复按键、其它修饰组合和系统键盘导航设置仍需另测。普通Tab/ShiftTab、智能文件夹、移动端不因本研究扩大处理范围。

不先重新聚焦或全选，否则现有onFocus全选会破坏当前选区。不手工再setDraft；使用现有onChange作为唯一状态更新链。预先保存原值与选区，检验命令返回和实际DOM替换结果；不能因布尔true就忽略实际值、选择或事件。如何处理能力缺失／失败需在后续实现中明确；本研究不认可用plain setDraft或setRangeText悄悄降级成“原生历史通过”。

这是一条在当前系统WK中已实测的候选。实际Tauri宿主键盘事件分发、菜单CmdZ/CmdShiftZ、混合普通文字输入的分组、多次连续撤销、输入法、组合态、取消关闭，以及打包后的原生宿主，均未在本轮验证。当前系统运行结果也不保证其它WebKit版本或其它端的API能力。原版41仅补足一次CD替换的撤销重做参照，没有使其它场景的原版历史自动变为已测。

## 失败保留与证据边界

- bundle-attempt01在任何输出前失败：相对导入多走一层父目录。失败脚本与错误摘要保留；02修正路径后成功。
- wk-attempt01受系统服务访问限制，25秒deadline退出3，原stderr保留。
- wk-attempt02启动页面，但evaluateJavaScript直接返回Promise导致unsupported type；旧宿主错误地把该JS失败仍退出0。不能视为通过。原source/binary保留；后续使用void调用并给JS/native错误非零退出。
- wk-attempt03无NSWindow，没有undoManager，undo/redo均false；同时保留错误后缀索引。该尝试只证明能产生输入事件，不证明目标场景或历史通过。
- wk-attempt04有不可见宿主和正确选区，但跨场景共享历史；最终05隔离进程消除此误判来源。

初始406个受保护文件字节与SHA全相同；既有323个冻结输入全相同；original40索引SHA及10项成员全匹配。后续新增original41在读取前记录11项保护（索引加10成员），末核全部相同。`result-before-original41.json`保留补证前793项结果，最终`result.json`含808项。

证据索引采用仓库根相对路径，排除索引自身和本目录自有临时模块缓存/tmp；缓存不是行为证据，也不是共享缓存。构建脚本、fixture各历史版本、原始运行stdout/stderr、最终解析结果、核查程序及输入清单都在索引中。未作图像像素判断，没有新的原版截图或录屏操作。
