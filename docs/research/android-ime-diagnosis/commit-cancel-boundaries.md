# FIX06：原生组词结束与事件信任标记的有限源码核查

读取日期2026-11-03。FIX04源码已冻结f3071f3，Android交独立verify后，本次仅阅读项目与官方源码，没有操作设备、构建或修改产品。本文提供候选边界语义，不是运行调用栈或已确认完整根因。

## 输入身份与资料

实际candidate01 trace.jsonl的probe-attached记录UA为Chrome/91.0.4472.114；Trime版本3.3.13，内联模式Composing text。下面读取Trime精确v3.3.13标签、Chromium精确91.0.4472.114标签及Android官方接口文档。标签与UA版本一致不等于核验了设备WebView全部二进制字节或厂商补丁。

| 主资料 | 本次位置与用途 |
| --- | --- |
| [Trime v3.3.13 TrimeInputMethodService.kt](https://raw.githubusercontent.com/osfans/trime/v3.3.13/app/src/main/java/com/osfans/trime/ime/core/TrimeInputMethodService.kt) | onFinishInputView，约552–565行；updateComposing，约469–488行 |
| [Android InputConnection官方接口](https://developer.android.com/reference/android/view/inputmethod/InputConnection#finishComposingText()) | finishComposingText契约 |
| [Chromium91 InputMethodController](https://raw.githubusercontent.com/chromium/chromium/91.0.4472.114/third_party/blink/renderer/core/editing/ime/input_method_controller.cc) | DispatchCompositionEndEvent、DispatchCompositionUpdateEvent、FinishComposingText、SetComposition |
| [Chromium91 EventDispatcher](https://raw.githubusercontent.com/chromium/chromium/91.0.4472.114/third_party/blink/renderer/core/dom/events/event_dispatcher.cc) | DispatchScopedEvent，约64–73行 |
| [Chromium91 EventTarget](https://raw.githubusercontent.com/chromium/chromium/91.0.4472.114/third_party/blink/renderer/core/dom/events/event_target.cc) | DispatchEvent(Event&)与DispatchEventForBindings |
| [Chromium91 Event](https://raw.githubusercontent.com/chromium/chromium/91.0.4472.114/third_party/blink/renderer/core/dom/events/event.cc) | Event构造函数中is_trusted_初值 |
| [Chromium91 CompositionEvent](https://raw.githubusercontent.com/chromium/chromium/91.0.4472.114/third_party/blink/renderer/core/events/composition_event.cc) | 内部构造与data初始化 |

## finish不是候选提交或取消

Android官方契约中，finishComposingText结束组词并保留文字，仅移除组词状态，不改变当前文字与光标。它不保证选择候选，也不能被当作撤销未确认输入的接口。

Trime精确版本的onFinishInputView首先调用super，然后显式调用当前InputConnection的finishComposingText，再清本地composingText，随后异步清Rime composition及候选。updateComposing则根据内联模式和Rime状态选择调用setComposingText。这说明IME结束输入视图存在保留已交给编辑器的预编辑文本的静态候选路径。不能仅因随后清Rime状态，就推断已从编辑器取消该段文字。

这与FIX04格式及后台残留相容，但本次没有记录实际onFinishInputView/finishComposingText的调用时间、当时原生marked range或InputConnection参数；不能认定每次blur必经此钩子，也未证明该调用是全部残留的唯一原因。项目NotesKeyboard.hide当前只调用hideSoftInputFromWindow，不能把隐藏键盘本身当作已证实的commit/cancel屏障。

## 原生内核也可产生isTrusted=false的end

同标签Blink源码中，DispatchCompositionUpdateEvent通过普通EventTarget::DispatchEvent发送；该入口会设置trusted为true。DispatchCompositionEndEvent使用不同的DispatchScopedEvent路径；后者将事件排入ScopedEventQueue，没有在这个入口设置trusted。Event构造初值为false，CompositionEvent内部构造也没有另设该值。因此，浏览器内部构造并经该scoped路径发送的end本身即可为false。

这足以排除“isTrusted=false必然由JS/Tiptap伪造”的推断；不能仅靠此标记区分原生候选、DOM blur或探针事件。真实候选动作与格式动作的end在实际trace均为false，与静态路径相容；仍未捕获实际事件分支调用栈，不断言每个事件必经该路径。

本地Tiptap锁定版本blur命令只安排DOM blur和移除DOM选区，没有显式dispatch compositionend。与该动作同时出现end，不足以把构造者归于Tiptap。FIX04取证脚本也没有派发组词事件。

## 对下一步实现的限制

下一轮先选择可真实测量的最小边界：明确区分原生候选结果提交、IME保留raw preedit后finish、取消当前组词三种语义。读取事件data与PM状态不足以证明原生commit/cancel，必要时只增加最窄诊断来观察当前InputConnection边界；不需要为本任务重建整个原生栈。

在没有候选的情况下不选择或猜测汉字。不要用finishComposingText冒充取消，不按字符串剥离`‸`，也不直接覆盖全文。若最终需应用内保留或取消未确认段，必须先明确实际起止范围、原有替换内容、事务映射、Undo及授权/切笔记边界；当前没有实施范围回滚。FIX06仍pending/blocking，FIX04有限长候选通过不能覆盖这些问题。
