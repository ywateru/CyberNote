# 52 首次固定源码独立审查：BLOCKED

固定产品提交 `ef2fe7c3a3de7f8b7644d3ed50e0232a445b5af8`，基线 `a6282ae3a93b1fccfe1bda63b02d752595d1fad7`。独立工作树 `/private/tmp/apple-notes-mac-recording-access52-independent-01`，独占Rust target `/private/tmp/apple-notes-recording-access52-independent-target`。作者harness只从固定证据提交 `941e3c99f679870faf58aeb0d17764709d896d06` 提取；未跟随作者可变目录。未更改产品代码。

## 阻塞1：媒体流成功与取消之间的微任务交接丢失资源

`src/recording-session.ts` 的capture.then回调在accepting=true时跳过清理并返回流，prepare的下一回调尚未接管流。如果已排队的dispose先于prepare回调运行，取消把prepare置为settled，后到的流被忽略，this.tracks仍为空，所有音轨继续存在。

原样复现：发起session.start；resolveMedia(stream)；queueMicrotask(()=>session.dispose())；await start。`check-handoff.mjs` 得到stopped=0、recorded=0、errors=0、createRecorder=0，断言失败，原始输出 `session-handoff.log`。补充 `check-microtask-cuts.mjs` 扫描无authorize/已授权各7个取消位置：两组cut1的三轨均stop=0，其余12例通过，输出 `session-microtask-cuts.log`。这证明成功流在promise交接前必须建立资源所有权，取消与迟到结果均须用同一所有权清理，不能只依赖首个then的accepting检查。

## 阻塞2：ObjC异常展开没有ARC清理，授权owner/context泄漏

生产build.rs使用 `-fobjc-arc`，未启用 `-fobjc-arc-exceptions`。独立 `check-native-supplement.m` 在OS边界保存completion后抛NSException：生产start捕获异常给code6，晚completion不再回包，但所有者作用域结束后releaseContext仍为0，断言失败（`native-supplement.log`）。同一源码/harness/命令仅增加 `-fobjc-arc-exceptions` 后4例全部通过（`native-supplement-exceptions.log`）。start的try块中强owner/block在异常展开时未自动释放；需要让该编译单元具备异常ARC清理或用等价明确的所有权处理。

补充harness还验证NULL原生参数释放上下文、超时后重复completion只回包一次、窗口无效不进入OS请求。这些均为受控边界；不代表NSWindow实机生命周期或系统授权已验收。

## 其余有限检查

- 固定作者harness在独立树重跑：Session11、生产preflight8、ObjC owner/status14均PASS。
- 原Session回归26 PASS；插件Rust20 PASS；TypeScript PASS；Mac宿主locked/offline cargo check PASS，4项既有dead-code警告。
- 生产ObjC公开API按原flags编译PASS。
- 无依赖下载、真实权限请求、麦克风采集、GUI/TCC/用户数据访问。

源码核对：注入Window先匹配guest label，再限制main/既有note-*或精确canonical lowercase recording UUID；recording capability只授予麦克风命令。Rust发起前比较调用窗口和当前窗口NSWindow，以及with_webview的实际NSWindow；ObjC使用弱实际window/view、NSApp成员身份、WillClose观察；成功后Rust再次比较注入Window物理身份。此处为源码审查，未用真实GUI覆盖身份替换。

截止为native30秒、Rust初始35秒和身份复核35秒、Session每准备阶段45秒。桥总等待最多两阶段70秒，Session授权45秒后拒绝迟到授权，迟到主队列初始dispatch由live门禁阻止新请求。系统请求无法撤回，至实际回调前单一pending保留owner/context以避免UAF，不能把UI截止当作撤销系统提示。没有发现除上述两个资源问题之外的新阻塞。

全部13产品文件测试后仍等于固定提交；身份见source-inputs.json。首轮失败保留，后续修复复验须另存新结果。
