# 普通 Mac 新建文件夹 Tab 循环37

2026-11-05，作者 SOURCE-READY STOP。唯一实施目录 `/private/tmp/apple-notes-ordinary-tab-loop37-01`，分支 `task/mac-ordinary-tab-loop37`。主线、用户数据、正式包、ADB、GUI 和系统键盘设置均未操作；只使用已安装依赖、隔离工作树与独立 target。

产品先提交，证据随后单独提交。最终源码为 `1a5422fbc089b354b91e3d6b1db64b5e6ec9a2a9`；它包含初次源码 `d3e467b2960075e2cb2749757de488c8cbd18ad1` 及单行旧策略兼容纠正。相对基线 `26648d88021adf3abdcfdfe879453a3b36866613`，共13个产品文件变化。精确补丁为 source.patch，逐文件大小/SHA 在 product-source.json。13项改变聚合 `db33ed6cdb17b7cc144a1d4681f286a622231f04e75fa0e78e9a7528e0d37b27`。沿36既有304产品目录加3个新文件，307项产品聚合 `5760f57413d117104dd2fdf3d07fffc0d41578b8d41e58a4a8c6dbefb68855f2`，详见 all-product-inputs.json。聚合按记录顺序拼接 `SHA256 + 两空格 + path + LF` 后取 SHA256。

## 实际变更

仅 native Mac main、非手机、非编辑、普通新建文件夹表单拥有局部控制器。表单同步 preventDefault 后，每次 Tab/ShiftTab 顺序查询固定 `plugin:notes-ui|keyboard_navigation`，没有 modal-open 值缓存、默认 false 或并发回复重排。false 仅回名称且 select，包含已经 focus 的名称；true 按当前表单 DOM 顺序在可用可见控件循环。Shift 自身只准备反向 Tab，不取消已经接受的队列；Option/Ctrl/Cmd、组字和已取消事件让行。点击、其它按键/输入、另行聚焦、可见性变化、失焦/pagehide、普通智能切换、busy、取消/卸载使旧回复失效。失败沿现有 role=alert 显示通用错误，保留草稿。

新 guest 命令传当前 windowLabel，Rust 命令先核对调用方 Window，再限定 main。回到真实主线程时，重新从当前 AppHandle 获取同 label 的 WebviewWindow 并核对 NSWindow 指针，随后调用生产 Objective-C 只读 getter。真实关闭通知弱记录 closed 对象，防止仍被保留的 NSWindow 在系统列表中继续被误当活窗。原生入口拒绝错误线程/对象/空输出/关闭窗口；不改系统/WK设置，不要求 toolbar bind。新权限进入插件 default 和生成 schema/reference。旧35的 NSEvent identity、Tab monitor 与 WK策略同步继续保持。

未改 CSS、像素尺寸、DOM节点、一般 Enter/Escape/输入/保存/取消流程、原生搜索或其它插件。protected-inputs-result.json 核对初始84项产品/锁/样式输入：10项原有允许文件改变，余74项保持 SHA，另3项为新增源文件；package.json、pnpm-lock.yaml、src-tauri/Cargo.lock、style.css、smart-folders.css 保持。完整307目录另与36输入核对。

## 有限验证

- 最终 component-attempt08/result.json：52项通过。实际生产 SmartFolderForm、完整 style.css/smart-folders.css、生产 native-keyboard、真实 guest invoke 函数全部使用；仅 Tauri transport、系统返回值和保存/取消回调受控。通过真实 headless Chromium 键盘事件验证 false Tab/ShiftTab/Right后Tab、true完整正反顺序/禁用隐藏跳过、每次真假变化、快速Tab/Tab/ShiftTab、单在途查询、新代队列、旧回复取消、失败与异常形状保草稿、修饰/组字/defaultPrevented、Mac浏览器预览/独立窗/Android/手机/智能/编辑表单/外部搜索及普通Enter保存和Escape取消。mode/busy/unmount/cancel为真实生产组件路径；beforeinput/composition/visibility/window事件为受控DOM事件，不能扩大为真实IME或OS前台验收。
- native-query-attempt03.log：13项通过。直接编译生产 keyboard.m，真实 NSApplication/离屏非key NSWindow/真实非持久 WKWebView。先与实际公开 getter 比较，观测当时 false；随后只在测试进程暂时替换 getter，受控 false/true 每次读取；不改系统设置。检查原生主线程、错误对象、空输出、真实close及迟到query、未写WKPreferences/未装策略monitor、始终不显示窗口。
- native-rust-run-attempt03.log/json：5项通过、exit0。真实 Builder<Wry>、两个 visible=false/focused=false 窗口、生产插件 init 与生产命令函数，不是 MockRuntime。仅空 Context/assets 使用 Tauri test helper。证明生产 Rust 命令经实际主线程/当前NSWindow身份到真实 getter；真实调用方传外label、真实独立窗、destroy后的旧Window均拒绝，后者 window_closed。直接调用生产命令函数，未执行 WebKit→IPC permission roundtrip；浏览器另一半明确为受控transport。没有以mock替代整个原生连接，也没有宣称单次完整IPC端到端已测。
- 旧35 native-policy35-regression-attempt02.log：27项通过。用封存35原始探针源码编译当前生产 keyboard.m，输出写本37目录；没有修改35证据。保留原有两窗/主线程/通知/事件身份/生命周期释放与重新attach契约。
- rust-test-attempt04.log：最终源码17项单测通过，含新命令外label和独立窗在原生dispatch之前拒绝。既有16项全部保留。
- typecheck-attempt04.log：exit0。Android插件 `--target aarch64-linux-android --locked --offline` check exit0，日志 android-check-attempt01.log（非Mac既有未使用成员警告5条保留）；最后单行纠正仅在Mac Objective-C，不进入Android编译。Mac原check及后续最终test均离线通过。

## 失败、纠正和执行边界

全部失败日志保留，见 failure-ledger.json。初次TS私有window类型缺少构造器，改为 Window & typeof globalThis。组件attempt01是测试脚本语法，02是esbuild导入路径，03是受限headless启动；后经自动审查授权同一离线测试运行。04/05揭示Shift按下在document和React form两个入口会取消rapid反向队列，分别纠正，06/07/08通过。06/07的报告意外把BODY脚本textContent写入焦点详情，08只缩短报告显示，产品未变。大报告与各次打包HTML仍原样留在本目录，local-artifacts.json给出大小/SHA。

原生query attempt01发现关闭NSWindow可能继续保留在NSApplication.windows，原假设失败；改成弱close记录+Rust当前窗口身份，后续13项通过。Rust-test02发现当前Tauri未提供 get_window，改用生产真实 get_webview_window 后通过。隐藏Rust验证的前两个builder选择依赖失败，以及首次rustc缺CARGO_PKG_NAME均为harness问题；最终使用现有cargo指纹精确匹配已编译锁定依赖，并保留编译参数与失败。受限环境的隐藏Wry首次运行系统服务连接失败，被显式终止；授权后有界25秒runner运行成功。未对用户应用发终止信号。

第一次旧35回归发现新closed拒绝不应扩张到已有策略attach：旧fixture合成WillClose后会将仍存活对象重新attach。最终额外产品commit只删attach中这一行拒绝，query的closed检查和当前Tauri身份检查完整保留；旧27项、新C13项、最终Rust17项和隐藏Wry5项再次通过。

## 仍开放的验收

没有运行正式Mac新包、Computer Use真实键盘/焦点、系统开关切换、真实IME、真实原生搜索回归或像素重拍。true顺序是局部可访问性契约；原版系统开启态完整顺序尚未观测。原版OptionTab插入字面TAB仍是另项，37明确让行，不宣称一致。实际runtime差异必须在不同作者独审后，用准确来源新包与原版比较才能关闭。Android08仍是旧182464b源的包，不能追认含37。

生成二进制、每次1.47MB HTML、两份包含重复BODY脚本的大结果保留于作者工作树而不写入Git；精确本地清单为 local-artifacts.json。其余证据都由 evidence-index.json 逐项封存。源码/证据均准备交独立审查，作者停止实施和打包。
