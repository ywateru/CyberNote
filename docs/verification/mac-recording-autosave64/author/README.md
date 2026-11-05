# Mac 暂停/关闭自动保存64：作者验证

产品源：`de6e86c3dc2856a1e53c3e79f34f74484fe1fe8f`，基于 `4a2cb6ad`（首轮实现），包含 `66cc6847`（在途final提交唯一负责destroy）和 `de6e86c3`（analyser异常先封口采集）。本目录为作者证据；独立审查与真正Mac打包/现场验证另行记录。源码与脚本SHA-256见 `source-manifest.json`。

## 通过项目

- `app-closures.json`：8组。运行从生产App AST提取的真实闭包、真实PM/history、原SaveQueue、bridge、target gate。多次checkpoint/final仅一张A卡；切B后继续编辑A且不写B/不抢焦点；真实正文ACK和journal query屏障；失败ACK同File/operation重试；旧节点删除、重复、Undo删除拒绝回退插入；query await期间新节点删除或复制不能发布checkpoint ACK。
- `session.json`：8组。生产DesktopRecordingSession及PCM/Relay/Owner；受控平台事件明确保持完整尾段/onstop；同Blob解码失败重试；recorder error尾段；15秒封口超时后迟到尾段保存；零数据失败；analyser异常先停止采集仍保尾段；过期/错误意图ACK不结算；丢失checkpoint回执重放不重保存。
- `browser.json`：8组。Chrome中运行真实MediaRecorder和WebAudio oscillator→MediaStreamDestination，完整两段440/880 Hz经生产session解码累计为24 kHz/mono/16-bit PCM WAV，验证次序、采样率/字节头/时长及不计暂停间隔；实际Editor/live-card隐藏持久版本并在结束后显示唯一最新卡；startup超时迟到stream和context/analyser/recorder/start失败释放；生产RecordingWindow/Panel/Owner暂停ACK不关窗、续录复用stream；Decode/Encode/Save等待中Close排队；保存与destroy失败同File重试且无重复采集/传输/单次销毁重入。
- `native-routing.log`：真实Cargo编译与6组recording_window tests通过（源文件自4a至de6未变）。新组验证checkpoint ACK只放行下一版本、旧/错误意图/非原owner ACK不能final，准确final版本才能终结。没有改SQLite/附件journal实现。
- `typecheck.log`、`build.log`：通过。打包仅出现现有超过500 kB的bundle提示。
- `mobile-save57/result.json`：17组生产App/Host/Gate移动端保存回归通过（纯受控浏览器，未动任何手机）；`legacy-session.log`、`legacy-preview.log`通过。

## 测试修正与保留失败

- App attempt1单次save失败没有导致最终拒绝，因为实际awaitDocumentAck会重试一次；fixture改为连续两次失败后，同File显式重试测试通过。不是产品错误，原raw保留。
- Browser attempt1在本地监听受限环境报EPERM，后续仅本机受控服务权限运行。attempt2定时器缺少Window绑定导致测试环境Illegal invocation，改为箭头函数。attempt3暴露真实destroy双入口重入，产品66cc修复后通过。attempt5新增卡投影测试把插入位置产生的段落分隔符当作文本丢失，改为忽略空白比较后复验通过。原失败文件全部保留。
- `legacy-submit.log`：旧 `check-recording-submit.mjs` 在后半generic picker测试报 `waitRecordingEditorCommit is not defined`，其AST环境未注入已有依赖。没有修改旧脚本，也不宣称该旧全矩阵通过。该脚本saveNote mock还把journal直接改为committed，不能证明64的query屏障。新的独立64 fixture已明确删除该错误mock：只有query查看当前后端已ACK正文才置committed。64 App8组通过。

## 产品边界与开销

固定WAV格式为24 kHz、mono、16-bit little-endian PCM，上限**100 MiB包含44-byte header**，约36分24秒。它是当前工程格式/上限，不能宣称与苹果压缩音频容量一致。各段必须stop完成且收到真实最后dataavailable/onstop后才解码；不拼接压缩容器，不把requestData prefix当完整可播放文件。保存/封口中暂时禁用续录与回放，Close始终排队；笔记编辑/搜索保持可用。

每个版本使用独立不可变operation/attachment；替换前由query确认原版本committed。旧物理音频保留供Undo/历史，因此磁盘和归档容量会随checkpoint增加。内存包含累计Int16 PCM（最多约100 MiB）、WAV字节副本、当前完整压缩分段及解码Float32缓冲区；IPC的base64与双方File也有瞬时复制。没有低内存或固定单文件空间承诺。

本证据不使用真实麦克风、TCC重置、原生GUI、用户Notes或手机。真实媒体检验限Chrome当前WebM/Opus实现；未证明Mac WKWebView所有编码器/实际麦克风、原生双窗口/退出现场、像素一致性，也未提供iOS/Android设备结论。实际SQLite/附件进程kill恢复由独立native检查另存，不能以本fixture替代。没有修改CSS、63诊断、签名/权限策略或DB/schema。

## 复验

在仓库根目录执行：

```sh
node scripts/check-recording-autosave64-app.mjs /tmp/autosave64-author
node scripts/check-recording-autosave64-session.mjs /tmp/autosave64-author
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-autosave64-browser.mjs /tmp/autosave64-author
cargo test --manifest-path src-tauri/Cargo.toml recording_window::tests --offline
pnpm typecheck
pnpm build
```

Vite缓存保持在作者工作树，不纳入git证据。没有删除任何旧工作树、证据或缓存。
