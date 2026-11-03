# APP002：锁定权限回调与来源边界，只读研究

2026-11-03，native研究。依照`docs/plan/tasks/app-002-permission-01.md`，仅核公开接口、锁定源码和官方主来源，没有改生产代码/依赖、构建、GUI或设备操作。develop另行完成旧5dd6无observer复现；本报告不冒充运行复验，也不替代候选独立审查。

结论：**Tauri2.12.5/Wry0.57.1的公开permission回调没有request-origin或frame标识，不能从回调参数直接验证请求frame来源。同步`webview.url()`查询的10秒等待与GetUrl发送panic路径在锁定代码中成立。无需同步查询的主页面信任状态可从公开导航/页面加载payload建立，但必须与拒绝外部导航、frame/object加载限制配套，不能单独把缓存主页面URL当request-origin。**

## 锁定代码证据

本机registry根为`/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/`；完整文件SHA见`source-inventory.json`，以下行号对应该锁定副本。

| 证据位置 | 确认内容 |
| --- | --- |
| 项目`src-tauri/Cargo.lock`3359/4584/3595 | tauri2.12.5、wry0.57.1、tauri-utils2.10.2 |
| `tauri-2.12.5/src/app.rs`1848–1855、1890–1899 | 全局`Builder::on_page_load`接受`Fn(&Webview,&PageLoadPayload)`；`on_permission_request`接受`Fn(Webview,PermissionKind)->PermissionResponse`，均公开 |
| `tauri-2.12.5/src/webview/mod.rs`109–126、535、695、749 | PageLoadPayload提供借用URL和Started/Finished；WebviewBuilder有on_navigation、on_page_load、on_permission_request |
| `tauri-2.12.5/src/webview/webview_window.rs`266、421、475 | WebviewWindowBuilder对应三个创建时hook；现有Webview没有公开的运行时导航handler setter |
| `tauri-2.12.5/src/plugin.rs`459、483 | plugin::Builder有全局on_navigation和on_page_load公开hook；仅列可用性，不建议本批增设插件 |
| `tauri-2.12.5/src/manager/webview.rs`291–337、601–629 | 运行时将page URL/event直接送全局/插件/局部hook；permission只传kind；导航builder先执行，返回false即取消，再执行plugin导航hook |
| `wry-0.57.1/src/lib.rs`831、1344 | Wry permission handler仅`Fn(PermissionKind)->PermissionResponse`，没有origin/frame |
| `wry-0.57.1/src/android/kotlin/RustWebChromeClient.kt`60–103、121 | 遍历资源，同步调用`onPermissionRequestNative(webViewId,resource)`；不传request.origin；之后走现有Android运行时requestPermissions及request.grant/deny |
| `wry-0.57.1/src/android/binding.rs`499–532 | JNI直接调用已登记handler；只把resource映射PermissionKind；没有异步调度或origin恢复 |
| `wry-0.57.1/src/android/mod.rs`37、345–348 | URL查询发送GetUrl并同步recv_timeout，超时10秒 |
| `wry-0.57.1/src/android/main_pipe.rs`405–420 | GetUrl分支读Java getUrl，然后`tx.send(url).unwrap()`；接收方已丢弃会panic |

Android原生`PermissionRequest.getOrigin()`从API21即公开，实际返回试图请求资源的页面origin；grant/deny要求UI线程。origin信息在本版本Wry桥已经丢弃，不能给Tauri回调臆造`.origin()`、request参数或mainFrame字段。[Android PermissionRequest](https://developer.android.com/reference/android/webkit/PermissionRequest)

## 线程与崩溃链的确切范围

锁定Kotlin→JNI→Wry handler→Tauri handler是同步调用，中间没有worker转发。因此应用permission closure在平台permission callback的线程内执行。Wry Android URL查询另发MainPipe并等待接收；对本次UI权限回调而言，同线程再等该UI管道就是阻塞链。10秒后recv_timeout退出，receiver丢弃；UI继续处理GetUrl时，发送unwrap失败。这与develop记录的两次相隔10秒GetUrl SendError/SIGABRT一致，是源码加真实日志支持的因果解释；本研究没有自己运行栈采集。

不要把Rust闭包的Send/Sync约束当作“回调在后台线程”的承诺。页面加载/导航桥也没有调到worker；其中应只做有限状态更新/判定，不能同步再查同WebView的URL或等待UI任务。各平台/事件不提供统一线程承诺，本报告不把Android链推广为Mac同一崩溃结论。[Android PermissionRequest线程要求](https://developer.android.com/reference/android/webkit/PermissionRequest)

## 无同步UI查询的可用边界

1. 在创建Webview/实例时建立默认拒绝的可信状态；按真实实例生命周期绑定，缺失、销毁或label复用不能继承旧trusted。permission closure只读该状态并严格允许Camera/Microphone，其余一律Deny，不用Default托底。
2. 导航hook收到的URL是导航目标，不是已提交主页面。先撤销trusted，非本地白名单直接返回false。允许导航也不能立即设trusted；Android桥没有传isForMainFrame，subframe导航也可能进入此hook。
3. 页面加载Started立即撤销；Finished仅在payload.url严格匹配预期产品入口时恢复。直接读取`payload.url()`，不是`webview.url()`。未知URL、错误scheme/port、用户名密码或伪装host均拒绝。若采用代次/待加载URL匹配，晚到旧Finished不能重新开放新导航中的权限。
4. 框架公开page回调在Android来自`RustWebViewClient.onPageStarted/onPageFinished`，只反映main frame，不能证明所有子frame可信；hash变化没有Started。onPageFinished也不是视觉内容已提交的保证。[Android WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient)
5. on_navigation底层是shouldOverrideUrlLoading，不能声称覆盖所有导航：不处理app主动loadUrl，POST不触发，可能处理subframe。必须审计所有应用主动navigate/loadUrl路径，并以CSP form-action限制表单外部导航；不能让该hook赋予“主frame已提交”状态。[Android shouldOverrideUrlLoading](https://developer.android.com/reference/android/webkit/WebViewClient#shouldOverrideUrlLoading(android.webkit.WebView,%20android.webkit.WebResourceRequest))

产品入口应从实际包记录核对，不复制旧host-only逻辑。锁定框架`manager/mod.rs:335–355`使用tauri自定义协议/Android http(s) workaround；config `use_https_scheme`默认false（utils/config.rs:2452），当前devUrl为`http://localhost:1420`。发布版不能允许任意localhost端口、任意http(s) tauri.localhost或所有tauri scheme。移动开发代理可能转换实际URL，需单独准确登记；不能据前端字符串声明信任。

## 子frame来源缺失如何处理

目前配置只有`default-src 'self'`，它允许同源frame/object，不等于禁止嵌入。选择本地应用不需要嵌入frame的边界，可明确使用`frame-src 'none'; child-src 'none'; object-src 'none'`，配合`form-action 'self'`或更严格none。frame-src管子导航，object-src管object/embed；child-src作为旧策略兼容边界，不能替换明确frame-src。frame-ancestors管谁能嵌入本应用，不管本应用能加载什么，不能替代frame-src。[CSP3 frame-src / object-src / default-src](https://www.w3.org/TR/CSP3/)

srcdoc/about:blank/blob/data等本地派生文档仍需单列，不能仅凭“未网络加载”算不存在frame。CSP会向派生本地文档继承策略，严格script-src也继续约束其脚本；应确认应用没有frame生产路径、编辑器/导入schema不接受iframe/object/embed，实际旧WebView受控验证加载与媒体请求均被拒绝。该结论以可信本地程序与HTML输入边界为前提；若日后产品必须执行不可信同源文档或跨源frame，现有kind-only回调无法提供逐frame origin鉴别，不能靠主页面缓存假装完成。[CSP3本地文档继承](https://www.w3.org/TR/CSP3/#security-inherit-csp)

锁定Tauri另有公开`app.security.headers`，`HeaderConfig.permissions_policy`序列化名为`Permissions-Policy`（utils/config.rs:2979），protocol/tauri.rs:168确实注入正常Tauri响应。因此可以公开配置`camera=(self), microphone=(self)`作为跨源委派的附加限制；这不是请求origin回传，也不证明旧WebView91已经执行。开发代理/其他协议/错误响应不自动拥有同样头，运行时需核有效响应。[Permissions Policy](https://www.w3.org/TR/permissions-policy/)

本轮只做源码搜索，`src/`与主Rust路径未发现生产iframe/object/embed或主动navigate/loadUrl文本；这不是完整HTML/schema安全审计。系统文件选择器、系统分享和插件外部文件打开不是WebView子frame导航，frame/object CSP不应因此直接阻止这些原生流程，但对应现有路径仍须有限实际回归。未实现新插件、未升级依赖。

## 交付限制

所有候选必须由develop实现、verify独立静态审查，再按root冻结的新包复验。首次拒绝/允许、无附件副作用、进程保持、静音录制与冷启、受控不可信页面/子frame拒绝均未由本研究运行；旧WebView91对有效CSP/Permissions-Policy执行仍unknown。宿主麦克风OFF与有效音轨unknown边界保持。
