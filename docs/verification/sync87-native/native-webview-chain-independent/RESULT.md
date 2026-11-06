# Native WebView 直接祖先链独立窄复核

2026-11-06。**BLOCKED，冻结 `5edf5e4f2f76ee7a4347aeacd7c638ab8bace9ec` 暂不准入 nativeTap。** 仅审相对 `febe6174` 的最终 client/check-client 局部差异、保全实际 UIA 和下列 host 反例；未涉及其他同步、installed hash 或设备问题。

原作者 **17 项 host checks 自然 exit0，完整进程 28ms**。独立 [check.mjs](check.mjs) **10 项中 7 项满足契约、3 项反例失败，自然 exit1，完整进程 26ms**。准确命令／退出／时间见 [processes.json](processes.json)，原始 stdout/stderr 同目录，所有最小 XML、接受结果与源码前后 hash 见 [result.json](result.json)。没有 ADB／设备调用、主线写入或产品修改。

两个 blocking 原因：

1. `parseNodes` 的开标签正则只匹配 `<node` 后带空格和属性的形式，忽略合法无属性 `<node>`。因此最小 XML `<node><node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/>` 的外层未闭合，却被作为单个有效 WebView 接受。作者已经把无属性 node 用在 wrapper 测试中；这是同一限定格式的漏记栈，不需要扩展其他 XML 方言。应记录这种开标签，并让未闭合栈拒绝。
2. `nativeWebViewRect` 在验证链之前过滤其他包。foreign WebView 父节点→own 直接子节点，或 own 与 foreign WebView 兄弟节点，都会丢弃 foreign 后当成唯一 own host 接受。两条实际观察均返回 `{x:0,y:48,width:720,height:1136}`，不符合仅 single exact-package／全同包同 bounds 直接链的既定契约。应先枚举 WebView，再对候选集合的 package／rect／parent 链逐项校验，不能靠丢弃 foreign 得出唯一 host。

正常格式已独立保全验证：实际 `cycle02-editor-before-attachment-uia.xml` 有且仅有两个 `android.webkit.WebView`，同为 `com.local.notesclone`、rect 完全相同 `{x:0,y:48,width:720,height:1136}`，内层 parentIndex 精确等于外层 nodeIndex，当前代码接受。单 own host 也接受。独立同包兄弟、不同 bounds、闭合中间 wrapper、仅 foreign、带属性未闭合的负向均拒绝。建议修复后保留这些正常与负向，不扩其他格式。

最终源码普通 CDP touch 已恢复 CSS pixels；`99a23a00` 的比例实验未打开实际 menu，仍仅作为撤回的失败实验，不接收为修复。实际 nativeTap 动作要等原作者修复上述两点并独审通过后恢复；本结论不声称产品或原生 UI 通过。
