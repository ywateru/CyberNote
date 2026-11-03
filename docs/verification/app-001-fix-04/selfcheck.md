# FIX04：真实 Android composition 判别与修复记录

2026-11-03，部分修复冻结供独立复验，整体仍进行中。Android emulator-5580 开发验证已结束并交还；Mac 34223af / 4118f77… 未重建，原字节另存 `/private/tmp/notes-fix02-frozen-4118f77.app`。本任务不以旧Mac包覆盖新依赖补丁回归。

## 修复前的有限真实因果判别

正式 FIX02 APK 0aac2d73… 已原字节保留 `/private/tmp/notes-fix02-ime-baseline-0aac2d73.apk`；旧20失败APK44b6b16d…保持只读。`baseline-34223af/`保存真实原生动作、截图、只读快照与连续`trace.jsonl`。设备为 Android11 / WebView91 / Trime3.3.13，内联模式由Disable经真实设置UI切为Composing text；初始四项输入设置单独保存，最终须恢复。

使用真实软键盘n/i/h/a/o及触摸“你好”候选，没有直接插入汉字或派发组词事件。临时探针记录真实事件的isTrusted、PM事务、Editor/View/DOM/文本节点WeakMap身份、选区和内部函数条件断点栈；断点条件始终false，不停住执行。50ms只读状态观察仅变化时记录。Tauri invoke属性不可写，早期无效包装没有产生IPC记录，随后改用源位置条件断点记录实际send、workspace ACK和App confirmed；不把前段无记录误当无保存。诊断探针不打包进产品，最终还须无断点复测。

空白新正文段最后一次schedule(5000)为496304.7ms，timer栈进入endComposition501335.9、clearComposition501356.3；期间没有DOM compositionend。同一editor9/view10/DOM11保持，composition文本node17被node18替换，17断开而仍被compositionNode引用，PM composing变false。实际候选点选后形成`ni hao‸你好`。正文空段快速轮次则只替换为`你好`，没有本轮拼音残留。

已有正文中部`LEFT-RIGHT`的快速轮次正常成为`LEFT-你好RIGHT`。随后在中部再组词并停留约34秒，同样捕获5000 timer→clear，但node26保持，候选仍正确替换，成为`LEFT-你好你好RIGHT`。这个通过必须与空段失败同等保留，不能推论所有长停留都会失败。该中部轮次最后App保存ACK688783.2ms，timer693678.4ms，期间没有load_workspace请求或Editor/View/DOM重建；仅证明这一实测周期中保存ACK自身未结束组词，不能扩展为所有同步边界已通过。

最初ASCII标题在Trime下仍经过预编辑，第一次Enter只提交标题；`clean-paragraph-before`实际仍是heading，不能作为空段基线。后续`clean-body-before`与`body-fast-before`均真实paragraph，明确使用这些文件判断正文结果。前次失败正文保留在同一合成测试笔记，没有覆盖或清理以获得通过。

## 受控补丁方案与收束边界（实施前契约）

固定prosemirror-view1.42.9，使用pnpm补丁，不升级或降级Tiptap/PM/Tauri。新增默认关闭、仅Android正式编辑器启用的选择项。只有真实可信DOM compositionstart/update建立“原生组词仍活跃”信号；真实compositionend清除此信号。5000ms闲置回退仅在该信号仍活跃、view仍在组词、实际焦点仍属该view、预编辑文本节点仍连接在该view且DOM选区focus仍指向该节点时保留保护；不重排一个更长固定超时，不推测或重写候选文本。

缺少compositionend时仍保留明确回退：非组词的可信beforeinput/keydown、真实blur、窗口失焦或文档隐藏使原生组词信号失效并收束；没有有效焦点/节点的闲置回退仍执行。真实end之后沿用原有20ms清理；程序化endComposition/clearComposition入口不被拦截，授权变化、导航与destroy继续能够清理旧view和定时器。键码229、Process及isComposing输入不被当作非组词边界，避免候选选择前提前结束。实际补丁与验证如改变此方案，应同步本节。

保存/授权协议、revision冲突基线不改。诊断显示保存中间preedit不会直接重建DOM，本修复不通过绕过保存或推迟授权屏障掩盖节点保护问题。所有回调绑定所属view，销毁移除新增边界监听；不得把旧笔记组合输入递交给新Editor。

## 当前实现与检查

实现为 `patches/prosemirror-view@1.42.9.patch`，同时修改包的src/ESM/CJS/types；`pnpm-workspace.yaml`与锁文件固定补丁hash `d108f8a44a6a15b29cd7c7460f2aa5bd9d7bcb12510acabe6bfa1d159932161d`，不变更依赖版本。`src/Editor.tsx`仅添加正式Android opt-in；App、Rust、授权及保存协议未改。91项生产输入的aggregate为 `105aef1be2cc368df292b29bb983f822ccf273d7b2886f3a5ae5efa262237bb0`，见source-inputs.json，已安装补丁src/ESM/CJS/types也逐字节记录。

`pnpm typecheck`、`pnpm build`、`pnpm android:build --debug`通过；`pnpm test:native-toolbar`12项、`pnpm test:access`16项、`pnpm test:editor`65项schema及真实编辑器动作通过。`node scripts/check-android-composition.mjs`15项通过，直接加载已安装补丁ESM、使用临时私有导出与fake view/timer，仅证明恢复契约；不能充当真实IME验收。新增脚本已prettier，git diff --check通过。Rust源未改，本轮未重复Rust检查。未进行FIX04 Mac构建或真实Mac回归。

## 无断点真实候选结果

candidate01 APK SHA-256 `d5c6f59b79031d1e103f418450e6cbd9d7fa8e8fc085263fab3d23d6b3e04d21`，300954658字节，原字节保留 `/private/tmp/notes-fix04-candidate-01-d5c6f59b.apk`。正式产物没有取证面板。先安装、实际COLD启动，再仅启用Runtime域和只读passive observer；未启用Debugger、未装断点。输入与候选均为原生adb触摸，探针没有直接写入正文或派发composition事件。`probe-tools/`保存临时collector与observer，不打包进产品。

- `candidate-01/clean-before`是真正空paragraph。`clean-long-marked` at87104.4至`clean-long-idle`285946.6，约198.842秒无按键；Editor14/View15/DOM16、连接的textNode22保持，composing/nativeCompositionActive均true。真实候选后`clean-long-committed`仅有正文`你好`，没有本轮拼音或标记。
- `empty-fast-*`正文空段快速候选，marked314791至提交315303.4约0.512秒，结果精确`你好`。
- `middle-fast-*`从`LEFT-RIGHT`中间插入，结果`LEFT-你好RIGHT`；`middle-long-*` marked364759.2至idle385084.8约20.326秒，节点31保持，再选词成为`LEFT-你好你好RIGHT`，相邻文字保全。
- `cancel-marked`后真实连续5次退格，`cancel-after-delete`精确返回本轮之前`LEFT-你好你好RIGHT`，未删除相邻已提交文字。之后再次真实候选和LatinIME ASCII输入，`mixed-after-idle`为`LEFT-你好你好你好ASCIIRIGHT`，无本轮预编辑标记。输入法切换及LatinIME自身组词事件也原样保存，未假装单一IME覆盖全部混输。

这些是有限开发自测，不是独立通过，也不外推到其他WebView、IME、实体设备或UI像素一致性。

## 明确失败与原包对照

candidate01 `format-boundary-marked`正在组词；真实格式按钮触摸后，程序化DOM blur同路径出现compositionend(data=`ni hao‸`, isTrusted=false)，随后真实blur，PM组成态清理但正文保留`ni hao‸`。Tiptap blur源码仅安排DOM blur和移除选区，不能据isTrusted=false断言它主动构造事件。候选提交的真实动作同样产生isTrusted=false compositionend，不能以此值单独判定构造方。没有删标记、猜候选或回滚全文掩盖失败。

有限原0aac对照在 `baseline-format-0aac/`：实际安装base.apk SHA核为0aac2d73…，同Trime inline模式。最初标题轮次并非正文，单列保留；后续原生触摸真正空paragraph，`body-clean-before`选区31，`body-clean-marked`95773.2仍composing且node21连接；约0.555秒后实际格式按钮，`body-format-after`96328.2正文成为`ni hao‸`，PM composing=false且node22替换。证明原包已有格式残留，不能把它说成新补丁独有回归；不等同证明全部blur/后台路径同因。

candidate01 `background-marked`→真实Home→HOT返回：window/document边界释放composition，随后授权确认临时隐藏编辑器，最后Editor14替换为Editor32，`background-restored-settled`本轮预编辑仍残留。该序列没有写入另一个note。只记录实际同周期顺序，未证明后台残留究竟由哪一层commit/cancel或授权重建造成。整个输入目标仍被此失败阻塞，后续任务FIX06。

现有 `scripts/android-ime-regression.mjs`以LatinIME真实长按Beta、打开格式、粗体、X恢复与纸张路径复查。candidate01与原0aac各运行一次，均在纸张cancel返回断言失败：预期选区31..35，实际1..1；`format-paper-candidate01/`和`format-paper-baseline0aac/`保留两次截图/快照，格式选择/粗体/X前序有限通过。没有把整份脚本标成通过，纸张取消选择丢失因果unknown，未扩大修复。

## 产物恢复、冷启与交接

对照结束重新安装同字节candidate01，设备base.apk再次SHA核为d5c6f59b…；实际路径见artifacts.json。`candidate-before-boundary-cold-workspace`与candidate-final的真正force-stop→pid absent→COLD之后整份合成note JSON完全一致，包括已保存的失败残留。这仅证明未额外丢数据，不能把残留保存当作输入正确性通过；前两段主路径`你好`仍保全。

最终通过真实Trime设置UI把Inline preedit mode恢复Disable，四项secure输入设置逐项恢复并读取核对，与baseline-34223af/original-input-settings.json相等：LatinIME默认、原启用列表、subtype=-1、show_ime_with_hard_keyboard=1。没有清除应用数据、卸载输入法或导出私人目录。

当前FIX04状态为partial/in-progress，先交独立verify有限复验长候选主路径；格式/后台原生提交取消与纸张选择失败继续阻塞整体目标。Mac本轮unknown，待root整合隔离原生补丁后统一构建回归。未宣称产品完成或像素一致。
