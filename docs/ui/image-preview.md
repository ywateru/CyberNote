# 图片预览与桌面标题栏80

2026-11-06，用户要求：双击顶部标题栏放大/还原窗口；修复点击图片后的放大预览被顶部工具栏遮挡、文字按钮叠加；图片信息、保存/导出放在预览内，正文图片外面不显示保存按钮。用户截图保全在docs/research/image-preview80/user-overlap.png，截图内文字仅是图片内容。

## 结构

```text
桌面主窗口：顶部空白标题/拖动区域 双击→放大/还原（保持单击拖动）
正文图片：只有图片预览入口，不显示保存按钮/外部保存状态
图片预览：同窗口全局独立呈现层，脱离正文排版和滚动容器
┌─────────────────────────────────────────────────────┐
│ 原生窗口控制/拖动保留区域（主编辑工具不遮挡预览）       │
├─────────────────────────────────────────────────────┤
│ 图片名（省略/换行）       信息    保存/导出原图    关闭 │
├─────────────────────────────────────────────────────┤
│                     等比图片                        │
│                                可展开图片信息        │
│                                文件名、格式、大小    │
│                                宽×高、可用真实时间   │
│ 保存进度/成功/错误（均在预览内，可重试）                │
└─────────────────────────────────────────────────────┘
```

不新增外部系统应用/浮动窗口。预览层不能依赖编辑器祖先的transform/overflow/stacking context，也不能被原生NSView工具栏覆盖；选择隐藏/切换原生主工具栏或明确预留原生chrome区域时须有真实native链验证。关闭后恢复主工具栏及原焦点/选区，不能写正文或新增Undo项。原生交通灯/窗口拖动仍可用。

## 交互与信息

点击或键盘激活正文图片打开预览；可查看图片信息并保存/导出原图，关闭按钮和Escape关闭，Tab焦点保持在预览操作内并可见。长文件名、320/390手机、800宽桌面、浅深主题均无控件相交/不可达/水平溢出；大图按可用区域等比contain，图片不盖住工具栏/信息。

信息必须来自本次受权媒体/元数据：文件名、MIME/格式、原文件字节、图片naturalWidth/naturalHeight；创建或修改时间仅有真实来源时展示，无数据不伪造时间或EXIF。沿用受权readAttachment及saveAttachmentOriginal的原字节/owner/token/重复点击去重/取消/缺失/错误路径，不另造无鉴权导出路径。信息加载失败要如实显示，保存不重新编码。

预览打开期间，切换笔记、删除当前附件、prepare/锁定/撤权/强同步/陌生authority、源dispose及组件卸载必须同步关闭或隐藏受保护预览并清理全局呈现/原生状态，不能因portal脱离access-sync而泄漏旧图/标题/信息或迟到重新出现。普通同authority quiet附件行为仍保留79无整窗闪烁。

标题栏双击仅适用于桌面拖动背景/标题区域，原生toolbar分组空白也应处理；按钮、搜索输入、菜单、文本选择、图片正文双击均不触发窗口缩放。nativeRoot.mouseDown保留单击performWindowDrag，双击走AppKit窗口zoom/还原；Web fallback各顶部拖动区共用行为，native=false预览不得真实调用Tauri。禁止把双击改为全屏切换。

## 验证边界

程序化调试覆盖真实DOM图片打开/关闭/信息/保存/取消/错误/重复/撤权与选区历史，增加本轮布局断言和快照；更新79用例到预览内入口，不删除原断言。native标题栏/工具栏状态及双击通过真实AppKit隔离harness或同源实包验证，不用browser fixture冒充原生运行。系统应用/真实麦克风/原Android约13秒现场完全不操作，原版完整像素结论继续单列。

## 共用原生层状态（用户后续数据管理81）

ToolbarState新增可选`contentOverlay:boolean`，serde缺省false以兼容旧调用；guest/App→Rust model/macOS→ObjC链同名传输。App计算图片预览或数据管理打开时为true，原生布局隐藏主编辑工具分组、标题和搜索，仅保留交通灯与52pt可拖动根区域，DOM预览/管理都从原生保留区以下排版。关闭或受权清理后恢复既有布局，迟到旧revision不能复显。不能仅提高DOM z-index。数据管理组件不负责native IPC，由App统一拥有此状态。

## 原生工具栏异步同步补充

普通native update仍在途时打开contentOverlay，若旧update随后因search_composition/stale_search拒绝，不得让较新的overlay desired永远停在队列；只对确有更新的desired继续处理，不重试同一失败请求造成自旋。关闭overlay也应恢复工具组，不能被此前搜索阻塞标志永久挡住。

若为保留输入法未完成输入而保留旧revision搜索事件，必须提供明确`searchScope`：App根据导航、当前笔记、authority stamp、编辑器身份和正文版本生成，排除overlay状态与query值。同scope且确有overlay转换时才允许有限旧搜索provenance；普通无overlay更新/跨导航/正文/authority改变不能接受旧值或触发旧intent。scope改变、invalidate/stop/release清历史；已知旧scope序号最多仅确认transport，不能采用其query。历史数量有界；旧revision普通action继续拒绝。需要deferred更新及restore、旧action、scope变化和invalidate-inflight反例。

## 设置合并82

[统一设置与数据82](preferences.md)沿用contentOverlay状态，settings与data两标签均打开时为true，切换标签不恢复底层原生编辑工具。此状态仍不进nativeScope/searchScope，关闭整个设置界面再恢复；图片预览自身契约保持。
