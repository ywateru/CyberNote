# ACCOUNT109 内置托管页与系统浏览器登录

2026-11-13。用户明确要求客户端可在内置页面登录，也可跳转浏览器，以便测试。此需求接续已有账户同步工作；`9e7c46d2` 的取消/本地保存/重启实测保持原来源，不视为新入口已实现。

## 产品与接口契约

- 账户页提供“登录方式”：应用内登录、系统浏览器。登录和创建账户使用同一选择，初始选择应用内登录；授权中不可开始第二笔事务。省略新参数的既有 native `signIn`/`signUp` 命令保持系统浏览器行为，以兼容既有调用者。
- 新参数只接受固定 enum `surface: embedded | browser`，不接受调用者提供的 URL、回跳、客户端 ID、issuer 或任意窗口参数。UI/IPC 不接收或保存授权 URL、code、state、nonce、PKCE、token、密码或网页内容。
- 两种方式使用同一 native account owner 与既有 AuthClient，保留原 PKCE/state/nonce、精确回跳、固定 issuer/client/resource、严格响应校验、绑定归属、取消代际和网络生命周期。内置页加载同一托管页面，客户端不新增密码表单。
- 授权中的 safe Status 可含 `authorizationSurface` enum，限 authorizing 且尚有本次有效 owner；结束后移除。轮询只读，不能打开/切换窗口。前端以该字段显示实际方式，未知值或无效状态组合严格拒绝。
- 内置授权期间提供“在浏览器中继续”。固定 native `openLoginInBrowser` 动作仅能用于本次有效内置事务，复用 native RAM 中同一授权 URL/PKCE。成功打开浏览器后释放内置窗口并标记实际 surface 为 browser，不生成第二笔授权、不撤销原事务。不持久化授权 URL，不向 renderer 返回它。
- 浏览器打开失败应报告有限安全错误，不能丢失原内置 owner 或自动重试。重复切换、取消/关闭/回跳竞态必须保持单次 owner，不得接受已结束的旧事务。
- `openLoginInBrowser` 操作当前 attempt 的展示状态，不等待被整笔授权持有的 lifecycle 锁；切换不重置原授权截止时间。程序关窗前先使本窗的取消回调失效；关闭回调同时绑定代际与窗口实例，不能只凭通用窗口 label 取消当前新事务。

## 原生窗口边界

- 桌面用独立原生 WebView 窗口，使用不匹配 `main`/`note-*` 的专用 label。远程页无应用 IPC/capability、无账户/文件/笔记接口、无正文或密码采集脚本。授权 URL 只由 native 生成并验证为固定 HTTPS 托管 origin。
- Android 使用独立原生 WebView 容器，不复用带本地 NotesKeyboard/应用桥接的主编辑器 WebView。实现方式由实际平台 API 调研确定；不得把 Custom Tabs 当作自有 WebView 验收。平台代码不新增未经授权的网络/存储/系统设置。
- 允许当前托管同源流程及精确本次回跳所需导航；禁止任意新窗口、非授权 scheme/host、下载、文件访问、证书忽略或通用 JS bridge。其他外部身份站点由用户显式选择浏览器继续。禁止记录授权导航地址或页面正文。
- 用户关闭内置窗、系统返回或点击取消必须终止本次事务并返回可用的本地账户页。成功回跳、转浏览器、取消、超时、打开失败和 App 正常退出都释放本次 owned 窗口/监听器；程序关闭与用户关闭区分，不能因清理误取消已交给浏览器或已完成的事务。迟到的创建/关闭/回跳回调不得影响下一代。
- 原生窗口创建和销毁遵循平台主线程规则，不能阻塞 Tauri event loop。保存/同步/quiet-cover/主窗 readiness 语义不变。
- Android 转入系统浏览器导致的 onPause 不等同用户取消。进程重建不恢复或重放 RAM 授权 URL。明确每端内置 WebView 的 cookie/data store 策略与是否支持临时上下文；不得将普通平台 cookie store 声称为临时隔离，也不以全局清 cookie 影响其他登录或浏览器会话。关闭本次窗口须清理其活跃句柄、导航与监听器。

## 验证与分工

Feynman 实施 native host/平台容器；Huygens 实施账户页、DTO/命令 allowlist 及 UI fixture；Cicero 独立审阅接口、origin/权限、owner/关闭/切换竞态；Socrates 准备与实现必要的两方式实际执行用例；Erdos 核包和实际证据。各作者不写对方文件，父级协调最终集成与共享 target。

需覆盖：两种方式的登录/注册选项和等待文案、严格 enum/无 endpoint 参数、旧调用兼容、内置关闭/取消、转浏览器只用同一事务、浏览器失败保留内置、取消/回跳/清理竞态、旧事务不得改变新事务，以及 normal local editing/body preservation。Native/JS/Android 平台检查按真实实现执行；无变化且已通过的旧矩阵不无故重跑。

先在干净源码和独审后构建精确候选，再以全新隔离库测试两种入口、内置页实际呈现、转浏览器和关闭/取消后的完整正文与自然重启。成功账户登录和三端中转仍须真实身份与网络证据；不以窗口打开或 authorizing 判登录成功。继续保全旧库和失败证据，只清理本轮已归档且复核的无用临时产物。
