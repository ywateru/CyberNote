# ACCOUNT109 原库重新登录与 GUI 续验

2026-11-13。前轮完成真实原生退出，原桌面 A 为 signedOut、B 保留授权。本轮父级已通过 CUA 成功读取原生窗口，桌面交互前提恢复；不能沿用此前锁屏作为本轮障碍。匿名中转实测不代替账户/三端验收。

## 候选与隔离

- 只使用已有合成测试库 `/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a` 和 `desktop-b`，不触及默认用户库，不复制或注入 grant。
- 使用来源 `39c1420d23daaa9397036d24826219e1bd2b89ff` 的既有 GUI debug/e2e 候选，启动前验证二进制 SHA。生产 account/auth/UI 与当前 main 的输入等价另经独立核对。不得宣称它是当前 main 新构建。
- 启动前只读复制 DB/WAL/SHM 并验证原件前后未变，读取完整现有笔记及附件引用、元数据、原字节基线；不读取账户凭据。结果写入全新目录，保留以往成功与失败。

## 执行契约

1. 两端启动并确认实际 WebView 交互、正常 Store/Session 和既有账户状态。若启动前提失败，停止后续授权/数据操作并有界清理。
2. A 经产品账户 UI handler 发起真实 SignIn，执行器只等待；父级在系统浏览器完成真实授权。执行器不接收密码、token、回跳、workspace 或邀请。核对原合成账号与绑定、全部原始内容保全。
3. 若登录后暂停，使用实际账户确认界面开启同步，核对完整说明、按钮有效后可由已有 debug/e2e `dom.click` 点击同一确认按钮，记录说明、动作与权威终态，不直接调用 native setEnabled 绕过确认；不宣称物理点击。若保留启用状态则记录权威状态，不制造首次确认。
4. B 退出期间新建且此前未到 A 的笔记应补齐；仅对本轮独立合成笔记执行双向小改，比较完整 document/plainText 和原字节，禁止重造已解决冲突或覆盖原历史笔记。两向暂停期间各自独立的本地新笔记应保全。
5. A 正常关闭并在同一目录重启，设置页保持关闭，核对原账户恢复、原内容/附件保留以及对端新修改自动补齐。
6. AUTH-06 GUI 退出取消/确认可作为显式独立场景：先取消确认并核对仍登录；再确认退出，核对原生终态与 UI 成功提示。它不替代另一账号登录同库的归属拒绝用例。
7. 所有步骤有界，失败保留阶段与原库，不自动重新授权或无限重启。由原生 shutdown 正常退出优先；强制清理按 owned PID 记录，不能隐藏。原操作与清理分别记账。

本轮是用户已授权测试的继续；若实际浏览器操作遇到必须由用户完成的安全关卡，停止对应动作并准确记录，不绕过。

## relogin02 失败后的有限续验

新候选固定为经审阅构建的精确来源/SHA；不得给旧 binary 赋予新诊断语义。失败的 token 校验可能由生产 cleanup 移除 grant 并保留原 binding。源码允许下次启动保持 clean signedOut，现有 B 启动等待不能将其误当成已恢复授权；这只是可能状态，不读取私有 grant 推定现场。

后续执行器可增加独立显式 `--allow-b-signed-out-relogin`，默认行为不变。保留完整 120 秒只读启动预算，仅该预算内持续为严格 clean signedOut（无 profile/error、enabled=false、无连接/冲突）的 B 才在 opt-in 下允许一次正常 UI SignIn；任何错误/中途 profile 变化继续原有严格判定，noSession/cleanup-required 不进入此分支，也不执行 SignOut。使用已归档 relogin02 的原 subject SHA256 `03efb3ceea182d57ea4a56fc7e9b0e5e3577192f6a4818d8a454d77cb1cffc8b` 作固定历史证据，不提供任意 subject/hash 输入，不向 native 注入身份。

授权期间任何 profile 的 subject 哈希均须匹配该历史值；健康终态同时要求原预期 QA username。身份通过前执行器不得发出 enable；生产 bind 对原 binding 的同 owner 校验及已持久 enabled 意图保持有效。仅全部身份检查通过后才走既有 UI enable 确认；失败不重试、不切换恢复路径。测试须覆盖首次 signedOut 后出现错误、混合/不洁状态、错误 owner、缺失历史证据以及 cleanup 失败，保持全文与原字节基线。
