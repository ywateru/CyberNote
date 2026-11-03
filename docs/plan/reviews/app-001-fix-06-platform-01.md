# FIX06 平台输入对照：独立证据复核 — fa1cdb5

日期：2026-11-03。结论：**平台同现证据足以撤回“格式/藏键盘后见 ni hao‸，所以必须由应用回滚 preedit”的预设；不足以证明苹果 Notes 的精确提交/取消语义，也不关闭手机输入整体门槛。** 本轮仅独立读取冻结 fixture、事件、原生动作、截图/XML及恢复记录，未重跑、未操作 GUI/Android、未改产品或历史 P1 报告。原真实可见/保存观察继续成立；其机制与需求归属应按新增证据重新区分。

## Findings 与当前门槛

| 项目 | 当前判断 | 门槛建议 |
| --- | --- | --- |
| 格式/失焦后保留 ni hao‸ 的应用独有归因 | 不再由现有证据支持 | 同 Trime 内联模式，独立普通 contenteditable 无 PM/Tiptap/React 绑定也同现；原生 EditText 隐藏 IME 也同现。不能仅看残留字符串或 isTrusted=false 就认定应用构造事件/丢失保护、要求回滚。 |
| 苹果 Notes 精确交互与各导航边界 | unknown | 本次没有原版 Notes 对照；普通平台同现不等于 Notes 一致。FIX06 的原版一致性、明确 commit/cancel、相邻已确认正文保全和跨笔记隔离门槛仍待核定。 |
| 原长停留/候选及既有格式/后台观察 | 历史事实保留 | 原独立长停留残留 P1、FIX04 有限主路径通过、开发格式/后台可见残留及保存结果不改写。平台对照不撤销已采事实，也不证明全部历史失败同因或全部输入合格。 |
| host unchanged 诊断布尔 | 无存储证明力，已披露 | 仅忽略该字段的证据资格；不影响独立输入区自己的文本/事件证据。不能据此声称宿主笔记 JSON 或本地数据未变化。 |

未发现本轮诊断审查范围内新增的确定产品 P1/P2/P3。本次允许更新当前归属判断和后续实现依据，不能将平台现象改写为整项通过。原报告中的 P1 分类及冻结证据保持原样；本报告不是对历史报告的追溯改判。

## 冻结来源与身份

仅审查提交 `fa1cdb5` 的 `docs/verification/app-001-fix-06/platform-baseline/`，39文件，无产品差异。`evidence-manifest.json` 为其余38文件逐一记录 bytes/SHA256；本轮独立从 git 对象读取，38项全部匹配。fixture SHA256 `4c091d62c98278599884d22f2807c0b3621396db2cf9a11fbd526c1f73ad7c81`，trace `efaed94335bc06486c59c1b9c09e9b8e9a5b1c85bd623895f248ad8bcc4d1f0e`，native-actions `d71383387bae9f0674879c3fc8d617f07e3c55e5843bf95f50b3285662db007f`。

开发 `installed-apk-identity.json` 记录仍是 FIX04 candidate d5c6f59b79031d1e103f418450e6cbd9d7fa8e8fc085263fab3d23d6b3e04d21、未重建/重装。该宿主不能归属到当前 HEAD 或 FIX07。本轮只读身份记录，没有重新读取设备安装包；设备/模式是 emulator-5580、WebView91.0.4472.114、Trime明月拼音简化字 luna_pinyin_simp、Composing text。模拟器对照不冒充实体手机或 iOS。

## 独立普通 contenteditable 的有效范围

`plain-webview-diagnostic.js` 在 document.body 直接追加临时 section，内含独立 div.contentEditable 和普通 button；编辑节点不属于 React 根、没有 PM/Tiptap Editor/插件/事务绑定。源中不存在对诊断区 text/HTML/selection 的内容写入或 dispatchEvent；事件监听只读其快照并记录。它仍共用已安装产品的 WebView 宿主和全局环境，不是独立安装的另一浏览器进程，不声称排除了全部宿主影响；但被输入节点不经过产品编辑器模型，已能反对“这种文本现象只会由 PM/React 产生”的推断。

`native-actions.jsonl` 记录真实触摸编辑区和 n/i/h/a/o 对应键位，随后触摸普通按钮；截图显示“你好”候选与明月拼音简化字键盘，没有选择候选。`trace.jsonl` 和 `plain-webview-after-blur.json` 中真实 start/update/input 逐步写入 n‸、ni‸、ni h‸、ni ha‸、ni hao‸，最终 text/HTML一致，非最后直接塞入汉字或手造输入事件。

| performance.now(ms) | 直接事件/快照 | 可核内容 |
| --- | --- | --- |
| 877373 | compositionstart，trusted=true | 诊断区为空且有焦点。 |
| 879551.6 / 879552 | 最后 compositionupdate / input，trusted=true | data与文本为 ni hao‸，inputType=insertCompositionText、isComposing=true。 |
| 879971.6 | marked 快照 | text/HTML=ni hao‸、选区7..7、focused=true、viewport高度462。 |
| 880212.2 | compositionend，trusted=false | data与正文仍 ni hao‸；距最后 update **660.6ms**，距最后 input660.2ms。 |
| 880212.5 | blur，trusted=true | focused=false，正文未变。 |
| 880212.9 | button click handler before | 已经focused=false；随后源中才调用box.blur和NotesKeyboard.hide。 |
| 880314.7 / 880680.9 | after100ms / 最终快照 | 文本仍ni hao‸，focused=false，viewport高度恢复751，截图键盘已隐藏。 |

因此这条路径中原生触摸后的默认焦点转移/end/blur **先于** click handler 的显式 blur/hide，不能把后执行的 NotesKeyboard.hide 当作先前 compositionend 的直接原因。该 fixture 没有调用构造 compositionend，仍收到 isTrusted=false 的 end；这足以说明该布尔不能独自识别应用合成事件。没有原生 InputConnection 调用栈，不把 end 的 data 直接等同于某个精确原生 commit/cancel 方法调用。

平台对照是快输入失焦路径，不重测长停留候选保护；它也未执行产品格式入口、后台授权同步、切笔记或本地保存。只能说明独立输入区在本环境可原样保留传入预编辑，不能证明所有产品导航边界同因。

## 原生 EditText：Back 隐藏，不是 blur

原始 XML 确认目标是 `com.android.settings.intelligence` 的 `android.widget.EditText` / `android:id/search_src_text`，无 WebView/PM编辑器。首轮真实 Home 后再以 reorder flag 启动，开发说明为 WARM，截图/XML已重置为 Search…；动作记录保留了 Home和重启。其 Activity/查询状态同时变化，不能识别原文本被 commit、cancel、重置或重建，**该轮 invalid，不计入有效平台结果**。不以它声称原生框取消了组字；WARM/HOT启动响应只见开发说明，未另有完整响应文件。

第二轮开发说明 HOT；实际 before XML为提示Search…、focused=true，截图键盘可见。五次真实键触摸后，marked XML与截图为ni hao‸、候选“你好”、focused=true。12:40:55.125Z 的原生 keyevent4（Back）后，after截图确实隐藏键盘，after XML仍text=ni hao‸、focused=true。两份 marked/after XML与摘要字段相同，均只包含目标 Settings包，不含键盘层；因此键盘隐藏由原图及动作支持，不能从这份XML推断键盘层状态。

该对照支持“原生文本框隐藏 IME 后仍保留该文本”，不支持“原生 EditText 已 blur”，也不证明 Back代表用户取消或提交候选；未触摸候选、未记录原生 InputConnection span/finish调用。它与普通 WebView失焦对照覆盖两个不同边界，不能混称为两次原生blur。

## 诊断缺陷与恢复

fixture 用 `document.querySelector('.tiptap')?.editor?.getJSON()` 读取宿主前后数据，随后比较JSON.stringify。若 `.editor` 属性不存在，两次undefined经JSON.stringify仍相等，`diagnostic-removal.json` 的 visibleHostNoteDocumentUnchanged=true 就没有正面意义。源没有先断言 Editor存在、JSON有效或执行完整存储比对，故本轮明确排除其存储/宿主保全证明力。removed=true对应的DOM移除逻辑可以说明临时层清理；不能由此派生宿主笔记无变更或所有诊断监听均完全无副作用。本轮不扩展成存储审计，也不修诊断原文件。

恢复证据：动作日志记录重新进入Trime General、打开模式对话框并点Disable；`trime-restored-disable.png` 实际显示Disable。日志随后逐项设置原四项系统值；独立解析 `original-input-settings.json` 与 `restoration.json`，original/restored完全相同，exactMatch与实值相符：默认LatinIME；enabled仅LatinIME与GoogleVoice；subtype=-1；show_ime_with_hard_keyboard=1。没有清应用数据/卸载输入法的动作。开发已交回设备；本轮未重新读取或改变设置，恢复结论属于已核对的开发记录，非本轮新设备执行。

## 当前归属与后续门槛建议

当前足以将“失焦/藏键盘后仍见装饰preedit”从**应用独有错误已证**调整为**本IME/平台可同现，产品目标语义待核定**。不应据现有证据实现字符剥离、固定长度删除、猜候选或盲目回滚，否则会覆盖输入法真实交付的拼音/用户意图；只有明确原版/平台commit-cancel契约和可靠起止范围、旧选区及事务映射后，才可判断是否需要应用补偿。

接下来先区分真实候选提交、明确删除取消、单纯藏IME、真实失焦、后台/跨笔记与授权销毁，再以用户要求的Notes行为核定每条边界。输入法交付内容、已确认相邻正文、Undo与本地保存仍须保全；未知的原版语义不能被平台同现直接标为pass。历史长停留P1记录、FIX04原有有限通过及已记录格式/后台事实保持原样；本报告只改变当前归因依据与下一步实现门槛。
