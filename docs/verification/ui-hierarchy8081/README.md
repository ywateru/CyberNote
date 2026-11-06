# 图片预览、标题栏与数据管理层次80/81

2026-11-06。最终产品源码 `ad3a069f`，组合合入 `44ea616b`；产品与调试输入指纹 `0818145c2f31dc49b58cba93ba30711747e82c405cdb6bc0923b14bc92457ab9`。独审已 SOURCE-READY，主线回归和构建记录随后补全。本轮不操作原 Android 未保存录音现场。

## 用户可见的结果

数据管理默认展示本地数据总占用、按实际容量比例绘制的彩色条及分类列表。图片、录音、视频、其他附件、数据库、辅助日志、其他文件与目录均可点击进入同面板详情；详情支持原有文件信息、真实修改时间、搜索、分页和可用附件导出，返回总览保留快照。导入/导出完整备份保留，首次统计失败或仍在加载时也能进入备份恢复流程。数据位置与采样信息放在可展开区域，不在总览堆叠长路径。

占用使用真实文件长度而不是申报大小，按唯一相对路径的首个 filesystem 行计一次；重复登记行仍可在详情查看。未知/缺失不冒充零，不进容量比例。总量不一致时停止绘制误导比例并提示刷新。后两张用户参考图仅提供外观与层次，不扩充云或清理功能。

图片预览移出编辑器布局到 App 直接子层；文件名、图片信息、原图保存/导出和关闭操作在预览内，正文外部保存按钮移除。信息来自授权媒体的文件名、MIME、实际字节与 natural 尺寸，没有伪造 EXIF 或时间。保存沿用79原字节/owner/授权链。保存成功、取消、失败后即使焦点落 BODY，Escape 仍可关闭，Tab 可返回预览；隐藏、源失效及卸载后移除键盘消费与敏感内容。

原生工具栏原来通过 NSWindowAbove 盖在 WKWebView 上方，DOM z-index 无法越过。新增 contentOverlay 经 App→guest→Rust→ObjC 传递，图片或管理打开时主编辑工具与搜索退让，仅保留52pt窗口控制/拖动区，关闭后恢复。普通更新在途遇搜索拒绝时仍处理新 overlay；旧搜索只有同有效 searchScope 且经过 overlay 转换才可保留，导航/正文/授权变化后不能恢复旧值。

原生标题栏双击通过 AppKit zoom 放大/还原；Web fallback 使用当前 Tauri 2.12.5 官方 drag-region 事件链，避免 React 重复处理导致放大后立即还原。按钮、搜索和正文不触发双击缩放。

## 验证记录

[独立复核](../../plan/reviews/app-ui-hierarchy8081.md)与[独立原始证据](../ui-hierarchy8081-independent/)分别记录源码、程序化 DOM、真实 AppKit 与 Rust 模型的结论。中间失败与修复前现场保留，不追认为通过。[作者组合记录](../ui-hierarchy8081-author/README.md)、[键盘修复](../ui-hierarchy8081-keyboard-fix/README.md)与[81统计/布局记录](../storage-overview81/README.md)可追溯。

主线六项、准确 Mac25/Android15 构建、签名与独立核包待记录。

## 验收边界

浏览器使用真实 React/Tiptap/DOM、合成媒体与显式协议 fixture；手机 viewport 不是已安装 Android WebView。AppKit harness 直接链接生产 Objective-C，创建隔离 NSWindow，真实测试 zoom/还原、hitTest、markedText 和工具栏隐藏/恢复，单击拖动覆写为计数。Rust 精准测试覆盖新 overlay 字段缺省及严格序列化。核包只证明构建输入、实际内嵌资源与本地签名/归档完整性。

未运行原版备忘录或用户现有克隆应用，未使用真实麦克风，未触原 Android 设备。真实 OS 选择器/provider、实包多窗运行以及 Apple Notes 整窗像素继续单独验收，不由以上结果替代。
