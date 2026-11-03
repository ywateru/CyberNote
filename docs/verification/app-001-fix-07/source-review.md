# FIX07 最小源码候选与静态检查

2026-11-03，隔离目录 `/private/tmp/apple-notes-paper-selection-07`，base393b7a3，branch task/app-001-fix-07。本阶段仅准备候选供静态审查；未操作GUI/设备，未构建APK/Mac包，未改主工作目录。运行根因与实际纸张返回行为仍unknown，原两包失败未关闭。

## 已核定的比较缺口

真实schema富文档经递归对象键重排后，`JSON.stringify`字符串不同，schema仍可接受且文档内容相同。原hydrate将字符串差异当作外部文档变化，递增externalVersions；生产NoteEditor key包含该值。这个源码行为已被定向检查证实，但没有捕获原真实失败周期的Editor身份、比较实参和key变化，因此不宣称它是原运行失败的完整根因。

候选新增 `src/document-equality.ts`，只忽略所有层级JSON对象的键顺序。数组顺序/长度、节点类型、文本、节点与标记属性、字段缺失和null/undefined/值类型均继续区分；不经过schema默认值归一化，不跳过未知字段，不将文档变更一律视为本地。输入范围为现有schema接受的无环JSON记录，不承担存储验证职责。

App只把hydrate的一处JSON字符串比较换成documentsEqual。无pending且确实不同的权威文档仍递增externalVersions；授权session/epoch比较、clearSensitive、pending覆盖守卫、Editor key组成、保存revision、paperTarget书签、closePaper及UI动作都未改。字段顺序相同时的原有路径保持，纸张属性变化由原paperStyle更新流程处理。真正外部文档变更、切笔记或授权失效仍不能为保选区豁免。

## 定向检查与实际边界

`node scripts/check-document-identity.mjs`：22项通过，结果见 `checks.json`。直接加载生产比较函数；真实schema富文档验证递归键重排、嵌套属性/标记及不同内容；从实际App.tsx AST提取hydrate回调和NoteEditor key表达式，在有限环境中执行纸张属性刷新、真实正文更新、授权session/epoch变化和未授权pending内容守卫。使用真实ProseMirror state、书签及history核原状态的Undo/Redo路径。该检查不挂载React，不模拟设备IPC，不能证明实际Editor未重建或完整纸张行为通过。

`pnpm typecheck`通过。`pnpm test:access`现有16项通过。新增文件已prettier，git diff --check通过。只读复用主目录node_modules符号链接；检查产物仅写本隔离目录artifacts，未下载依赖、复制target或重建正式产物。没有无关扩大测试矩阵。

静态审查后仍需root统一集成，正式APK重走真实长按选区→格式/粗体/X→纸张取消→第二次选择grid-large→返回选区/IME→输入及Undo/Redo→冷启。须记录实际Editor/key/文档/纸张身份，并分别覆盖普通自身保存和真正另一窗口文档变更。若此比较修复仍不足，继续有限诊断，不能强设固定选区或绕过授权。
