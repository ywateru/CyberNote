# REA 原生窗口 PNG 路线：只读可行性核查

结论：已安装 REA6.7.0 的 `observe_native_ui` 是一个值得实测的**选定窗口 PNG 取图候选**。它无需向目标注入、调试器 attach 或启动目标应用，但需要活动 Mach-O 文件绑定、已经运行的 PID 与准确的 CGWindowID。源码明确把截图宽高设置成窗口 bounds 对应的数值，并将长边限制到2048；没有使用 Retina/backing scale。因此当前实现**不能静态认定为 raw2×，也不能直接用于现有2×细笔画像素验收**。本报告未执行任何取图，实际成功率、截图比例和颜色仍 UNKNOWN。

本轮只读取本机安装源码及当前会话已公开工具 schema；未调用 REA open/observe/attach，未运行 helper、截图或 shell UI 脚本，未改权限/配置/产品/共享 target，未下载。旧 review tree 的产品 HEAD 保持 `47d44464fef4f3b038b191ff63d041637fb728d3`。此前 CUA/历史文件被主任务识别为实际 JPEG 的结论由主任务提供；本轮未重测它们。历史字节与原 manifest 应保留，不能因为扩展名为 `.png` 或后来用 PIL 导出 PNG 就称原始采集无损。

## 已确认的调用与边界

所有源码相对路径均以 `/Users/water/.local/share/rea/node_modules/rea-agents/` 为根；完整路径、长度及 SHA-256 存在 `sources.json`。

| 事项 | 读取到的实现与来源 |
| --- | --- |
| 输入 | `dist/domain/native/nativeUiObservation.js:5–19` 是严格对象：必需正整数 `pid`、`window_id`；可选 `screenshot=true`、`accessibility=true`、`max_nodes=500`。已公开 `observe_native_ui` schema一致；没有 `scale`、`dpr`、`width`、`height`、`max_dimension`、原图/Retina开关或输出文件参数。不能发明这些参数。 |
| 目标绑定 | `dist/native/NativeUiObservation.js:57–89` 要求 active target为 Mach-O executable，并将 target.path/hash 与精确 PID/window ID传给 helper。不是 target-free 截图API。 |
| 目标不启动/不注入 | passive操作在 `NativeUiObservation.js:16` 将 steps固定为空；本次调用只有初始 take，无 action。`bridge/native/ReaNativeUI.swift:45–75` 读取 NSRunningApplication、realpath、launch date、可执行文件字节 SHA256及 CG窗口元数据；没有目标注入、LLDB/Frida连接、目标 launch或激活前台的代码。可执行文件身份校验限制256MiB。 |
| helper仍会运行 | `dist/native/NativeUiHelperRuntime.js` 在临时目录调用 `/usr/bin/xcrun swiftc` 编译 observer，执行外部 helper，结束清理临时目录。不能把“无需启动目标”误述为“完全不启动进程/不写文件”；metadata也声明 launchesProcess与mayWriteFilesystem。本轮未执行它。 |
| 选窗校验 | `ReaNativeUI.swift:65–71` 用 `.optionIncludingWindow` 精确查询已给的window ID，要求唯一、owner PID相同、layer0；`:140–145` 再从 SCShareableContent中按同一windowID+PID选择 `SCContentFilter(desktopIndependentWindow:)`。没有全屏截图回退。 |
| 权限 | `ReaNativeUI.swift:73–85` 只做Screen Capture preflight与AX信任检查，失败返回错误，不弹授权/修改权限。请求 `screenshot:true, accessibility:false` 时跳过AX窗口匹配及遍历；仍需要截图权限与目标/窗口身份。默认accessibility为true，可能因AX权限或同几何窗口不唯一而失败。 |
| 主机 | `ReaNativeUI.swift:139` 该截图分支要求macOS14+。helper构建依赖现有兼容Xcode命令行工具；当前权限主体、工具链及锁屏下可用性未实测。 |

## 实际采样尺寸与 PNG

`ReaNativeUI.swift:144–154` 是关键：

```swift
let scale = min(1, 2048 / max(bounds.width, bounds.height))
configuration.width = max(1, Int(bounds.width * scale))
configuration.height = max(1, Int(bounds.height * scale))
configuration.showsCursor = false
let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
```

这里的bounds来自CGWindow bounds，而不是原始截图像素尺寸。代码没有取 `backingScaleFactor`、显示器比例、`pointPixelScale`或以原生像素长宽配置。以下仅是按逻辑点bounds代入的**请求尺寸推导**，不是观察到的输出：

| 输入窗口bounds | 请求截图像素 | 相对2×旧基准 |
| --- | --- | --- |
| 1392×903pt | 1392×903 | 旧2784×1806px的一半宽高，不能保持原笔画样本 |
| 1088×660pt | 1088×660 | 旧2176×1320px的一半宽高 |
| 2400×1500pt | 2048×1280 | 长边超2048时进一步按同一系数缩小 |

`Int`截去小数，最少1像素；一旦尺寸非整数比例，不能假定无重新采样。实现返回实际 `image.width/height`，所以最终必须读输出IHDR与报告尺寸，不能只凭请求推导宣称1×或2×。

编码端明确使用 `.png`，返回实际PNG字节的base64、SHA256与CGImage长宽。`nativeUiObservation.js:52–102` 解码规范base64，核对SHA256、PNG签名/IHDR及长宽；这强于仅声明MIME或文件名。静态实现支持“取到的CGImage按PNG保存”，不等于“保留屏幕原始2×样本”：采样/缩小可能在PNG编码前发生。本轮没有实际PNG输出，故PNG成功生成仍待实测。默认阴影、边框范围、色彩空间、HDR/SDR处理、焦点/遮挡/锁屏行为没有在这段配置中固定，不能补充推断。

## Window ID的获取与当前缺口

公开 `observe_native_ui` 必须由调用者提供现成的PID及window_id；它返回的window字段也只回显已经选定的对象。当前REA工具名/schema清单没有macOS native窗口枚举操作。`list_frida_processes`只解决进程身份且属于其他连接路线；`inspect_adb_window`是Android工具，均不能提供这里的CGWindowID。不要假设AX窗口序号、窗口标题、CUA内部window handle或旧ID就是CGWindowID。

源码中可用于外部只读枚举的系统API是 `CGWindowListCopyWindowInfo`，或 `SCShareableContent` 的 `SCWindow.windowID`+`owningApplication.processID`。本轮禁止运行helper/UI脚本，因此没有枚举，也没有核验当前窗口ID。后续若主任务批准一次元数据枚举，可通过已有 `functions.exec → tools.exec_command` 执行一个单独只读枚举：只输出目标PID的窗口number、ownerPID、layer、bounds、title；不截屏、不激活、不创建窗口。这里描述的是后续实现所需API，不是声称已经存在某个REA `list_native_windows`工具。

## 是否满足同条件比较与下一步

对于**重新采集、相同窗口点大小、相同显示器/系统缩放/外观/焦点与状态**的一对图，REA可成为同一采样链路的PNG候选；按源码很可能只能进行1×或更低采样的局部几何检查。它不能与旧2×原截图直接配对，也不能借放大/重编码恢复2×笔画。对当前“像素级一致”的严格验收仍不够，应保留UNKNOWN，待另行取得且核验真实2×采集路线。

等机器解锁且主任务明确决定做一次有限试采后，已有工具的具体顺序为：

1. 先用 `binary_session({})` 只读核实活动目标及 `observe_native_ui`可用性；若不是精确目标，由主任务根据公开schema用 `open_binary({path: <已核验绝对应用或可执行文件路径>})`绑定。不要为了截图盲选provider、attach或注入。此绑定/能力是否在当前会话成功仍未知。
2. 用上述只读窗口元数据枚举取得当前PID和CGWindowID；核对layer0、bounds与实际目标。当前没有可直接替代此步骤的已公开REA窗口发现工具。
3. 调用现有 `observe_native_ui({pid: <真实PID>, window_id: <真实CGWindowID>, screenshot: true, accessibility: false})` 一次。数字必须来自当前枚举，不用示例或历史ID；不传任何未公开分辨率字段，也不使用会改变应用数据的 `capture_native_ui_scenario`。
4. 仅从返回的 `normalized_result.initial.screenshot.base64`保存原始解码字节，独立核验PNG signature/IHDR、width/height和SHA256，记录同次bounds与显示环境。PNG容器合格后仍要计算像素/点比例；如为1×，只建立独立1×证据，不覆盖2×基准。原版与克隆都必须重新采集同条件，而非只补一边。
5. 保存完整Evidence后用已公开 `close_binary({})`释放本次绑定（需由持有该会话的主任务协调，不能误关他人活动目标）。

以上全是后续可用工具与输入结构的静态建议，本轮未执行。若需要真实2×，本安装schema没有对应参数；要另评估有明确原生像素配置与源文件真实性校验的采集方案，不能在当前REA上虚构 `scale:2`。
