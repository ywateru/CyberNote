# ScreenCaptureKit 原生比例 PNG：API核对

2026-11-04，仅官方资料与本机声明静态核查；未运行窗口枚举/截图/权限检查。工具及使用合同见 `scripts/window-capture.md`，源码/编译证据见 `docs/verification/tools-lossless-window-capture-01/source-candidate-01/`。

官方资料：Apple WWDC23《What's new in ScreenCaptureKit》说明desktop-independent window filter和SCScreenshotManager的图片/样本返回路径；文档页面对filter和configuration的正式入口如下。Apple API页面在当前研究工具只返回需JavaScript的外壳，因此精确属性与可用版本以本机Apple SDK声明补核，未将网页空壳当作已读API正文。

- https://developer.apple.com/videos/play/wwdc2023/10136/
- https://developer.apple.com/documentation/screencapturekit/sccontentfilter/pointpixelscale
- https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/width
- https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager/captureimage(contentfilter:configuration:completionhandler:)

本机由xcrun定位CommandLineTools；Swift6.3.3，SDK26.5，独立目标arm64-apple-macosx14.2。SDK路径与以下各文件SHA-256保存于build-info.json，未下载工具或SDK。

| 本机官方声明 | 核实语义 | 实现选择与限制 |
| --- | --- | --- |
| SCStream.h:114/119 | filter.pointPixelScale及contentRect，macOS14+，比例与点尺寸 | 二者相乘，只接受整数像素范围，不发明scale参数 |
| SCStream.h:208起 | configuration.width/height为输出像素 | 实际CGImage与请求尺寸不一致拒绝；文件2×本身不是无重采样证明 |
| SCStream.h:237–245 | scalesToFit=false仍可能缩小；保留宽高比 | 明确无内部重采样证明，不能把false解释为禁止缩放 |
| SCStream.h:267–290 | 未设source/destination时整个独立窗/输出；默认颜色空间来自显示器 | 保留默认范围/颜色空间并记录返回CGImage色彩/ICC |
| SCStream.h:317–355 | ignoreShadowsSingleWindow、captureResolution、shouldBeOpaque、ignoreGlobalClipSingleWindow、includeChildWindows真实存在 | 请求best、去阴影、保留alpha、无子窗；范围效果待实测；child属性在14.2+，故最小版本14.2 |
| SCScreenshotManager.h:146–152 | captureImage用filter/config返回CGImage，14+；SDR返回BGRA | 选定窗口、SDR/BGRA直接PNG，无JPEG中间步骤，不打开SCStream录音 |
| SCShareableContent.h | SCWindow.windowID/frame/owningApplication/isOnScreen/windowLayer；SCDisplay.width/height为点 | 与精确CG window info交叉核对，排除跨屏或越界；不把display.width误当像素 |
| CoreGraphics CGSession.h | 公开onConsole/loginDone字段 | 只作console/login前置检查；不使用私有锁屏key，不冒称已证明解锁 |

API声明没有提供截图前内部重采样的完备证明，也没有窗口创建generation。工具把这些结论固定UNKNOWN，严格无缩放证明模式提前拒绝。权限preflight、前后实例/文件/窗口身份及显示器几何是实用的有限边界；锁屏竞态、真实输出范围/颜色、OS权限提示和取图可用性需要独立实测。没有加入权限/系统设置修改或私有CGS接口。
