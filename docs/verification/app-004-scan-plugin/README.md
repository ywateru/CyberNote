# APP-004 扫描插件开发者检查

2026-11-03。独立模块：`plugins/tauri-plugin-notes-scan/`；没有接入主App，也没有访问GUI、安装APK、使用设备/摄像头或向原版Notes写入。本文保留 `9340dba` 的开发自检基线；该基线后续独立模块检查见只读 review `2358901`。新增实际宿主复制开发补证和待运行 Android 夹具见 `host-copy/README.md`，不能将本页旧产物 hash 当作新增夹具产物。基线源码逐文件SHA见 `artifact-inventory.json` 的sources；同一目录的根构建缓存不参与主应用构建。

| 检查 | 实际结果 | 证据 |
|---|---|---|
| Rust本机会话测试 | 2/2通过：重开、跨会话/路径token、状态限制、取消、过期清理与symlink拒绝 | rust-tests.txt |
| Rust Android目标 | aarch64-linux-android cargo check通过，包含真实mobile handle注册/转发 | android-rust-check.txt |
| 前端API类型 | 独立tsc strict/noEmit通过 | 插件README中的完整命令 |
| Android库/验证APK | 使用隔离缓存、锁定依赖并以--offline重建成功；109tasks，最终构建31s | android-build.txt |
| Android局部单测 | 2/2通过：非法交叉/微小/NaN四角、合法矩形、token格式 | android-unit-tests.xml；仅JVM局部检查，不代表透视/识别运行 |
| Mac实际中文OCR | Vision accurate revision3；识别“离线文字识别 / 备忘录扫描测试 / 本地保存 2026”三行；保存后重新打开会话结果一致、分块读取、ack清理通过 | chinese-fixture.png、macos-chinese-result.json |
| Mac实际空图OCR | status=empty、text为空；重开、读取与清理通过 | blank-fixture.png、macos-blank-result.json |

Mac图片由插件的 `scripts/generate-fixture.swift` 无窗口生成；实际调用经Rust插件的SessionStore→ImageIO→Vision，不是mock或语言能力查询。初始受限进程无法调用系统识别服务，授权无窗口进程运行后取得上述结果。Mac测试未强制断网；源码无网络识别调用，但不能把该次运行写成网络关闭实证。EXIF旋转分支、Mac12设备与其他语言准确率未运行。

最终独立APK：

```text
/Users/water/work/2026/Apple-Notes-Clone/plugins/tauri-plugin-notes-scan/android/harness/build/outputs/apk/debug/harness-debug.apk
54,071,535 bytes
SHA-256 e9a14e9e177bbe9f04daee7dff9127ad5cf6423bc314777290afdf67adbada4c
applicationId com.local.notesscan.harness; min26/target36; debug; all four bundled ABIs
```

独立AAR：

```text
/Users/water/work/2026/Apple-Notes-Clone/plugins/tauri-plugin-notes-scan/android/build/outputs/aar/notes-scan-standalone-debug.aar
75,487 bytes
SHA-256 df8784c0940efd85ed76a53393b601b02d0060de788c589ee7e0116742c3da3c
```

`artifact-inventory.json` 实际打开APK读取并哈希：25个 `assets/mlkit-google-ocr-models/` 文件，未压缩共2,490,310 bytes，包含Hani/Latin的识别模型及检测布局资源；arm64-v8a、armeabi-v7a、x86、x86_64中均有 `libmlkit_google_ocr_pipeline.so`。这证明模型字节已打入APK，不能替代首次离线运行。AAR本身不打包传递依赖，接入方必须保留插件Gradle依赖；不能只复制75KB AAR就声称模型齐全。

MLKit传递依赖和APK属性中有Play services命名组件；本模块选择的是 `com.google.mlkit:text-recognition-chinese:16.0.1` bundled入口，依据模型字节而非名字判定。合并Manifest因传递依赖含INTERNET/ACCESS_NETWORK_STATE，详见android-apk-badging.txt；本次没有运行或观测网络。独立verify仍须在首次启动前断网，实际验证不等待模型下载，不从“编译--offline”推出设备离线识别通过。

复现命令与主App串行接入步骤在插件README；Gradle9.6.1、Java17、SDK36、Tauri2.12.5、CameraX1.6.2、Exif1.4.2和MLKit16.0.1版本及传递依赖由插件Cargo.lock/android/gradle.lockfile保存。无修改根Cargo/package/锁文件或gen/android。产物留在插件自己的build目录，未提交52MB APK到Git；hash与模型清单已保全。

后续独立verify需先从root取得设备交接，才安装该独立APK。选图OCR结果写APK私有 `files/probe-result.json`，可用run-as读取；相机页按取消/拒权、手动/自动、裁四角、滤镜、两页拍摄、复裁/旋转/改序/删除/重拍、生成PDF、会话重开/ack逐项执行。检查原始字节sourceToken、旋正图、四角、派生图和PDF页序真实存在；没有实际执行的透视/多页/PDF/取消/权限硬件结果目前均为unknown。JPEG、PDF可由run-as受控导出后用独立解码器核对，不能只看成功Toast。

相机真实镜头/闪光、Android首次断网OCR与无GMS设备、原版逐像素/动画、Tauri WebView实际invoke→插件、宿主Rust copy_file_to→Store受管附件→笔记事务→冷启动及归档均尚未验证。当前不标APP-004-scanning或全目标完成。
