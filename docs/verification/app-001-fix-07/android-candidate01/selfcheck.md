# FIX07 candidate01 Android 实测失败与归因

2026-11-03，Android 模拟器 emulator-5580，pnpm android:build --debug。构建前冻结90个列明的 Android/前端源码、配置与锁输入，包含新增 src/document-equality.ts；构建后这些输入及已安装 PM 补丁文件全部不变，aggregate `896a763cc70e8150f31522e5e41ebcbfb75636859f810f9d37185ab63ce5d811`。Mac Objective-C .m/.h 单列排除，toolbar.m 为另一任务未被 Android 编译的 WIP，不声称完整 HEAD 或所有平台输入稳定。

新 APK SHA-256 `e117f92992c450fe8e224a2a9e116df7e0c71a3735335ba8c5a223e5c7c87d5a`，300954786 bytes，保存于 `/private/tmp/notes-fix07-candidate01-e117f929.apk`。旧 FIX04 d5c6f59b 包仍单独保留，新源码不追认旧包。构建退出成功不等于运行验收，详情见 build.log、source-inputs-before.json、build-identity.json。

## 无断点实际结果：失败

paper-regression.mjs 是已有 Android 实际纸张脚本的有限副本。UI 操作使用 Android 真实输入/触摸；运行时仅取完整正文、选区、键盘状态和 WeakMap 身份。没有通过编辑器命令造选区、改正文或伪造输入事件。

新建合成笔记，输入标题与 Alpha Beta Gamma，真实长按选 Beta，真实加粗，再 X → 系统 Back → 更多 → 横线与网格。取消保持选区33..37；第二次打开选择 grid-large 后，选区仍错误地变为1..1，Editor/View/DOM 身份从4/5/6变为7/8/9，正文完整深比较相同。脚本在 assertReturned 的原失败点停止，后续保存/冷启/真实外部修改步骤均未执行，不能算通过。证据为 paper-native/ 的原始快照和动作日志。

初次身份观察从 .tiptap 本身取 React fiber，未找到宿主属性，所以 keyed=[]；不能据此声称 React key 已改变。保留原始快照不覆盖。

## 一次有界诊断复现

paper-diagnostic-repeat.mjs 仅改为从最近父宿主读取真正 React fiber，并在相同进程进行同一路径。另一个只读调试连接，在实际生产 hydrate 比较行设置 condition，记录局部数据后返回 false，不暂停执行，不改比较/数据/返回值。它改变了诊断条件，因此与首轮无断点失败分开记录；使用后移除断点并停止连接。原始条件见 diagnosis/hydrate-read-only-condition.json，事件见 diagnosis/trace.jsonl。

该次真实 grid-large 触发的实际局部数据：

- pending=false，生产 documentsEqual 包装函数实际返回 true，外部文档版本 externalBefore=0。
- 两个文档仅对象字段顺序不同；完整 left/right 在 failure-and-cause.json 与原始事件中。
- sessionBefore/sessionAfter 同为 d3814517-9a3a-4737-9857-f1b91f4fd796。
- **旧 Workspace 的新建 note 授权条目缺失**，epochBefore 表达式值为 undefined，所以原始 JSON 省略该字段；权威响应 epochAfter=0。不得把旧缺失值写成数字0。
- 真正 NoteEditor key 前后完全相同，均为 `059e1f48-1fb1-4351-bd05-ad6e44fb53b3-d3814517-9a3a-4737-9857-f1b91f4fd796-0-0`；内部 EditorContent key 改变。
- Editor/View/DOM 从10/11/12变为13/14/15；选区33..37变1..1，键盘保持隐藏，正文相同。

原始前态是 paper-diagnostic-repeat/paper-picker-select-native.json，后态是同目录 paper-grid-large-native.json；事后 fiber 快照不替代前态。failure-and-cause.json 聚合了上述实际触发数据与明确标识的源码推论。

源码与实参共同定位：createNote 接受 action 返回的新 note，却只插入 notes，未采纳同一已通过 bridge AccessGate 验收的 access 快照。首次 refresh 时 hydrate 将旧缺失 epoch 与新0判为授权变化，调用 clearSensitive；该函数会主动 destroy 当前 Editor。同一 NoteEditor key 随后被 Tiptap 重建。**本次实际失败不是 documentsEqual 返回 false 或 externalVersion 递增造成。** 语义比较候选修复了一项源码问题，但没有修复完整真实触发链。

后续最小修复在隔离07b进行：同次采纳新建响应 note 与已验收 access，保留真实授权变化时的现有清理守卫，不将 missing epoch 当0，不放宽比较器，不绕过保存/Store/AccessGate 协议。此候选报告状态持续 fail，不宣称 Notes 交互或像素验收。
