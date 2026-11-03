# 纸张选择后选区丢失：有限只读定位

2026-11-03。只读FIX04两次实际快照、原生动作日志和当前App/Editor源，没有操作设备、改产品或重新测试。

## 先更正实际触发

两包目录 `format-paper-candidate01/` 与 `format-paper-baseline0aac/` 的paper-cancel-native选区都是31..35，domSelection为Beta，editor恢复editable，IME隐藏；取消通过。第二次打开paper-picker-select-native仍是31..35。选择grid-large后paper-grid-large-native才变1..1，正文JSON语义与bold-native完全相等，焦点和IME仍隐藏。实际脚本 `scripts/android-ime-regression.mjs:285` 对应assertReturned(chosen)，不是取消。开发先前把堆栈步骤读错，现已更正selfcheck/artifacts/README/architecture，原始证据不修改。

原生目标由可见 `.modal-paper [data-paper-style="grid-large"]` 的实际DOM矩形得到再用adb触摸，快照也记录该选项存在；没有证据表明脚本误点取消或另一个note。此路径仅证明有限真实失败，两包同现不证明全部纸张边界同因。

## 可区分的静态候选

App纸张选择处理先await patch(patchNote,paperStyle)，再closePaper。patch→doAction在操作后refresh/hydrate；取消仅closePaper，没有这次保存刷新。

hydrate比较JSON.stringify(old.document)与JSON.stringify(n.document)，不相等且无pending便递增externalVersions。NoteEditor的key包含该计数，以及授权session/epoch；closePaper的paperTarget仍保存原Editor实例，并只在它未destroy且仍匹配当前editor时恢复书签。

现有e.getJSON快照对象键顺序为type/content，Rust读取的合成note document（candidate-final/force-stop-cold-note）为content/type；JSON字符串比较对键顺序敏感。语义相同的文档因此存在被当作外部修改、递增key并重挂载Editor的静态路径，可解释为何选择并保存比单纯取消更易丢选区。但纸张脚本未记录Editor身份、externalVersions或hydrate比较的两个实参，不能把这条路径写成当次已证根因，也未排除授权epoch变化。

下一步只需核该实际保存周期的hydrate两份文档、比较结果、Editor/key身份与paperTarget/closePaper时序，再选最小修正。它与raw preedit原生commit/cancel分别调查；不要为保留选区绕过授权失效或忽略真正外部文档变化。
