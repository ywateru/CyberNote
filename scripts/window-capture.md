# 只读窗口 PNG 证据工具

CUA负责全部界面操作。该工具只观察已经运行且已授权采样的 `com.apple.Notes` 或 `com.local.notesclone`，不启动/激活/聚焦/移动/缩放目标，不接收AX动作、脚本或shell命令，不读取Notes数据库。以下是后续独审通过后实测用法；本轮只运行编译和离线拒绝/PNG检查，没有采集真实窗口。

## 编译

使用本机既有Swift/SDK，不安装依赖。替换示例中的绝对目录为尚不存在、父目录已存在的新路径：

```text
python3 scripts/build-window-capture.py --output-dir /private/tmp/notes-window-capture-new-build --with-offline-tests
```

输出observer、可选离线检查程序、嵌入构建身份源和build-info.json。所有编译module cache都在这个新目录内，构建结束后删除，不使用Rust/Gradle/共享缓存。记录Swift编译器、SDK版本/声明hash、工具源hash及完整编译参数。`swiftc`入口名必须保留，不把它解析成内部swift-frontend后直接调用。输出目录已存在时拒绝。构建身份与源checkout位置绑定，移动源码后应从新目录重新构建。

## 后续获准实测的调用

每次运行均经独立调用器监督，默认15秒、最大30秒。Swift后端会检查调用器环境及父PID；直接执行后端不进行取图。调用器只运行所选构建目录下、与build-info及当前工具源hash一致的固定observer，不提供任意命令选项。

```text
python3 scripts/run-window-capture.py --build-dir /private/tmp/notes-window-capture-new-build --timeout-seconds 15 -- list --bundle com.apple.Notes
```

list的JSON位于调用器返回 `observer.stdout` 内。只输出目标窗口的PID、launch时间、exe路径/文件身份/hash、windowID、几何、所在显示器和filter原生比例；不读取/输出窗口标题。内部SCK shareable-content API返回系统对象后立即按bundle筛选，未筛选对象不作标题读取或输出。无符合窗口、跨屏、越界、元数据变化均明确拒绝。

CUA完成最终窗口布置后，使用同次list中的精确PID、windowID、exe路径和identity token。下列尖括号内容必须替换为已核实真实值，不能把示例/旧PID传入：

```text
python3 scripts/run-window-capture.py --build-dir /private/tmp/notes-window-capture-new-build --timeout-seconds 15 -- capture --bundle com.apple.Notes --pid <exact-pid> --window <exact-window-id> --executable <absolute-executable-path> --expected-identity <identity-from-list> --output-dir <new-absolute-evidence-directory>
```

克隆只把bundle替换为 `com.local.notesclone`，使用其自己的实例/窗口身份。capture选定唯一desktop-independent window，前后比较bundle/PID/launch/exe文件身份及SHA、CG与SC窗口ID/owner/layer/几何、filter内容范围/原生比例/显示器。任何变化丢弃图像，不自动重试，不全屏fallback。

output-dir必须全新，目录0700，PNG及manifest0600独占创建，通过目录fd写入；已存在目录、文件或symlink拒绝。按 `contentRect × pointPixelScale` 请求整数像素尺寸，非整数不猜测取整，不后处理缩放。实际CGImage尺寸必须等于请求尺寸；ImageIO直接PNG编码，核签名/IHDR/可解码尺寸/字节数/hash及写入后字节一致性。PNG在成功manifest之前写入；正常错误清理本轮拥有的文件，不覆盖旧文件。

## 如何判读结果

仅当调用器 `acceptOutput=true` 且manifest与PNG核验一致时，才接受本次有限PNG证据。成功状态是 `captured_png_native_ratio_requested`，不表示原始背板或像素一致。manifest记录工具/源/SDK、完整参数、监督时限、前后目标身份、请求及实际尺寸、PNG身份、色彩空间/ICC、alpha/位深、阴影/边框限制。

按SDK语义请求去阴影、无子窗、无光标、SDR BGRA、保留alpha、无音频/麦克风；精确边框范围、HDR/色彩转换和真实光栅效果待实际验证。没有任何 `CGRequestScreenCaptureAccess` / AX授权 / 系统设置调用；只检查既有Screen Capture授权和console/login状态。权限不足、SCK错误或目标不可见明确失败。公开session字段不是锁屏证明，系统权限撤销竞态/隐私UI行为仍UNKNOWN。

`noResamplingProof`固定为UNKNOWN：PNG对返回CGImage无损编码，但SCK内部合成/色彩/重采样及与原始背板等价性未获保证。`--require-unscaled` 在访问输出、权限、进程或窗口之前拒绝。公开API没有窗口创建generation，无法证明同进程同几何的瞬时ID复用；token只能约束实际前后采样边界。

调用器超时会SIGKILL其observer（没有启动其他子进程），等待回收并返回124、`acceptOutput=false`。这不是依赖Swift取消配合的TaskGroup。SIGKILL不会执行Swift清理，所以可能留有部分文件，甚至在完成交界留下manifest；**超时尝试的任何文件均不接受为成功证据**，保留为interrupted记录，后续另开新目录。没有自动重试。调用器报告保留实际elapsed、deadline、exitCode、原始stdout/stderr，应随PNG/manifest一起归档。
