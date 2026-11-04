---
id: app-001-sidebar-visible-geometry05-independent
scope: mac-visible-sidebar-toolbar-placement-and-background
status: source-ready
---

## 结论

**SOURCE-READY**，仅接受 `plugins/tauri-plugin-notes-ui/macos/toolbar.m` SHA256 `0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5`。没有发现阻止该固定源码进入准确Mac构建的缺陷。没有新Mac包或真实窗口验收，不授予像素PASS。

独立证据在 `docs/verification/app-001-sidebar-visible-geometry-independent05/`。复核时HEAD为 `eb3ece055fd769ecb16f0f6a2dc2ae9ae775ae35`；baseline toolbar SHA256 `0deb20826e37511f0654c1c355901ffe10877416fcf98fa8dd32c2cc88c90588`，与作者baseline逐字相同。App SHA256 `6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4`，CSS SHA256 `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7` 保持。

## 源码评估

实际patch只改变授权toolbar文件：sidebar单独有稳定透明NotesUIRoot宿主，背景与稳定content为同级前后层。可见时仅隐藏背景；按钮仍在content内，未重建控件。makeGroup其余组走旧路径。sidebarBackground始终在build中建立，apply把它纳入macOS26 glassStyle更新；旧系统fallback原有material/blending/state/radius保留。placeGroup仍按width/actions.count等分，新增sidebar背景显式frame同步，覆盖作者真实宿主发现的autoresizing不足。

可见44pt/item，组右边界为sidebarWidth，起点不小于fullSize94或普通12pt；两项放不下时仅newFolder进入overflow，toggle保留。隐藏仍36pt和旧x/标题避让；独立窗不放侧栏组。toggleSidebar的contentTintColor使用动态NSColor.labelColor，selected状态仍保留；其他按钮selected tint不变。动作/标签/菜单启用/路由、绑定revision、搜索对象及field-editor代码没有改动，无IPC/状态副本/DB字段扩张。

## 独立执行与身份

自有目录冻结57份初始输入及额外model.rs，共58份；既有插件guest imports已经包含。开始/关闭核对每份冻结/共享大小和SHA相同，关闭移除依赖symlink。作者检查设施只改R指向自有fixture，生产源码和算法不改。独立重新编译并运行，不接受作者生成二进制作为自己的运行结果。

- 准确生产widthFor/layout+recording placeGroup端口：390状态、120连续链通过。三种主布局×700/1088/1394×160/208/228/273×fullSize有无×显示/隐藏/恢复；另含181.999/182溢出边界、独立窗和6条连续宽度变化链。138个可见态与旧源不同被直接复现。请求尺寸下其他组、标题/计数/overflow/search字段与旧源相同，隐藏态逐字段相同，恢复回到首次可见输出。
- 完整生产toolbar+format.m、真AppKit控件、fake NSObject window：baseline / candidate NSGlassEffectView / candidate强制NSVisualEffectView三套各390状态、120链通过。检查保留按钮/content/group/root/title/count/search/background身份、兄弟层级、背景尺寸和隐藏、regular→clear→regular、真实按钮AX label/enable/target/selector、toggle labelColor对象。新glass和fallback每套588个可见按钮中心root/local命中均到保留按钮。未派发真实鼠标事件。
- 独立audit另检查所有输出长度/顺序/字段，完整生成源确实嵌入固定产品，真实背景class分别NSGlassEffectView/NSVisualEffectView，避免zip截短或测试替身冒充完整生产。
- 严格ObjC语法ARC/blocks/min12/Wall/Wextra/Werror通过；既有native-toolbar受控transport13项通过；隔离pnpm build通过，保留现有大chunk提示。未执行平台build。
- 作者112非manifest文件大小/SHA/完整集合通过，作者manifest SHA `f31514eaada49102711113e817995ff91e7321aeb9fb9029c4deec92e604567e`，aggregate `5827841625f3780b8c9614dc2b408bb7d688f45490c81ecfb1e9abd2c1cfe451`，按作者sorted SHA+双空格+path+换行公式独立重算一致。

原始非产品失败保留：初次猜测apps/notes路径不存在，实际src路径随后冻结；初始controller fixture漏model.rs导致ENOENT，native-toolbar-run01保留、补原文件后run02通过；独立manifest核验先误用自身tab公式，audit-failed01保留，确认作者实际sha+path公式后通过。作者geometry/AppKit失败亦在其封口manifest中保持，未覆盖历史日志。

## 风险与准确范围

这是真控件无窗口检查：NSApplication会被隐式初始化，NSApp.windows始终0，未创建NSWindow。AX仅真实按钮label，不是系统AX树/屏幕frame；routing仅enabled/target/selector，不是真实点击/菜单。搜索currentEditor始终nil，不能证明真实field editor、选区、IME或焦点。appearance有Aqua/DarkAqua切换，tint只证明labelColor动态对象，未测实际渲染RGB。fallback仅Class resolver强制旧分支，不代表旧系统运行。

threeColumn/700/sidebar273的visible/restored×fullSize有无，共4态有既有6pt标题/view重叠；old/new同字段，独审复算一致，范围外保留。sidebar自身不重叠标题/返回/其他组，不能表述整条toolbar零重叠。隐藏组frame与旧源相同，但透明host+分离背景的实际玻璃合成仍待准确新包GUI确认。

原版208/228侧栏墨迹证据支持右锚和移除共同玻璃；44pt槽仍是候选，未从原版内部frame直接测出。参考JPEG与全窗内容差异不足以授予像素通过。后续由root固定完整准确HEAD并出新Mac包，核产物身份后实际检查可见/隐藏/直接恢复/菜单恢复/拖窄/正常退出重启及原版对照。本轮无GUI、ADB、平台构建、产品修改、stage或commit。
