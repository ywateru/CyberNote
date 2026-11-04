# 可见侧栏工具组校准05：独立复核证据

结论：SOURCE-READY，仅限 toolbar SHA256 `0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5`。不是新 Mac 包、真实窗口或像素验收。

`fixture/` 冻结57份初始输入，`supplement-inputs.json`补齐控制器检查会读取的model.rs，共58份；开始/关闭逐份核对共享源与冻结副本相同。baseline是HEAD eb3ece0的toolbar，SHA0deb20826e37511f0654c1c355901ffe10877416fcf98fa8dd32c2cc88c90588。App与CSS分别6eff8e…/d7facf…未改。

自有目录重新运行复制的作者check-geometry.py/check-appkit.py，只把R改为本目录fixture；未修改生产方法、作者原证据或产品。geometry03为准确生产widthFor/layout+recording placeGroup端口；appkit07为完整源+format.m、真NSView/控件+fake NSObject window，三套旧/新glass/新强制fallback。audit-derived.py另核390数量/顺序/所有字段、确切源码嵌入、真实背景class、588次候选按钮中心命中及4态既有重叠，并验证作者112文件集合和manifest。作者aggregate为sorted sha TWO_SPACES path NEWLINE；本目录manifest明确使用path TAB bytes TAB sha NEWLINE。

- geometry03/result.json：390状态、120连续链；138态可见旧偏差被复现。
- appkit07/result.json：三套各390态、120链；严格编译完整生产源，背景身份/尺寸/隐藏/玻璃style、按钮身份/AX label/enabled/target/selector、labelColor对象、中心hit均在真实AppKit控件上断言。
- strict-objc.json：严格ObjC语法通过。
- native-toolbar-run02.json：既有13项控制器受控transport检查通过。
- build.json：隔离pnpm build通过，保留现有chunk大小提示。
- author-manifest-audit.json：作者112文件大小/hash/完整集合通过，固定manifest f31514…及aggregate582784…。
- identity-close.json：58输入冻结/共享均相同，依赖symlink已移除；无产品修改、GUI/ADB/平台build/stage/commit。

原始非产品失败：首次猜测apps/notes路径不存在，正确src路径随后固定；native-toolbar-run01.json记录初始fixture遗漏model.rs的ENOENT，补齐原文件后run02通过；audit-failed01.json记录先误用本目录aggregate公式核作者aggregate而失败，逐文件此前已通过，按作者实际sha+path公式复核通过。所有原始记录保留，不改写为pass。

边界：0真实NSWindow；控件初始化隐式创建NSApplication。无field editor、IME、焦点、真实菜单弹出、用户事件、实际系统AX树或像素验收。AX只断言真实按钮label；routing只断言enabled/target/selector，未派发真实鼠标点击。labelColor是动态对象相等断言，appearance有切换，但未测绘制后RGB。fallback只强制原生产class分支，不代表旧macOS实际运行。隐藏态geometry与旧源一致，但新透明宿主/背景分离的真实玻璃合成须新包GUI确认。

范围外限制：threeColumn/700/sidebar273，visible/restored×fullSize有无共4态，标题与view重叠6pt，baseline相同；sidebar自身与title/back/其他组无重叠。原版44pt内部槽宽未直接测到，right-anchor/44pt是待新包视觉校准候选。原版参考是JPEG且内容差异，不能授予整窗像素PASS。
