# Mac 主窗侧栏显隐偏好22

状态：SOURCE-READY STOP，等待不同作者独审。仅 `src/App.tsx`、`src/types.ts` 和新增 `src/sidebar-preference.ts` 为产品变化。原版21隐藏状态跨正常新进程保持、克隆18重启恢复可见的有限反例是需求输入；本轮实现已确认偏好恢复与窗口close等待，不扩展宿主退出协议，没有准确Mac新包或GUI验收。

## 实现接入

```text
Mac native 非独立主窗首次可信同步成功
  hydrate接受 → 独立initializedSidebar门槛
              → strict boolean恢复；missing/非法只在内存true
              → requested ref + React sidebar
              → DOM / 既有原生toolbar / 既有菜单投影

四个用户入口：原生action / 全局显示菜单 / DOM隐藏 / DOM显示
  changeSidebar：同步更新requested与UI，React updater不执行I/O
    → SidebarPreference.request（串行，合并等待期间的新意图）
    → 原生产bridge.action → workspace_action → Session.ordinary
    → 原Store.action(settings)单键UPDATE → 返回workspace
    → accepted && 无maintenanceError && 返回准确boolean，才直接确认
      否则原bridge.loadWorkspace访问/metadata校验后的准确读回确认

窗口close：原OCR/录音close同步封住新工作 → 等两者close
       → 偏好flush / 原正文flush，期间有新偏好则继续等最终意图
       → 原pendingDocs / OCR / 录音最终检查 → destroy
       → 任一失败仍保留窗口与现有错误反馈
```

请求队列不发布完成时的UI，也不hydrate旧workspace。未确认保留版本与最终意图；后续明确动作或窗口close可重试，不无界自动重试、不回滚true。返回Promise resolve本身不等于确认。无value、访问未接受、maintenanceError及不确定读取均经既有可信读取链；若仍不能证明准确boolean，沿原错误通道显示“侧栏显示偏好未确认保存”。严格相等排除字符串false、0等类型伪装。

首次恢复只在可信同步publish成功后执行一次，与selection门槛独立；错误不消费门槛。加载前Mac显隐入口不产生写入。后续hydrate、被动刷新、设置变化不恢复或自动保存本轮sidebar。Mac宽窄响应式状态不参与所有权；只有 `native && macNative && !separate` 读写此偏好，Android/iOS及独立窗保持原有内存/导航行为，不从原生投影false写盘。未修改原生toolbar/菜单路由或几何、Rust schema/store、其他设置写法、正文保存和媒体所有权。

## 实际验证

`browser-attempt02/result.json` **27场景通过**。使用真实生产App、Editor、完整CSS、未改bridge及原生toolbar controller/guest；仅加入只读观察变量，不替换产品函数。浏览器底层Tauri invoke由受控端口承接，workspace读写交给当前生产Rust Session/Store，所有库位于本任务合成data目录。

- 首次missing、false、true、字符串false、0、null、数组、对象；加载前零偏好写；首个enabled工具栏投影与真实DOM状态相同。初读失败后通过真实“重试同步”按钮恢复，门槛未提前消耗。
- 原生action、全局显示菜单和两个DOM显式入口均接入；DOM入口通过受控原生toolbar不可用情形验证。App发出的偏好patch均仅含一个boolean键，已存主题、宽度、selection及未知嵌套键保留；窄宽resize不写偏好。
- 旧返回受控延迟期间的新意图即时显示，写入保持串行；旧拒绝不回滚或阻塞新意图；最终false/true准确落盘。
- 无value、未接受访问、写后maintenance错误分别可信重读；重读失败保持dirty与布局。窗口close重试失败不destroy，后续确认才destroy；关闭期间的新意图也等待最终完成。
- 实际生产Editor合成正文保存被拒绝时，即使偏好确认，窗口close仍不destroy且保留编辑器正文。
- 再次可信同步、metadata刷新及合成后端设置替换不重置当前请求值、不写默认值；Android、iOS、独立窗不读写Mac偏好。
- 已确认false和true分别关闭Rust transport进程，以新PID/new Session/new Store重开同一合成库，再创建全新生产App读取。两种状态均恢复，页面零启动偏好写，旧设置/未知键保留。它是隔离链路持久化证据，不是准确Mac应用正常退出证据。

`delivery-result.json` **4个补充端口场景通过**：直接执行实际生产helper，覆盖“accepted value存在但同时有maintenanceError”的更严格输入形状，仍必须读回；读回失败保持dirty。另核未接受value、非法读回类型和准确accepted快速确认。这是对27个App集成场景的补充，没有用假helper替代App验证。

`typecheck.json`：一次 `pnpm typecheck` exit0。`rust-build.json`：当前生产Session/Store经任务隔离target离线编译exit0；13个dead_code警告保留于原始输出，没有运行正式Tauri平台构建。`preservation.json`记录20 CSS、16/17组件/adapter、bridge、Rust宿主/存储/会话和toolbar等9项身份保持，以及原close封口/最终检查仍在原顺序。原生OCR/录音媒体未创建或导出，保留调用链不等于新增真实媒体运行验收。

## 原失败与证据身份

`browser-attempt01/`、`check-app-attempt01.mjs`完整保留：19个有限场景后，独立窗准备把createNote返回的Note误当workspace而失败；该轮还存在歧义case名称复用，不用于最终隔离结论。仅修测试夹具为Note.id、唯一目录，并补齐剩余契约场景，产品源码没有因此改变。`browser-attempt02/`为最终27场景，`check-app-attempt02.mjs`固定其实际执行字节；`attempts.json`记录区分。

`source-manifest.json`保存产品、全部生产Rust模块/依赖锁、只读工具、基线和测试脚本SHA；`evidence-index.json`索引本目录全部文件，不含自身。`browser-attempt*/rust-rpc.json`为实际Rust请求/回包，`worker-processes.json`保存PID和退出状态。合成SQLite库和最初失败均保留。浏览器、HTTP/Vite及所有Rust worker已关闭，只删除本任务停止后的Vite缓存；任务独占Rust target保留供匹配SHA的只读复用，不写共享target/cache。

复核可读取 `rust-target.json` 的当前工具路径并比对manifest，或用 `cargo build --offline --manifest-path docs/verification/mac-sidebar-preference22/harness/Cargo.toml --target-dir <新的任务隔离target>` 重建。`check-app.mjs`从本目录rust-target.json读取工具；独审可复制脚本并显式选择其自身target，不能改写作者封存输入。设现有PLAYWRIGHT_CORE_PATH/CHROME_PATH后，以新的输出目录运行 `node docs/verification/mac-sidebar-preference22/check-app.mjs <新的输出目录>`；不得复用已有输出目录。

## 退出与交付限制

`quit-boundary.json`仅为锁定依赖只读事实：当前预定义CmdQ的terminate:与关闭窗口performClose:分属不同入口；任务22没有新增宿主退出握手。window-close待写保护通过，不代表“最后点击后立即CmdQ”也被保护。root明确保留该边界，准确Mac11必须把“确认后退出”和“立即CmdQ”分列实际保存帧/PID/新进程恢复证据；若后者丢失，保持partial并另做最小后续修复，不用长等待掩盖。

归档导入本身未重跑：本轮实测可信重hydrate/后端设置替换，且源码只有首次恢复入口；原archive规则及相关产品文件不变，不扩大为完整归档验收。无多主窗实时同步、异常退出、全部侧栏行为或像素一致性结论。没有正式包/安装、GUI/ADB、用户DB访问、下载、音频导出或Git mutation。等待独审及root后续准确Mac11接受。
