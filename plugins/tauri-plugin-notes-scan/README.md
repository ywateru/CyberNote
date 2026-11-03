# Notes Scan 原生模块

独立 Tauri 2 插件，Rust + Kotlin + macOS Objective-C/Vision。**已在APP-004-OCR-HOST-01候选源码接入主App文字路径，尚未完成主App原生构建和安装版验收。** 独立模块已有编译/设备证据不代替主App全流程、真机或像素通过。

## 已实现的模块边界

- Mac：用户已选择的图片字节 → 私有会话 → ImageIO 读取尺寸/EXIF 旋正 → Vision accurate 中文识别 → 文本/行框/置信度。macOS12使用revision2；13+使用revision3，并实际查询中文语言能力。不启动相机/连续互通或原版备忘录。
- Android：随包中文 ML Kit `16.0.1`；本地选图即复制；CameraX `1.6.2` 的 Preview/ImageCapture/ImageAnalysis；应用自己的非导出相机 Activity。自动模式基于真实亮纸连通域四角及连续稳定性，失败转手动四角，绝不返回伪检测结果。
- Android 文稿：保留原始选择/拍摄字节和EXIF、旋正编辑图、四个归一化角、滤镜、旋转与页序；Matrix 四点透视实际改变图像；彩色/灰度/黑白；多页继续拍摄、复裁、旋转、改序、删页和重拍；PdfDocument生成真实图像PDF。
- Android 文字：相机裁切/本地图片 → bundled OCR → recognized/empty/failed → 完成。宿主另行负责确认插入原 note/选区。
- 两端会话：draft→ready→acknowledge；取消直接删除。token仅为随机UUID，前端没有路径输入。私有清单原子写入，读取有归属/路径/大小/过期检查；异常不是空成功。

Android初始扫描页参考 `references/mobile/frames-2s/frame-041.png` 的黑底、取消/闪光/滤镜/自动、拍摄提示与快门。录屏没有成品复核页，后续裁切/多页界面是工程实现，未作原版像素声明。亮纸检测不是Apple算法；暗纸、纹理背景、边界贴屏等情况可能需要手调，准确率未测。PDF是图像页，没有可搜索OCR文字层。Mac12兼容分支只编译，尚未在Mac12运行。

## 数据与安全契约

`ScanSession`：version=1、sessionId、mode(text/document)、state(draft/ready)、createdAt/updatedAt、files、pages、ocr、pdfToken。公开结构见 `guest-js/index.ts`。框和角均为旋正图像的左上原点归一化坐标，角顺序 TL/TR/BR/BL。

`files` 是 token/mime/size/width/height；Android旋正编辑图的 `sourceToken` 指向逐字节保留的原始图片（该资源mime为application/octet-stream，不猜测格式）。页面 `originalToken` 指向旋正编辑图，`correctedToken` 指向透视后的图；原始图、旋正图、点和旋转须全部进入宿主受管扫描集合，才能后续复裁。Android为内存上限把编辑图最长边按2的幂采样至不超过3200，校正图最长2400；原始字节另存不丢失。Mac OCR图片旋正为PNG。

单图原始字节20MiB、解码24MP/边长12000、Android24页、会话总128MiB、最多8个会话、TTL24小时；单次读取1–256KiB。Mac本地图像OCR会话最多32文件。超限返回明确错误。清理在开始/打开后执行，未过期草稿保留，损坏/中断目录到TTL后清理；宿主应保存待处理sessionId以恢复或主动取消。ready不能再修改，重复finish返回session_state；ack后token失效。

文字识别空图返回 `status:"empty"`、空text；失败存 `status:"failed"` 和error且请求拒绝，不能沿用旧结果finish。主要错误：invalid_token/session_missing/session_expired/session_state、file_missing、image_limit/page_limit/session_limit/read_limit、invalid_image/invalid_corners、ocr_failed/language_unavailable、permission_denied/camera_unavailable、cancelled/cleanup_failed、unsupported、io。Tauri Rust转发保留原生code/message。取消选图保留可继续使用的草稿；取消扫描删除整个会话。权限拒绝保留草稿并明确拒绝，不产生笔记节点。

本模块不接收noteId/revision/选区，也不修改笔记库。宿主负责原note/选区绑定、锁定/删除/冲突判定。插件依赖没有云识别调用；ML Kit传递依赖含Play services命名的基础组件，这不等于下载模型路线。实际APK内Hani模型字节和原生OCR库见验证证据。首次安装前断网与无GMS兼容必须设备实测，尚未通过。

## 主应用文字接入与后续文稿集成（串行）

文字首批已接主Cargo/lock/Builder/capability、src/ocr-native.ts与OcrHost/App真实正文ACK路径，工程预览见docs/ui/ocr-text.md。Mac新增明确的本地OCR命令，Android复用picker/camera；实际文字单事务插原选区，正文ACK后acknowledge，失败同操作重试。仅源码候选已验证，安装与冷启待root独立安排。

兼容例外：scan的build-dependency tauri-plugin精确2.6.3对齐主线已有2.7.2，独立lock只改对应version/checksum，主lock只新增path包。runtime tauri2.12.5、插件0.1.0、Android模型和原生引擎字节保持；未下载依赖。其余文稿资源持久化契约仍待实现：

1. 主Rust Cargo增加本目录path依赖，并在Builder注册 `.plugin(tauri_plugin_notes_scan::init())`；主capability显式添加 `notes-scan:default`。插件自己的build.rs负责原生Android源码路径，禁止只修改gen/android。Android相机运行时权限由ScanActivity请求，主应用最终Manifest/target/签名仍需安装验证。
2. pnpm本地依赖或直接导入 `guest-js/index.ts`。选择目标时保存noteId/revision与映射选区，开始会话；Mac仅text模式，外部已选图片转受限字节ingest；Android可pickImage/recognize或openCamera。camera返回ready会话，不要再重复finish。
3. 模块结果先向用户确认，宿主重新验证最初目标仍可写且选区/版本有效。切笔记、删除/锁定或版本冲突不得将结果插入当前另一篇。用户取消或识别empty不能伪装为已插入文字。
4. 扫描集合使用**宿主Rust** `NotesScanExt::notes_scan().copy_file_to(sessionId,token,hostChosenStagingPath).await` 复制各资源，不把大图/PDF反复经过WebView。此函数只接受Rust内部受控目标路径，create_new且失败清理，校验分块长度/结束状态并sync。小预览可readFile，token不当作本地路径。
5. 宿主在自己的暂存/日志/数据库事务中提交扫描集合、附件关系和文档节点，沿用FIX-00恢复原则；全部持久提交后才acknowledge。失败保留ready会话用于重试，不能先ack再保存。重启/备份保留原始字节、旋正图/校正图、四角/滤镜/旋转和顺序。插件ack后不再承担长期笔记存储。
6. 媒体浏览记录真实扫描来源；手机入口/返回/相机权限/背压/中断、原图移除后重启、归档副本冲突映射均由APP-004-scanning继续完成。Mac保留实际不可用的原版相机入口，不把本地图片OCR假称连续互通扫描。

`execute(Request)`也为Rust宿主公开；具体请求包括begin/get/ingestImage/pickImage/openCamera/cropPage/movePage/deletePage/rotatePage/recognize/finish/readFile/acknowledge/cancel/cleanup。cropPage支持pageId替换，坐标无效拒绝；删除后清理无引用原图/派生图；旋转记录到页面并用于PDF。Mac不支持camera/pickImage及文稿处理，明确unsupported。主App首批只连接text模式begin/get/ingestImage/pickImage/openCamera/recognize/finish/acknowledge/cancel；文稿裁切/改序/删除/旋转、PDF及长期扫描集合未接主App。

## 可复现的独立检查

Rust无需主应用：

```sh
cargo test --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --target-dir plugins/tauri-plugin-notes-scan/target
cargo check --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --target aarch64-linux-android --target-dir plugins/tauri-plugin-notes-scan/target
./node_modules/.bin/tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --skipLibCheck plugins/tauri-plugin-notes-scan/guest-js/index.ts
```

Android使用Gradle9.6.1、Java17、Android SDK36。设置 `NOTES_SCAN_GRADLE` 为可执行Gradle，`NOTES_SCAN_TAURI_ANDROID` 为锁定Tauri2.12.5的mobile/android目录，再运行：

```sh
bash plugins/tauri-plugin-notes-scan/scripts/check-android.sh --offline assembleDebug testDebugUnitTest
```

未缓存依赖时移除offline，若通过代理连接则将Java的http/https代理属性追加到命令；不要改全局配置。独立Gradle缓存默认为 `/private/tmp/notes-scan-gradle-home`，所有产物在插件android/build或harness/build；外部Tauri库的build也重定向到插件目录。`android/settings.gradle.kts`只供独立构建，正常主App包括library时不执行它。

Mac无窗口真实OCR：先用 `scripts/generate-fixture.swift` 生成图，再 `cargo run --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --example macos_probe -- IMAGE PRIVATE_TEST_ROOT`。CLI路径只用于合成图测试，不是公开IPC。该进程须能访问系统Vision服务；受限环境可能无法调用，记录失败，不能用空结果代替。源码/图/结果/产物hash和实际验证边界见 `docs/verification/app-004-scan-plugin/`。

独立验证APK的applicationId为 `com.local.notesscan.harness`，与主应用不同；尚未安装。仅其Manifest声明ProbeActivity启动页，主插件Manifest不声明该入口。验证UI可选择本地图OCR或打开真实扫描；结果写入该APK私有 `files/probe-result.json`。设备交接后verify可用run-as读取，不需要外部存储权限。该APK不含主笔记库，也不代表Rust→Store主App链路已测。

## 实际宿主复制探针与待运行设备夹具

`examples/host_copy_probe.rs` 使用 Tauri 官方 MockRuntime 替代窗口运行时，加载本模块**原有 `init()`**，把 app data override 到新建临时根目录；实际调用 `app.notes_scan().execute()` 和 `app.notes_scan().copy_file_to()`。插件 setup、NotesScanExt、SessionStore、ImageIO/Vision、分块读取与磁盘复制均真实，生产复制代码没有修改。`tauri/test` 仅为 dev-dependency，不增加生产 IPC、路径输入或替代复制器。

```sh
swift -module-cache-path /private/tmp/notes-scan-swiftcache plugins/tauri-plugin-notes-scan/scripts/generate-fixture.swift /private/tmp/notes-scan-host-image.png --noise-border
cargo build --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --example host_copy_probe --target-dir plugins/tauri-plugin-notes-scan/target
plugins/tauri-plugin-notes-scan/target/debug/examples/host_copy_probe /private/tmp/notes-scan-host-image.png /private/tmp/notes-scan-host-copy-NEW
```

最后一个目录必须不存在。噪点边框保证归一化 PNG 大于 256 KiB，仍真实识别三行受控中文。探针核对完整字节、draft 拒绝、已有目标不覆盖、ready 后截断私有测试资源引发的失败与目标清理、恢复资源后重试、ack 前 ready/资源仍存在、ack 后资源失效而宿主副本保留。结果见 `docs/verification/app-004-scan-plugin/host-copy/`。它没有 WebView invoke、真实 GUI runtime、主 Store 事务或崩溃恢复，因此不构成正式 App 集成通过。

独立 Android debug 构建另将 `android/src/deviceFixture/java/` 加入 Kotlin debug 源集；被主应用作为 library 引用时不包含该目录。仅 harness Manifest 声明 `DeviceFixtureActivity`，其中两种场景仍待设备交接后运行：

- `ocr-first-offline`：要求全新 harness 数据、首次启动前飞行模式且无活动网络；实际 bundled ML Kit 识别 APK 内受控中文与空白 PNG，验证原始字节、recognized/empty、ready 重开和 ack。运行前后检查离线条件，记录 GMS 安装状态；这不代替外部对清空/首次启动和网络状态的记录，也未证明无 GMS 运行。
- `perspective-pdf`：生成已知四边形投影的四色夹具，经真实 ingest/addPage/Images.correct 校正并读取实际像素；再创建第二页、旋转第一页、改序、finish 生成 PDF，用系统 PdfRenderer 解码两页并逐点核对四色、页序和横竖向。原图、校正图、PDF、两张渲染图、ready JSON、结果 JSON 全部保存私有 files/device-fixture 下。自动边缘检测、相机和手势不在这个夹具范围。

设备交接后的精确操作与收集方式见验证子目录 README；当前仅编译准备，没有安装或运行 Android 夹具。
