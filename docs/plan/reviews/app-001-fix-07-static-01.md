# FIX07 第一阶段独立静态复核 — a540928

日期：2026-11-03。结论：**第一阶段有限静态复核通过；原真实纸张选区失败保持 blocking / runtime unknown。** 受检候选相对 base393b7a3 仅新增严格 JSON 结构比较，并替换 hydrate 的一处文档比较及其 import。未发现本轮范围内新的确定 P1/P2/P3。不能凭源码比较缺口和定向检查，把原两包第二次选择 grid-large 后选区 31..35→1..1 的真实失败关闭。取消纸张原本保留选区，不是本任务失败触发。

## Findings

| 项目 | 严重程度 | 门槛 | 结论与设计/代码位置 |
| --- | --- | --- | --- |
| 继承：真实选择 grid-large 后选区丢失 | P2（既有失败，非本轮新增） | blocking | `docs/plan/tasks/app-001-fix-07.md` objective 1–3 要求纸张仅改属性、保留同笔记编辑器/有效书签，并保留真实外部更新及授权失效边界。FIX04 candidate d5c6…和旧0aac的 `paper-grid-large-native.json` 均为31..35→1..1，取消均保留。候选 `src/App.tsx:318` 修正对象键顺序导致的比较差异，关联 `:2853` Editor key，但原失败周期的比较实参、真实 Editor identity/key 与重挂载时序未捕获。源码路径成立不证明其为唯一运行根因；需正式安装包真实动作后才可关闭。 |

本轮没有新增确定问题；该继承项不阻塞最小候选进入统一构建和有限设备复验，但继续阻塞“纸张交互已修复”的结论。没有扩大到完整授权安全矩阵或其他功能验收。

## 冻结输入与范围

工作目录 `/private/tmp/apple-notes-paper-selection-07`，branch `task/app-001-fix-07`，实施提交 `a54092880844aed1357e8752b3710c11f0260504`，base393b7a3。开始时目录干净。独立以 git 对象读取并逐项核对 `docs/verification/app-001-fix-07/source-inputs.json` 的三个输入，全部匹配：

| 文件 | SHA256 |
| --- | --- |
| src/App.tsx | 9154968f9489fe68e92445d492a6973f259f911d01f8823ddb14b572f614b524 |
| src/document-equality.ts | 629d2729ac47626f6618f13d6858c98dc5a0f654a4b53ba70f6ec0731204db7d |
| scripts/check-document-identity.mjs | 25d30bc76624bc6afb649f3f3fc585e823709afd37aad706c0b808de26db21a6 |

按有序 `sha256 + 两空格 + path + LF` 聚合为 `d6dbd781c9ea5a774293097e63f856dbc48087bbb6b92365ba196eea9028d853`，匹配开发清单。它只覆盖三个有限源码/检查输入，不是完整生产构建清单，也没有应用二进制身份结论。独立复核未改产品文件、未构建 Mac/APK、未操作任何 GUI/Android 设备。

## 比较与生命周期核查

`document-equality.ts:6–33` 只在原值严格相同或递归结构相同时返回 true。两侧对象须同为数组或非数组；数组长度须相同；每层 own enumerable string key 数量相同，右侧须实际持有同名 own key，再递归比较其值。因此对象属性枚举顺序被忽略，数组元素位置、数组长度、节点 type/text、每层 attrs/marks、未知 JSON 字段、缺失字段、null、显式 undefined 和值类型仍被区分。它不经 schema 默认值归一化、不忽略标记或属性、不排序数组。输入契约是现有 schema 接受的无环 JSON 记录，不将其提升为对任意 JavaScript 对象、原型、循环引用或非 JSON 数值的通用深比较/存储校验。

`App.tsx:298–343` 的 hydrate 仍在比较文档之前独立计算 session/每笔记 epoch 变化并调用 `clearSensitive`。`!pending && old && !documentsEqual(...)` 时仍递增 externalVersions；真正文本变化不会被纸张属性更新豁免。pending 分支仍由既有 revisions/授权规则决定，未授权快照或授权身份变化时不覆盖为旧 pending 文档。该补丁没有改变保存 revision、存储协议、冲突处理或 accessGate。

`App.tsx:569–594` 的 `clearSensitive` 仍失效原生动作、清理附件目标，并在当前笔记受影响时实际 destroy 旧 Editor、清理 barrier/format/paper target 与相关 UI；它不受 `documentsEqual` 返回值控制。`:2853` 的 key 仍包含 noteId、sessionId、该笔记 epoch 和 externalVersions，换笔记/授权身份仍有独立身份边界。受检差异没有修改该 key、条件渲染或 destroy 路径，不存在“同文档就跳过授权清理”的新增豁免。

纸张当前路径仍是 `:3052–3056` await patch 更新 paperStyle 后 closePaper；`:735–752` 只在目标 Editor 未销毁且仍是当前 note/Editor 时解析原书签并恢复选区，再 blur/隐藏键盘。`:792–808` transaction 仍映射对应书签；`:814–824` 切笔记清目标，`:874–891` 打开纸张记录目标并禁编/隐藏键盘。候选没有固定选区、跳过 hydrate、强留旧 Editor 或将全部外部文档视为本地。严格结构比较能避免仅对象键顺序变化造成 externalVersions 递增；它对真实 React 调度下 Editor 身份、纸张关闭时机和选区的影响仍须运行证据。

## 独立定向检查与证据限制

本轮独立执行：

| 检查 | 结果 | 实际边界 |
| --- | --- | --- |
| node scripts/check-document-identity.mjs | 22/22 pass | 真实 schema 富文档递归键重排、内容/类型/属性/mark/数组/缺失/null等差异；从生产 App AST 提取 hydrate 与 key 表达式，在有限环境执行相同文档纸张刷新、真实正文变化和 session/epoch/pending 授权边界。 |
| pnpm typecheck | exit0 | 无输出错误；仅本次冻结候选 TypeScript 类型检查。 |
| pnpm test:access | 16/16 pass | 既有 production access response boundary 检查；不表示完整设备竞态矩阵通过。 |

22 项检查直接加载生产 comparator，使用真实 ProseMirror schema/state/history。纸张检查证明抽取 hydrate 中 paperStyle 更新和 key 不变，并在独立创建的原 state 上验证书签解析与 Undo/Redo；**并未挂载 React，也未证明真实 Editor/DOM 保持或完整纸张行为通过。** 授权检查记录 `clearSensitive` 调用；实际 destroy 是否存在由上述源码复核支持，非设备执行证据。开发 `checks.json`/source-review.md 的结果与本轮重跑一致，但不把开发记录代替本轮执行。

初次执行时隔离目录没有 node_modules，22 项与 access 检查因找不到 typescript、typecheck 因找不到 tsc 而未启动；这些是依赖环境失败，不是产品断言失败。随后临时将 node_modules 只读复用到主目录已安装依赖后执行三项检查，无安装/下载/修改依赖，结束已移除该链接。生成的临时检查产物留在隔离目录 ignored artifacts，不纳入产品提交；本轮仅提交独立报告。检查后没有新产品更改，不追加无关测试。

## 后续真实验收门槛

root 统一集成后，在同源正式 APK 上实际长按选区→格式/粗体/X→纸张取消→再次打开选择 grid-large→返回核完整选区、键盘、输入及 Undo/Redo→强停冷启动，同时记录实际 Editor identity/key/文档/paperStyle。还需普通自身保存与真正第二窗口外部文档变化各一次，确认保持与更新两条分支。若仍失败，继续有限时序诊断，不以本报告替代。Mac 同源正式包运行回归、原版像素、实体手机与 iOS 均 unknown。
