---
id: app-001-fix-07
scope: paper-save-selection-and-document-identity
status: in-progress
depends-on: [app-001-fix-01]
---

## objective

修复真实选择大网格纸返回后选区31..35变为1..1的现有失败。FIX04 candidate d5c6f59b与旧0aac均在`scripts/android-ime-regression.mjs:285`失败，取消路径均保留选区；不能继续误称取消失败或补丁独有回归。只准备最小源码候选，待设备交接和正式包独立复验后才能关闭实际失败。

初始候选机制：纸张选择await patch→doAction→refresh/hydrate→closePaper；原hydrate用JSON.stringify比较文档以决定externalVersions，Editor key包含该版本，paperTarget握旧Editor。766a810已接入严格JSON语义比较，25efa59有限静态通过，但实际新包e117f929…选择grid-large仍将33..37变为1..1，Editor/View/DOM从4/5/6变为7/8/9，取消路径正常。对象键顺序修正不能视为该实际失败的完整根因或修复。下一步须核真实hydrate的两份文档、pending状态及React key中的session/epoch/externalVersion变化，最小修正真正引起不必要重建的边界；实际授权或外部文档变化仍按既有协议处理。

1. 仅对象键顺序不同但文档语义相同的权威快照不应触发Editor重建、丢失选区或Undo历史。真正文档变化仍被识别，数组顺序、节点类型/属性/标记/文本和缺失值差异不能被宽松忽略。
2. 纸张选择只更改paperStyle，保留同笔记当前编辑器、有效书签与键盘隐藏状态；取消/Back行为保留。实际外部文档变更、切笔记、授权失效或屏障仍沿既有协议处理，不能为保选区拒绝真实更新、复活旧Editor或跳过FIX03守卫。
3. 先核最小文档比较边界。若语义比较不足以解释失败，保留原失败并继续有限时序诊断，不以全局阻止hydrate、把所有远端文档当本地文档或强设固定选区掩盖。

## context

- docs/architecture.md中纸张书签、保存/授权与Editor生命周期契约
- docs/plan/tasks/app-001-fix-04.md及FIX04 selfcheck（以更正后的选择grid-large触发为准）
- docs/verification/app-001-fix-04/format-paper-candidate01与format-paper-baseline0aac
- src/App.tsx hydrate、externalVersions、paperTarget、选择处理；src/Editor.tsx实例创建处
- docs/plan/reviews/app-001-fix-03-mac-01.md与app-001-fix-03-android-03.md（有限安全边界不得回退）

## path

在root创建的隔离工作目录准备；只改必要文档语义比较及其调用点、纸张返回边界与定向行为检查。不得改存储/授权/保存revision协议，不升级依赖，不混入FIX06组字/媒体/外观。主目录Mac构建和Android验证同时进行，本阶段不操作GUI/设备、不重建主产物；提交候选后静态独立审查，再由root统一接入与设备验证。

## verification

第一阶段用真实schema文档核对象键重排语义等价、嵌套属性与标记键重排、真实文本/类型/属性/数组顺序变化、缺失与null等明确边界；语义比较不能吞真实变化。核hydrate保持同Editor与书签的路径，授权销毁路径不受该比较豁免。运行必要typecheck和相关定向检查，不复制完整targets。

最终正式安装包重走实际长按选区→格式/粗体/X→纸张取消→再次打开选择大网格→返回完整选区/键盘→输入及Undo/Redo→强停冷启，记录实际Editor identity/key/文档与paperStyle。普通自身保存和真实第二窗口外部文档变更各一次，确认保持与更新分支均正确。实际运行未测前继续unknown，不能凭字符串顺序假说关闭原失败。
