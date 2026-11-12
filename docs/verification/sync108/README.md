# Sync108 三端原生验收

此目录保存本轮两原生桌面 App + 三星 Android 9 隔离包的执行说明及结果。当前 **run02 的 3P-01 已实测通过；3P-02 在 Android 输入前因工具导航失败，run03 在桌面 Ready 超时；等待协调者明确最新 PageLoad Ready binary / source freeze 后同根续测**。各次原始失败保留，不能把静态检查或准备结果作为四项通过。

## 所有权与真实边界

- Android 子任务唯一操作 serial `98895a3147304c3132`，仅控制 `com.local.notesclone.sync108`。原 `com.local.notesclone` 不读取、不停止、不覆盖、不清理。准备轮已有的两个合成 smoke note 保留，允许随配对合并；只按本次创建的 ID 断言，不以全局精确笔记数作为三端通过条件。
- 桌面 NativeApp 来自 Dewey 已提交的 `0897543db8b6246497fcfba0f93c9157b0903732`，ready handoff 修正来自 `af1ac64a`。Android 分支分别 cherry-pick 为 `b5ac2fae`、`6fcffd87`。suite 不复制作者未提交源码作为证明。
- 后续协议加固来自 `564e85b9`；有界 Ready 诊断来自 `cbf299d9`、`a7f4b52c`，导航探测与窗口位置 hook 来自 `4d5df08b`。suite 指定 A left / B right，并只读检查两个原生 webview 的真实 rAF/timer 时钟；诊断不能替代 Ready 成功。
- A/B 使用同一个冻结 binary 的独立拷贝、两个全新绝对 data-dir 和独立原生 PID，静态前端原点必须是 `tauri://localhost` 或 `http://tauri.localhost`。不使用 Vite 服务或浏览器替代桌面 App。
- A 是集合点。B 通过桌面 loopback 配对到 A，C 通过本轮动态分配的 `adb -s SERIAL reverse --no-rebind tcp:0 tcp:A_PORT` 访问 A。邀请仅在内存中转交，不写 argv、输出、snapshot、文件或邀请 hash。
- 桌面文字走 debug 注册的真实 App handler；附件走真实 `attachment.choose` 捕获目标，再由 `DataTransfer` 构造真实 FileList 并 dispatch 原 file input 的 change，进入产品 FileReader / AttachmentSubmission / 原文件存储 / 正文保存 ACK。仅 OS 文件选择窗口的打开被临时抑制。没有 SQL 写入或伪造 ACK。
- 手机使用原生 App 中 CDP Input 点击和输入，观察仅使用只读 Tauri invoke / editor document。APK 的产品源码仍是准备轮完整快照；新增桌面 startup/hook 只影响桌面测试入口。对应 Android 指纹见 `../sync108-android/verification.json`。

## Case 与断言

| ID | 场景 | 必须满足 |
| --- | --- | --- |
| 3P-01 | A → B/C，带 PNG 的格式正文 | 完整 document 深相等、plainText 相等、heading/bold/list 保留，附件 ID 被正文引用，三端 read_attachment 原字节 SHA/长度相等；C 实际打开笔记后的 editor document 相等。 |
| 3P-02 | C 真实 UI 新建 → A → B | CDP Input 创建独立标题和两段中文正文；三端按本次 ID 比较完整 document/plainText。 |
| 3P-03 | B → A → C 文本与普通二进制文件 | 正文完整一致，包含中文、CRLF/NUL/全字节范围的普通文件原字节经 read_attachment 核对 SHA/长度。B 和 C 不建立直连。 |
| 3P-04 | C 后台退出、离线期间 A 新建 PNG、C 启动自动补齐 | 先 Home 再标准 `am kill PACKAGE` 回收后台进程，避免 force-stop 或清数据；离线新增先到 B。C 正常 am start 后 PID 改变，设备身份保留；不发立即同步、resume 或新配对。完整正文和 PNG 自动到达，前面所有测试 ID 在 B/C 仍完整，原附件 SHA 不变。 |

`am kill` 是 Android 标准后台进程回收边界；桌面进程则必须通过实际保存/idle 后的 NativeApp close 自然退出。若 Android 未回收，suite 失败，不自动升级为 force-stop。后台/前台方法只允许本轮包为前台时 Home；不会打开原 App。

## 冻结输入与运行

**不再执行旧 binary；等待协调者给出最新 PageLoad Ready 构建的 SHA/manifest。** 后续 evidence output 必须全新，但通过 continuation 保留 run02 两个原始 Store 及手机配对：

```sh
node scripts/verification/sync108-three-peers.mjs \
  --binary /private/tmp/cybernote-sync108-target/debug/notes-clone \
  --root /ABS/FROZEN_SOURCE_ROOT \
  --output /private/tmp/sync108-three-20261112-04 \
  --build-record /ABS/FROZEN_BUILD_RECORD.json \
  --continue-from /private/tmp/sync108-three-20261112-02
```

fresh output 必须不存在，不能复用任何双端 suite 目录。build record 必须包含 `binary.sha256`、`sourceSha256`、`staticFrontendSha256`，分别匹配 binary、已提交双端 runner 同算法的源码清单 hash、dist 文件清单 hash。suite 验证这些值后才拷贝启动进程，结束时重新核对源码/dist/owned binary 没有漂移。APK 指纹单独记录，不混为桌面 binary 的源码证明。

若 continuation 改用协调者授权的新 Ready hook 构建，build record 还需显式提供 `continuationBuild.previousResultSHA256`、`continuationBuild.previousBinarySHA256`，分别精确匹配原 run02 证据和旧 binary，`continuationBuild.reason` 固定为 `test-feature-ready-fix`。结果记录旧→新构建变化；新 binary/source/dist 的冻结校验不变。原始路径必须仍为 run02 `store-A` / `store-B`，原 A/B/C device/workspace 身份、A/C 连接端点均验证不变，不调用新配对，不 clear/reinstall C。

Android `createNote` 先经真实返回按钮回到列表，再点击新建，读取新增 ID；只在对应 `.tiptap[data-note-id="ID"][contenteditable="true"]` 可见且取得焦点后发送 Input。保存按同一 ID 等待标题/各段正文；suite 继续检查三端完整 document/plainText 深相等。超时保留 phase/selector/code，新建 ID 已知时只读记录其完整正文规范化 hash，区分 Input、保存和 convergence。多个新增 ID 会明确报歧义，不猜测 owner。

源码清单算法与 `sync108-native.mjs` 保持相同，纳入 App/Rust/plugin/lock/config/native-driver 输入，明细写入结果。CLI 不默认使用任何 binary；`--help` 无启动或手机操作副作用。

## 证据与清理

fresh output 的 `result.json` 记录固定 case 名、状态、PID/data-dir、冻结指纹、完整 document/plainText 的规范化 SHA、原附件 SHA/长度、实际拓扑和清理结果。仅合成原附件文件另存本地，正文与邀请不进入公共诊断日志。失败保留 case 和安全错误分类，不记录原始异常/stack/原生 stdout/stderr。

finally 清理每个 active CDP forward、owned reverse。准备轮 `tcp:59445 → webview_devtools_remote_23814` 已在 run01 精确确认归属后清理，续测不再传 retained-forward。不会调用 remove-all、按包名/端口批量杀进程或删目录。A/B 两个实际进程通过 NativeApp close 保存后自然退出；若降级到信号或协议关闭未成功则清理标记失败。手机 App 和全部合成数据保留。

执行后本目录再加入结果摘要与本地 `result.json` 的 hash/路径，包含所有失败尝试及后续修复，不能把未执行或未通过 case 标为完成。

各次原始失败及当前定位见 [attempts.md](attempts.md)。
