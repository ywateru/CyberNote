# FIX07 candidate01 运行失败归因：独立有限证据复核

日期：2026-11-03。受检冻结点 `e50c520`。结论：**e117 candidate01 实际纸张失败仍成立；有界诊断支持“NoteEditor key 不变时，授权快照缺口触发主动 destroy”的本次链路，不能写成 React key 改变。** 严格文档比较在该次返回相等，不是本次重建的触发。报告只核开发已冻结的实际快照、原生动作、诊断条件与对应源码，没有新设备执行、构建或产品修改，也不提前验收后续07b候选。

## Findings 与门槛

| 项目 | 严重程度 | 门槛 | 结论与位置 |
| --- | --- | --- | --- |
| 继承：选择 grid-large 后选区丢失 | P2 | blocking | `app-001-fix-07.md` objective 1–3 要求仅改纸张时保持当前编辑器/选区并保留真实授权边界。首轮无断点新包选区33..37→1..1、Editor/View/DOM 4/5/6→7/8/9；取消保留。诊断复现同样失败，外层 NoteEditor key 相同，内层 EditorContent key与实例改变。冻结 `src/App.tsx:300–310` / `:569–580` 的授权变化清理和 `:852–854` 的新建状态采纳构成当前最小修复边界；不得通过将缺失epoch当0、跳过真实授权清理或固定选区抵消。 |

没有本轮新增独立运行或新的确定 P1/P2/P3；本项是原实际失败的归因收窄。原严格比较的静态通过仍有效，但它没有修复整个真实链路。未知的外部文档变化、保存/冷启、其他导航与像素不因本报告通过。

## 冻结来源与两轮区分

只读 `e50c520:docs/verification/app-001-fix-07/android-candidate01/` 中的 selfcheck、failure-and-cause、diagnosis与两轮纸张快照/脚本，未读无关 accent 研究。build-identity 记录 APK SHA256 `e117f92992c450fe8e224a2a9e116df7e0c71a3735335ba8c5a223e5c7c87d5a`、300,954,786B、90条列明输入聚合 `896a763cc70e8150f31522e5e41ebcbfb75636859f810f9d37185ab63ce5d811`，Mac .m/.h排除。本轮没有重核全部构建输入、APK设备安装或重新运行，身份采用此冻结开发记录，不追认到后续HEAD。

首轮 `paper-native/` 是无断点实际动作：新建合成笔记、真实ASCII输入、长按Beta、格式加粗、X、系统Back、纸张取消、再打开选择grid-large。取消保持33..37和4/5/6；选择后变1..1和7/8/9，完整文档相同、键盘保持隐藏。脚本在 assertReturned(chosen) 停止，后续Back重开、保存/冷启/外部修改没有执行，不能算通过。首轮从 .tiptap 本身读fiber得到keyed=[]，没有真实外层key证据，不能借它断言key变化。

第二轮 `paper-diagnostic-repeat/` 同进程真实复现，诊断读取改为从最近父宿主的 __reactFiber 属性向上找key；另一个调试连接设只读条件采集hydrate局部。该轮有Debugger条件，是改变观测条件的诊断，不能冒充首轮无断点验收。selfcheck记录用后移除断点/停止连接；本轮不重连设备确认清理。

## 前后 key、文档与选区

独立读取原始前态 `paper-picker-select-native.json` 和后态 `paper-grid-large-native.json`，并与failure-and-cause聚合逐项相互校验：

| 字段 | 诊断选择前 | 诊断选择后 |
| --- | --- | --- |
| NoteEditor（v9）外层key | `059e1f48-1fb1-4351-bd05-ad6e44fb53b3-d3814517-9a3a-4737-9857-f1b91f4fd796-0-0` | **完全相同** |
| 内层EditorContent（Y8）key | 636980693 | 3629944018 |
| Editor/View/DOM WeakMap身份 | 10 / 11 / 12 | 13 / 14 / 15 |
| 正文选区 | 33..37 | 1..1 |
| 完整PM文档 | 标题FIX07PAPER-1793711379156，Alpha + 粗体Beta + Gamma | 完全相同 |
| imeShown | false | false |

原始动作日志保留13:09:58.607Z真实 grid-large 触摸，随后收到目标hydrate数据。第二轮取消快照也保留相同外层key、10/11/12及33..37。`diagnosis/react-after-failure.json` 是首轮另一个笔记事后fiber，不替代这组真正前后态。

因此应描述为**同 NoteEditor key 下 Editor实例与内部内容重新创建**，不能将内部Y8随机key变化混为生产NoteEditor key变化。快照直接证明实例/选区变化，没有单独钩取 destroy 调用栈；具体主动销毁分支由下一节真实实参与源码共同支持，不能扩大成所有失败周期唯一原因。

## hydrate 条件、真实实参与源码链

`diagnosis/hydrate-read-only-condition.json` 的 Debugger条件仅筛选合成标题，读取当时局部、调用同一个生产比较函数b9并记录，最后返回false；没有改比较实参、赋值产品状态、覆盖返回值或主动暂停。该调用为诊断条件中的同函数同参求值，不是单独捕获了正常分支的返回指令；比较函数是本轮已审纯递归比较，原始left/right独立解析也结构相等。trace目标note与聚合hydrateActual完全一致：pending=false、compareResult=true、externalBefore=0、revision42→43、sessionBefore=sessionAfter。

关键值是 **epochBefore字段不存在，epochAfter=0**。原条件表达式明确为 `O.access?.notes[we.id]?.epoch`；JSON.stringify省略undefined字段。不能把省略写成数字0。独立对照冻结 `App.tsx:300–310`：它在文档比较前按 `previous.access.notes[n.id]?.epoch !== data.access.notes[n.id]?.epoch` 判断授权变化，因此此实参为undefined !== 0，目标笔记被纳入changed，调用clearSensitive。`:576–580` 在当前note受影响时会对仍有效Editor调用destroy并清format/paper target。另一方面 `:315–323` 只有无pending且documentsEqual=false才递增externalVersions，本次不满足；真实外层key也保持末尾0-0，没有该版本驱动key变化的证据。

冻结 `createNote :852–854` 从 `action<Note>` 拿到响应后，只将n插入notes，没将同次返回的access快照采纳到Workspace。`bridge.ts:34–55`/`:156–182` 在返回action值前仍要求access存在并经AccessGate验收；所以“响应已验收access”与“App工作区未保存该快照”是不同边界。新note在本地notes已存在而旧Workspace授权表未同时补入；第一次权威refresh补入epoch0，形成上述missing→0差异。外层JSX key`:2853` 用 `epoch || 0`，缺失和0会投影为同一个key；授权比较本身仍严格区分二者。这解释**key不变但清理仍主动destroy**的路径，不可为了保选区把授权比较也改成缺失等于0。

failure-and-cause中的sourceInference标识为源码推论是准确的。本轮接受“该真实复现周期的实参+源码支持此主动销毁链”的结论，不声称采到单独destroy调用栈、排除所有其他时间因素，或已证明后续补丁运行成功。

## 后续07b审查与报告保存边界

下一候选应限定同次采纳新建note与经bridge验收的access快照，保持真实session/epoch变化的clearSensitive/destroy、真实文档更新和pending保存协议；不要合并缺失epoch与0，也不要绕开Store/AccessGate。候选提交后再核实际改动与必要定向检查，正式包必须重走真实取消/选择/选区/实例和完整保存结果，不能用这份归因报告关闭P2。

本文件仅为独立证据复核准备稿，由root串行保存；本轮未执行git add/commit，未改开发原始证据或历史报告，未新建harness、未重跑平台矩阵、未占Mac或Android。
