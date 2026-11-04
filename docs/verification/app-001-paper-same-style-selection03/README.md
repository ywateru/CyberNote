# 当前纸张无变化选择与首次预览授权：候选03

状态：**实现及必要检查完成，产品源码停止写入；未暂存、未提交，等待独立审阅和统一准确APK实机验收。** 本轮仅改 `src/App.tsx` 的两处必要接缝；rounded03 CSS保持固定。任务契约为 `docs/plan/tasks/app-001-paper-same-style-selection03.md`。

## 结论和范围

点击已选纸张现在直接调用既有 `closePaper()`，不发起无变化 patch、不增加纸张版本。若浏览器预览的新建响应缺少 access，App先通过现有 `loadWorkspace()` 取得可信授权，再将新笔记与其授权同时放入状态。原生响应已有 access，保持直接使用响应的原路径，不增加读取。

基线 App 来自 `26d517fa4266923974105879063f49d744f72f4a`，SHA为 `99a6df4a9e06998f85122810a61359d251110fe73022e0372fec9ef87a8c0d5e`。候选 App SHA为 `6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4`。固定圆角 CSS SHA仍为 `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7`。精确差异见 `source.patch`。

`source-audit.json` 验证完整 App 仅有这两处接缝替换，其他字节均相同：hydrate、clearSensitive、访问事件、flush、doAction、saveDoc、pending/ACK、revision、externalVersions、closePaper、SearchEditorHost key均未更改。其列明的209项受跟踪输入中，本任务仅App改变；CSS作为上任务已固定输入单列身份。此209项审计不代替root统一包完整冻结清单。

## 首次失败的实际来源

`baseline01/result.json` 在真实挂载生产App、Editor和未改动 browser-preview bridge 中，分别复现首次选择已选plain及首次改为grid-large两条新建路径：

1. 预览 `createNote` 返回Note，没有access。App原先保留旧workspace access，其中 `notes={}` 缺少新笔记ID。
2. 正文正常经过真实保存队列并ACK。选择纸张时pending为空，前后正文严格相同；这不是外部正文变化，也不是待ACK正文的比较错误。
3. 纸张 `patchNote` 经 `doAction→flush→action` 返回Note，没有workspace；于是 `refresh→loadWorkspace→hydrate`。
4. 可信读取包含新笔记 `epoch:0`；旧授权记录缺失，hydrate检测到 `undefined→0` 并调用 `clearSensitive`。
5. 清理销毁真实Editor；React重新建立宿主。父key、Editor/View/根DOM改变，PM选区3..8→1..1，undo计数清零。完整正文仍相同。

这是本轮**浏览器预览设施和新建响应形状的实际失败证据**。native bridge会验证并返回后端access，现有原生响应契约测试也使用这种形状；本轮没有证据认定当前Android真包存在同样的首次plain失败。不能把Chrome结果移作原生故障或原生修复验收。

仅增加paper no-op会隐藏首次plain刷新，但首次改非plain仍会失败。因此修复同时补齐新建时缺失的可信access，不放宽hydrate。缺少旧授权记录仍触发敏感清理，未合成假access，未修改preview实现或后端。

## 真实App行为验证

`check-real-app-initial.mjs` 是 baseline01/candidate01 使用的精确初版检查脚本。它装载生产React App、完整CSS、真实Tiptap和原bridge，使用独立浏览器配置与独立临时Vite cache，仅本机回环。注入内容只记录实际创建响应、hydrate输入、clearSensitive调用、save提交/ACK和action结果，不替换处理算法。实际实例引用从 `.tiptap.editor` 保存；沿Tiptap命令创建的DOM祖先取得真实React fiber和父key，不使用假Editor。

候选 `candidate01/result.json` 两条路径的8次选择全部通过：

| 路径 | 操作序列 | 原action调用增量 |
|---|---|---|
| 新建后首次plain | plain → plain → grid-large → grid-large → plain | 0 / 0 / 1 / 0 / 1 |
| 新建后首次grid | grid-large → grid-large → plain | 1 / 0 / 1 |

每次均保留实际父key、Editor/View/根DOM、全文、PM选区和history计数；返回后可编辑、焦点隐藏。同样式持久revision完全不变，不同样式仍走原patch→flush/action/refresh链并正确保存。

取消、Escape和遮罩处理器前后完整状态相同。补充 `back01/result.json` 通过当前最终脚本 `check-real-app.mjs` 调用原 `androidBack.current()`，实际执行既有modal paper分支、closePaper和bookmark恢复，实例、选区、全文及history均保全。该脚本新增只读处理器入口，`SAME_BACK_ONLY=1` 跳过已完成的选择序列，仅补关闭路径。此证据是原处理器在隔离App内的调用，不是硬件/系统Back实机输入；遮罩为DOM事件、Escape为浏览器键盘。

## 待ACK正文与真实撤销

`check-pending-app.mjs` / `pending01/result.json` 对当前plain与grid-large分别验证：仅将原browser transport的saveNote响应暂缓；App saveDoc、enqueueSave、revision和pending/ACK算法照常运行。只读探针暴露实际pending/failure Map，未修改Map或插入假保存结果。

- 正文实际编辑产生pending后，后端预览仍保留旧正文，保存响应处于等待。
- 再设选区3..8并进入纸张页，点击当前样式在ACK释放前即可关闭。关闭前后pending完整正文、失败Map、原queue请求、持久revision、bookmark、父key、Editor/View/DOM、全文和history完全相同，可编辑且键盘焦点隐藏。
- 释放原transport等待后，实际保存完成：pending清空、failure为空，存储正文等于原pending全文，revision只因该次正文提交增加1。实例、选区和history保持。
- 实际调用同一个Editor的undo和redo成功，undo改变文档、redo恢复pending全文；之后原保存队列正常排空。

这证明no-op关闭不依赖flush、不清空未确认正文，也不绕过ACK。它仍是浏览器受控响应时序证据，不是Rust存储、IPC或设备验收。

## 复用生产安全检查

`recording-submit.json`：现有 `scripts/check-recording-submit.mjs` 21项通过，直接执行当前App AST提取的保存/flush/重试/关闭边界、生产SaveQueue、AccessGate与TrustedSynchronization，覆盖等待ACK、保存失败重试和关闭阻挡。其平台I/O受控；名称中的native入口不表示运行了原生应用。只将标准输出收至本任务目录，没有改动原脚本或共享cache。

`identity-adapted03/result.json`：复用原 `scripts/check-document-identity.mjs` 内容，并在自有副本适配已有设施漂移：编译当前schema的NoteTag本地依赖，将真实key提取目标改为当前SearchEditorHost，补齐当前create闭包的现有控制器，以及pending分支所需的生产documentText绑定。原有测试保留，新增4项必要边界，共30项通过：

- 严格正文比较、真实schema/PM bookmark与undo路径保留。
- 外部真实正文变化仍增加externalVersion并改变生产key。
- session/note epoch变化仍清理；旧授权记录缺失仍清理。
- 未授权snapshot不能复活pending正文。
- 有pending时外部refresh保留pending全文和其原revision基线，不把它当已确认正文。
- 有access的原生新建响应不调用fallback load。
- 缺access的预览新建经可信load取得新笔记epoch后，首次metadata刷新不触发假清理。
- fallback读取跨新session变旧时，现有AccessGate拒绝它，不将新建正文写入当前workspace、不选择该笔记。

这些是实际生产闭包/组件契约的源码检查；不把它们写成真实React挂载、Rust或设备通过。真实挂载身份另由上述App脚本证明。

设施失败原样保留：`identity-original01.log` 和 `identity-adapted01.log` 均因原runner遗漏当前schema新增本地依赖而未进入用例；`identity-adapted02.log` 在新增pending用例发现原hydrate绑定未注入documentText。随后仅修正自有测试设施，未修改生产算法。相应脚本版本和输出目录保留，不覆盖旧失败。

## 构建、复现与后续

`pnpm build`退出0；保留现有chunk大于500kB提示于 `build.log`。本轮未运行GUI、ADB、设备安装、平台构建、共享Rust/Gradle缓存，也未下载、升级、清理或提交。封存前磁盘空间高于2GiB。

在仓库根目录，用新的空输出目录复现，不覆盖既有证据：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/verification/app-001-paper-same-style-selection03/check-real-app.mjs docs/verification/app-001-paper-same-style-selection03/run-new
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/verification/app-001-paper-same-style-selection03/check-pending-app.mjs docs/verification/app-001-paper-same-style-selection03/pending-new
```

精确输入、脚本和输出SHA见manifest。后续由不同作者独审，再与已审圆角CSS统一冻结准确commit、离线构建新APK；实机检查首次选择当前样式、首次改样式、继续输入、正常保存重开以及原样式恢复。完整目标仍要求原生键盘、系统Back和原版UI/交互验收，本轮不能代替。
