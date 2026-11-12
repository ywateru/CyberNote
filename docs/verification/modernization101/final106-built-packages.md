# 106 当前源双端候选包构建记录

2026-11-10。执行本轮授权的串行Mac→Android普通包构建、签名、实际完整lint与精确入口核验。未安装、操作设备、运行新包UI或更新README。独立包审查与后续native验收待父级另gate；不自审接受。

批次：`artifacts/releases/20261110-modernization106/`。新批次未覆盖105、r2/v2或MEDIA105原始测量。

| 项目 | 准确值 |
|---|---|
| version | 0.1.0 |
| sourceRevision / dirty | `bf26dae17f972fc09276deb456b4599e1ebe5d67` / true |
| 产品输入 | 446 |
| sourceFingerprint | `74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a` |
| 共用prepare UTC | `2026-11-10T08:05:15.754Z` |
| Mac builtAt UTC | `2026-11-10T08:05:59.823Z` |
| Android builtAt UTC | `2026-11-10T08:23:18.611Z` |

`product-inputs.json`记录prepare前446项输入SHA，`final-source-guard.json`再次逐项核对完全相同、stamp有效、双端同源码/版本/prepare；generated-only输出没有改变指纹。全程共享root `src-tauri/target`，jobs2、incremental0、RUSTFLAGS=-C debuginfo=0；此前own编译产物删除后正常重编译，没有恢复旧副本/新target，也没复建Mac第二次。构建入口自带tsc+Vite，没有重复typecheck。

## 最终候选文件

| 文件 | 字节 / SHA256 |
|---|---|
| 已签名CyberNote.app目录摘要 | `5b3de4d3c23944fa7f483f921c63802ef0a8e26b89c52afad6687a693daa4a85`（release.mjs按相对路径/长度/最终文件字节算法） |
| Mac实际Contents/MacOS/notes-clone | `92161da1222fc2e0095ec0dde20083023b57a512d96ea336e12429475663f71e` |
| CyberNote-Mac.zip | 36,117,040B / `1cdae91c9dbb3937dbca58c62a018741ebfe6967e16f9a3e013ef84681883760` |
| android/CyberNote-Android-arm64.apk | 72,669,322B / `56d1c3246c3612cc1bc392de8b8493dac189be1e8c83e35c142ffb41d61f2a05` |
| APK实际lib/arm64-v8a/libnotes_clone_lib.so | 56,908,160B / `63343080ad36c77f71b55b9878c15fef12843b7a4d1a2ee790a1ec22a8da0759` |

Mac从Info.plist解析真正入口，ad-hoc codesign签名后`--verify --deep --strict --verbose=2` exit0，未公证。Android使用本机Android Debug证书，证书SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与保留105（及此前r2已证同证书）一致；v2/v3签名与`zipalign -c -P16 4`通过，不称生产release证书。证据为mac-sign-*.txt、android-sign-*.txt、android-same-certificate.json和android-zipalign-verify.json。

两端`mac.json`/`android.json`在最终签名和lint之后再次调用真实verifyPackage，Mac真正启动文件和APK唯一arm64实际主库均包含本批metadata **和** 生产runtime原始编码字节。`mac-frontend`、`android/android-frontend`各自builtAt准确保存；`mac-codegen-assets`、`android-codegen-assets`与`*-assets-origin.json`按真实入口中metadata/runtime匹配定位，不按mtime或旧hash选择缓存。最终主库与APK成员逐字SHA相同，旁置JSON/辅助库不作为入口证明。

## 字体与许可

源完整字体16,437,364B、SHA256 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`在Mac实际入口两处[13868418, 30331509]、Android实际主库两处[2080524, 18661251]完整匹配，见*-font-embedded.json。不称只嵌一次，也不把这当作新包中文字形UI实测。

OFL.txt与字体README版权/来源/未修改说明原样复制至本批notices/noto-cjk及android/notices/noto-cjk；不再复制16.4MB源字体。Mac ZIP包含已签名app和notice，共6个归档文件，逐项字节与Unix权限及精确条目集合均与最终stage相等，见mac-zip-content-check.json。notices为分发旁置说明，不声称嵌入APK/app资源；最终发布时应保留可达的完整说明，裸APK不代表完整许可分发。

## 实际完整lint与退出

本批构建完成后真实执行：

```sh
cd src-tauri/gen/android
./gradlew :app:lintUniversalRelease -x :app:rustBuildUniversalRelease --max-workers=2
```

exit0、BUILD SUCCESSFUL in9s；139 tasks:1 executed/138 up-to-date。完整lint入口真实执行，增量复用事实保留；仅排除Tauri RPC结束后已准确构建的重复Rust任务，没有排除lint、增加baseline或抑制错误。结果**0Error、30Warning、1Hint**，新HTML/XML/TXT/SARIF已保存android-lint-reports；lint前后APK摘要完全相同。源码编译警告保留于mac-build.log/android-build.log，exit0不等于无警告。

Mac session77817 wrapper5621/pnpm5622、stage24269均exit0；Android session58827 wrapper9954/helper9988 exit0；full lint session88738 wrapper11928/Gradle wrapper11930 exit0；最终stage82626与精确双端再核56392 exit0。`./gradlew --stop`正常停止本轮1个daemon，build-processes-exited.json核全部owned PID及Cargo/rustc/clang/Gradle wrapper/daemon不存在，不停止无关常驻app/Vite。

Mac构建最低free **8,928,276,480B**，Android构建最低 **7,717,879,808B**；均由3秒采样2.5GiB停止线监控，未触线。最终guard可用 **7,532,523,520B**。没有在本轮删除cache、旧候选包、raw或全局registry。

## 功能范围

本报告只证明本批候选包构建、同源身份、签名、字体/许可字节及lint。106源码独审接受不自动代替新包真机旋转/IME/面板验收。本批未install、未运行Mac UI、未连接设备测试、未发布README。

已装旧v2的live-02单次bodytap已正常显示完整键盘，app/IME服务PID未恢复重启；其初始DOM焦点/session和历史触发未知，不是永久修复或106新包功能证据。旧102长按后格式面板消失失败仍open，不能用106尺寸/平台修正直接归因或宣称解决。后续普通最终包应按父级独立gate验证，而非另建诊断包。Mac旧麦克风授权超时/物理触摸板pinch边界及MEDIA105性能报告也不因本次核包扩大为通过。
