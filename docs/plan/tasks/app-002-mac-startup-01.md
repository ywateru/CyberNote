---
id: app-002-mac-startup-01
scope: bundled-mac-entry-navigation-and-permission-boundary
status: implemented
depends-on: []
---

## objective

修复11/4统一Mac sealed候选首次启动实际未加载本地入口的问题。包`/private/tmp/notes-f07-audio-mac-candidate01-sealed.app`，exe11dcbfc4…，strict签名检查通过、PID18813真实路径核同。CUA窗口白色，REA实际WKWebView URL=null/loading=false/title为空；同工具原版Notes可正常显示。进程日志初次navigation26被policyAction Ignore，requestURLIsValid=0/navigationPolicyDecision=1。未到React挂载，不能当作F07交互失败或通过。

证据在`../../verification/f07-audio-integration/mac-developer01/`，包括实际日志/AX/读取探针与工具限制。原始首次request URL在系统日志为private，当前WK URL已经null，不虚报已采到该URL。已读锁定Tauri2.12.5源码：App(index.html)保留base URL，生产origin为tauri://localhost无尾slash；现EntryBoundary只收path '/'或'/index.html'，非special scheme空path可能被拒绝。这是待验证强源码假说，不直接冒充运行时精确归因。

## context

`docs/architecture.md`权限与原生宿主契约；`app-002-permission-01.md`及其独立静态报告；`src-tauri/src/media_permission.rs`实际生命周期/资源表/EntryBoundary；锁定tauri manager的URL创建代码。现Android3edc4ad0已实际运行，不能为修Mac重新引入权限回调同步WebView URL查询造成Android崩溃。

## path

仅`src-tauri/src/media_permission.rs`及必要生产初始化接线/真实定向检查，确需时`src-tauri/src/lib.rs`；相关任务文档和证据。不要改App/bridge/Editor/CSS/附件操作/Store/依赖、CSP放宽或原生顶部几何。基线须含现主Store模块与F07+Audio源码，隔离分支；不在attachment-submit混修。

## contract

1. 锁定框架实际生成的Mac生产本地入口必须允许加载；严格限定产品scheme/host/credentials/port及真正入口路径。若根因是同一权威空路径表示，应只接受其等价入口，不能以允许任意tauri路径/localhost端口/about:blank/file/data/blob或远程页面解决白屏。
2. 导航目标允许不等于媒体许可。原有真实WebView实例资源归属、默认拒绝、Started/Finished确认、失效/销毁/tombstone/争锁失败保守拒绝和未知PermissionKind拒绝保持。不可使用label级共享信任、直接默认Allow、同步webview.url/UI往返或假完成事件。
3. 先核已编译平台分支与锁定框架URL形态，定向检查穿过实际生产策略；真实mac启动验证依确切新包身份。必要一次受控诊断可记录初始本地导航URL/策略结果，不采私人正文/查询、不新增默认生产调试命令或绕过开关。没有运行时原URL时准确区分源码推断与实证。
4. Android http workaround与devUrl1420的现有边界保持；不能因Mac根入口修复给其他来源授信。保留旧白窗/Ignore证据，修复后不改写旧包结果。

## verification

隔离候选运行必要media_permission定向真实Rust检查与编译，包含锁定框架生成的无尾slash本地入口、显式根/index.html、非入口路径/错误authority和原拒绝生命周期。先冻结源码及独立审查，再统一Mac新包；保存构建输入/包hash/本地签名核验。实际正常启动应加载本地页面、显示三栏和原生工具栏、可读合成note，然后再做F07 unique→zero→clear。需要时有限Android启动smoke，原权限首次流程不重置重跑。源码/导航/媒体许可/React/F07与像素分别记账，不用一个启动通过覆盖其他功能。

## source candidate01（待独立审查）

2026-11-04：仅EntryBoundary的CustomProtocol补充锁定框架根入口空path。新增真实macOS编译分支回归在旧predicate先失败（parser path为空断言通过，allows断言失败），最小修复后media_permission实际12组通过，rustfmt与diff检查通过。框架origin/manager源码精确行及文件hash、基线失败和候选日志见`../../verification/app-002-mac-startup/`。没有重打包/重启/设备动作，不宣称原private request URL已捕获或Mac UI启动/F07通过。
