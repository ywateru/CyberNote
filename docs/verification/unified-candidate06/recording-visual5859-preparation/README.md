# 录音界面58＋59：Mac17／Android12准确构建准备

2026-11-05，root以准确主线源 `fa21657bc116431324d85b18fcbe9e1d328471fb` 授权并串行完成两个平台的freeze、attempt01 build和collection。本目录保存本轮完整输入计划及两个平台各自的九字段授权，不追随HEAD。运行结果分别见 [Mac17构建记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-visual-build17/README.md)、[Android12构建记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/README.md)；本说明根据既有记录整理，未再构建或改写冻结及结果。

产品 **333** 文件聚合：`c4af1ea4245c575835070d29a1616190540fd25dd6fbb7d33b924fddb5e4774a`。完整 **352** 输入聚合：`f79a1decd907350da75647ce8d6ab8040acb7b482aa91a9b9240c3089c531b85`。两端产品和完整输入路径、字节聚合相同，平台授权、环境与冻结文件分别保存。计划见 [input-plan.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/input-plan.json)；准确清单见 [mac-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/mac-authorization.json) 与 [android-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/android-authorization.json)。

完整底表来自 [Android11授权](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-save57-preparation/android-authorization.json) 的331项产品／350项完整输入，保留全部旧路径，再纳入以下两个新检查脚本，重新计算最终实际字节：

- `scripts/check-recording-visual58.mjs`
- `scripts/check-mobile-recording-visual59.mjs`

相对Android11冻结，已有路径中变化的是 `scripts/check-recording-interactions50.mjs`、`src/RecordingPanel.css`、`src/RecordingView.tsx`、`src/recording-waveform.tsx`；无路径删除。两插件 `plugins/tauri-plugin-notes-ui`、`plugins/tauri-plugin-notes-scan` 完整扫描的76文件、14个被忽略Android生成文件、5个已打补丁ProseMirror依赖文件均保留，且这些条目相对Android11冻结SHA256未变。产品表另保留自动产品前缀之外的 `docs/fixtures/smart-projection09.json`。完整实际路径与字节身份均在各平台 `input-freeze.json`，不能用仅tracked文件表替代。

生成输入包括Android的 `tauri.settings.gradle`、`app/tauri.build.gradle.kts`、`app/tauri.properties`、`app/proguard-tauri.pro` 以及 `app/src/main/java/com/local/notesclone/generated/` 下10个Kotlin／规则文件；两个生成Gradle文件的scan注册继续接受工具核验。补丁依赖为 `node_modules/.pnpm/prosemirror-view@1.42.9_patch_hash=d108f8a44a6a15b29cd7c7460f2aa5bd9d7bcb12510acabe6bfa1d159932161d/node_modules/prosemirror-view/` 下的 `dist/index.cjs`、`dist/index.d.ts`、`dist/index.js`、`src/index.ts`、`src/input.ts`。上述19项均在352项完整输入内，76项插件文件也同时在333项产品内。

实际执行使用既有 [candidate06构建工具](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/preparation/README.md)，全程串行占用合作锁 `/private/tmp/notes-unified-candidate04-build.lock`，顺序为Mac17 freeze→root复核→build→collect，然后Android12 freeze→root复核→build→collect；两个collector均ready后才整理本目录说明。固定入口为 `pnpm mac:build` 和 `pnpm android:build --debug`。前次固定平台输出和dist按原流程原子保全至各attempt的 `prior-outputs/`，不是清空target或cache。新输出有独立 `generated-outputs.json`，收集核对的是本次新生成身份。

环境固定SDK `/Users/water/Library/Android/sdk`、NDK `/Users/water/Library/Android/sdk/ndk/27.2.12479018`、Java `/opt/zerobrew/opt/openjdk@17`、Gradle cache `/private/tmp/notes-scan-gradle-home`、`CARGO_NET_OFFLINE=true`、`CARGO_BUILD_JOBS=2`。Android另固定只读overlay `/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro` 和 `GRADLE_OPTS=-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false`，由本次nonce临时init验证offline／workers／禁用配置缓存。冻结另封存工具字节／版本／环境、现有完整Gradle distribution及完成标记、OCR AAR／25模型和overlay；不声明操作系统、完整SDK或全部传递依赖可重现。

| 平台 | 本轮冻结文件SHA256 | attempt nonce | collector |
| --- | --- | --- | --- |
| Mac17 | `dfa932f257dbb4b74fc042c69ab9555c848510de761413d77cf0f9690b948d22` | `83091f632e594623b98b14ff8ec42732` | ready=true |
| Android12 | `1e0aced0d618087fd17ec496d55fc01b92dc4f76370910f5d333ce2222f5c01e` | `c459c9c1deff40baaa5d0fc6bbc10ff2` | ready=true |

两端构建与收集的全部15项输入比较均true，补充输入前后不变。Mac原始linker adhoc包严格签名验证失败及原始日志保留；独立adhoc派生包strict/deep验证成功，不具有DeveloperID、公证或TCC许可结论。Android仅完成APK、ABI、模型及既有调试证书核对，本轮没有安装、启动或操作用户保留的Android现场，没有采集／播放音频或运行设备验收。

本目录及两个构建说明不代写独立复核结论。Mac17 GUI／编辑／已保存卡播放等运行证据由root另行记录，不以build/collect的ready推导活动采集、麦克风、持久化或像素验收。本目录 [evidence-index.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/evidence-index.json) 仅纳本目录说明、输入计划和两授权文件，排除索引自身。
