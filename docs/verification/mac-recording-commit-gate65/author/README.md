# 自动保存64现场阻断修复：作者证据65

冻结产品：`24b6f45321367144fc684b0ef32a14738a7b0eba`，基于 sealed Mac18 的 `0633b0ec`。只改 App 桌面目标校验的真实Host commit等待，以及 DesktopRecordingPanel 状态投影边界；没有放宽校验器、原A归属/权限/文档检查、持久化、媒体格式或改变64契约。

## 首次checkpoint阻断的准确路径

`baseline/result.json` 和 `candidate-final/result.json` 使用真实挂载的生产 App/SearchEditorHost/SearchEditorGate/NoteEditor/useEditorCommit，受控native IPC和合成A/B笔记。原A正文末尾选择句号，打开桌面录音ticket，直接提交合成File以隔离Host保存路径；没有麦克风、真实音频或实际子窗口。

对 sealed18 App 的观察：`synchronizeRef.current()`开始时React把活动A Host暂时park；可信load返回后同步Promise先完成，恢复editability的React layout commit尚未发生。`validateRecordingTarget`立即看到editable=false，因而store前拒绝。此时active、sameEditor、owner、documentVersion、externalVersion、Editor正文、可信正文、同步结果、session/global epoch/note epoch全未变，也无access operation、suspend或destroy，错误准确等于现场。每次重试重新同步都会遇到相同时序。没有证据表明title、selection或live decoration造成正文变化。

修复在每次成功且仍当前的可信同步之后等待生产`useEditorCommit`的实际父layout effect；等待受ticket AbortController管理。随后继续执行原owned/queue/pending和全部原A安全条件。没有直接将editor改为editable、忽略许可或用延时猜测提交。

`candidate-final/result.json` **9组通过**：准确sealed18基线拒绝；候选同一A首次checkpoint成功；真实commit等待期间owner、note epoch、external version、access operation、suspend变化均拒绝（store 0）；seal abort与unmount均结束等待并拒绝（store 0）。候选保持单个A持久卡和原editor实例。

## “录音状态无效”的独立可复现路径

`state-candidate-attempt1/result.json` **2组通过**，实际挂载生产DesktopPanel/Owner/Dock，受控时间和媒体事件。sealed18桌面新Panel遗漏旧移动Panel已有的投影边界：

1. level样本先于100ms elapsed的React提交，snapshot可能出现sample.at > elapsed，被现有Owner校验器正确拒绝。
2. retry回放时浏览器seekable末尾可略高于已知媒体duration，旧桌面Panel直接传原范围，同样被校验器拒绝。

retry/checkpoint对应phase本身被现有TS校验接受，native路由不验证state body。受控例证明以上两条是新桌面投影缺陷；没有读取现场state，不能把其中某一条宣称为现场toast的唯一实际谓词。

候选恢复`activityElapsed=max(elapsed,lastSample.at)`，seekable裁剪到媒体duration、过滤非有限/空范围、最多64段。原validator保持不变。精确相同受控事件下候选全部投影有效，Owner接受当前retry状态，实际Dock完成对应layout ACK。最初state-baseline fixture未引入样式，导致Dock DOM存在但可见性等待超时；原失败保留，添加与产品相同样式后复验通过。

## 保留64的回归与fixture适配

- `regression/app-closures.json`：64实际App闭包/PM/SaveQueue的8组版本替换、query barrier、A/B、同File重试、删除/复制/Undo、query await中新卡变化覆盖通过。
- `regression/session.json`：64 Session/Relay/Owner 8组通过。
- `regression/browser.json`：64真实Chrome合成MediaRecorder+生产Window/Panel/Owner/Editor 8组通过。
- `typecheck.log`、`build.log`通过；build只有既有bundle大小提示。

本次维护64纯PM fixture：该fixture没有React树，明确注入“受控、已提交Host”的`waitRecordingEditorCommit`边界，支持可选延迟和AbortSignal检查，不能据此证明React提交；实际提交由本次mounted9组证明。原64 source-manifest保持历史绑定，不改旧证据。旧generic-picker既有fixture缺注入失败不在本次扩修范围。

## 边界

全部验证在隔离工作树和本地临时浏览器进行。不触GUI、设备、真实Notes、Mac18内存里的真实音频，不导出/复制/转写音频，不退出/重载Mac18；没有改root工作树。未运行新的native编译，native槽仍空闲。实际Mac验证和像素一致性不由这些受控测试证明。

用户随后明确改为桌面统一侧边录音栏；本提交保留有用修复/证据，旧双模式Mac19出包方向停止。本证据不作为新侧边栏架构已完成或已验证的声明。

## 复跑

```sh
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-commit-gate65-app.mjs /tmp/commit-gate65-app
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-state65-browser.mjs /tmp/commit-gate65-state
node scripts/check-recording-autosave64-app.mjs /tmp/commit-gate65-regression
node scripts/check-recording-autosave64-session.mjs /tmp/commit-gate65-regression
```

脚本基线精确读取git `0633b0ec`，只对生产模块加入观测/原生IO边界，不替换目标校验算法。所有新Vite缓存保留在隔离工作树且不加入提交。
