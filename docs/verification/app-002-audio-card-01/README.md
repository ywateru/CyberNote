# APP-002-AUDIO-CARD-01 开发候选

2026-11-04，开发分支`task/app-002-audio-card-01`，基线`96b226317d07877db65c6ea215bab73dd4cfb78e`。此目录是开发执行证据，待不同作者独审；不是SOURCE-READY、安装版或像素验收报告。最终提交身份由同分支freeze提交及交接给root的精确SHA确定。

## 交付范围

- RecordingSession第一次实际`recorder.start`成功后，Panel的`onRecording`读取一次`Date.now()`；冻结到同一RecordingResult、File、ticket和operation。暂停、继续、长暂停、收尾、保存重试不重算。
- TS与Rust Attachment接入可选`recordedAt`。UTC整数0..253402300799999，缺失/null未知；非法类型、范围和非audio已知日期明确拒绝。Rust统一反序列化验证覆盖已持久公开行、operation日记和归档；不把非法值静默变未知。
- preparing日记和公开Attachment使用同一元数据快照；重复operation仍比较名字/MIME/size/完整字节，新增日期一致性。原完整Attachment Eq保留。旧行和旧日记无日期不回填、不重写，不改旧媒体、mtime或revision。
- 同一次原note归属/Session受权read返回日期。MediaView把src/name/date绑定到ID，新ID读取期间、晚响应、错误、卸载及在途权限失效不串用旧值；没有新元数据接口或产品明文日志。
- 新程序读归档1/2；有日期导出2，无日期可导出1；v1非空日期、v2非法日期均原子拒绝。重复导入两次分别重映射ID/路径，日期和字节保留。
- 仅手机紧凑卡接真实标题/本地日期/独立总时长。小于60秒向下取整为“音频 · N秒”，60秒以上保留原mm:ss，未知为“音频”。原controller、进度、±15、展开、目标身份、正文ACK和补偿边界不变。Mac保留原“录音 · mm:ss”行。

## 最终检查与真实边界

| 检查 | 最终证据 | 结果与范围 |
| --- | --- | --- |
| TypeScript | `raw/audio-card-typecheck-run03.txt` | exit0 |
| 完整Rust Store/Session | `rust/run05/test.txt`、`metadata.json` | 47 pass / 0 fail / 3 ignored。3项为真实进程中断worker，由边界测试显式用`--exact --ignored`调用；不是未覆盖的普通测试。包含7项新增日期检查、原完整归档/附件补偿/授权回归和96项公开schema语料 |
| 准确Rust CLI编译 | `rust/run05/build.txt`、harness manifest/lock/main及metadata | offline/locked exit0，新命名`notes-audio-card-store`，没有覆盖旧`notes-qa-fix-store` |
| Panel到Rust实际链路 | `audio-card-integration/run07/result.json`及各场景`transport.json` | 5组pass，真实挂载Panel/RecordingSession→实际App AST闭包→production Submission/bridge/SaveQueue→实际Rust Session/Store/SQLite |
| 实际卡片组件 | `audio-card-ui/run03/result.json`、`transport.json`和PNG | 8组pass，实际Editor→ReactNodeView→MediaView→AudioPlayer，production bridge受权读；320/390手机候选布局与1280桌面 |
| 原录音Panel | `audio-card-panel/run02/result.json` | 25组pass，包含暂停预览/继续/重试/清理/窄屏控件 |
| 实际App录音父边界 | `raw/audio-card-parent-run05.txt` | 21组pass；含非法/changed日期及同File/date重试、原目标/ACK/取消/关闭边界 |
| 附件提交 | `raw/audio-card-attachment-run04.txt` | 25组pass；包含改变/未知/非法响应日期拒绝，实际外部audio File的lastModified不进入recordedAt |
| 附件取消 | `raw/audio-card-cancellation-run01.txt` | 8组pass |
| 录音Session与preview | `raw/audio-card-session-run01.txt`、`audio-card-preview-run01.txt` | 26组、16组pass，受控媒体/硬件平台边界 |
| 源码与依赖 | `source-inputs.json`、`probe-inputs.json`、Git diff | package/两锁文件/Cargo manifest字节未变；产品/检查脚本/任务文档`git diff --check`通过；原始stdout按字节保留工具末端空行，普通全目录check仅4条raw EOF空行提示 |

整链路五种场景均在面板已打开且权限等待9秒后才真正开始，观察UTC为`2026-11-03T15:59:59.000Z`；录2.5秒后暂停3天、继续0.1秒再完成，保留最初日期。覆盖：正常保存、首store已落盘但响应丢失、正文ACK两次失败后点击实际“重试”、ACK后refresh失败并仅重试刷新、旧target变化后的晚store响应。每组核对一个store operation、原attachment/date/全字节，改变日期或known→unknown重复请求冲突且正文/文件不变；四组已ACK录音关闭Rust进程并冷启，再由新token读取同日期/字节。旧target组零插入、不进入另一个笔记；未对未引用op冷启，因为既有恢复会进行安全补偿。Panel重试还直接核对浏览器同一Result/File对象，跨host传输后Node端复用同一个实际File。

Rust新增中断测试在真实`after_prepare`和`after_store_commit`分别令子进程exit78，再在任何Store恢复前读取SQLite：preparing已有日期且尚无公开行/媒体文件；stored的公开body与日记body完全相同、媒体全字节相同。旧JSON缺字段/显式null读取不重写；非法string/fraction/negative/out-of-range及非audio持久值明确出错、原JSON/文件保全；0与最大未来值均接受。v1兼容、v2两次导入/再次导出、ID/路径重映射、非法导入原子拒绝均由真实Store验证。

UI八组覆盖：已知日期/实际长标题/2.60→2秒而当前进度1.75→0:01；320/390三行、播放白胶囊44px触点、标题省略且不覆盖按钮；旧未知省略日期且66.2→1:06；换ID后新节点已渲染但read未返回时无旧日期；晚read不回填旧值；真实错误与后续读取恢复；在途access失效；卸载晚响应；桌面隐藏手机日期和总时长。开发者已目检320手机和1280桌面PNG。卡高81 CSS px、标题15/19、次级12/16、内距/gap12均为候选自身尺寸，原片188×42源像素不能直接换算为误差。

## 复跑命令与身份

在本worktree根执行；只使用已存在依赖/浏览器和root明确独占分配的Rust target，不下载、不升级、不复制target。每个输出阶段检查≥2GiB。最终证据封存时空间见`environment.json`。

```sh
AUDIO_CARD_RUST_FILTER='' CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target python3 scripts/check-audio-card-store.py artifacts/audio-card-rust/run05

NOTES_AUDIO_CARD_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-audio-card-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-audio-card-integration.mjs artifacts/audio-card-integration/run07

NOTES_AUDIO_CARD_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-audio-card-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-audio-card-ui.mjs artifacts/audio-card-ui/run03

PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-panel-browser.mjs artifacts/audio-card-panel/run02

pnpm typecheck
node scripts/check-recording-submit.mjs
node scripts/check-attachment-submission.mjs
node scripts/check-attachment-cancellation.mjs
node scripts/check-recording-session.mjs
node scripts/check-recording-preview.mjs
```

使用新输出目录复跑，Rust脚本拒绝覆盖已有目录。脚本从Git取极小的历史合成归档/密文夹具，复制准确当前Store/Session源码到隔离harness后编译，逐文件SHA记录于各run metadata；最初的symlink方式在稀疏checkout下无法解析include路径，后改为精确复制，不补开历史产品目录。CLI只替代本地host IPC运输层，实际调用原Session token/窗口owner/save intent/敏感读取路径与Store。它不编译Tauri宏或原生宿主，不能替代完整应用构建。

最终CLI：6,005,016 bytes，SHA256 `7bb32046299ad9c0ec7432825a7e9d0f9e9eca2f8013732efda03f929a496308`。浏览器Chrome `156.0.8078.80`，时区Asia/Shanghai，手机390×844与320×844、桌面1280×800 CSS px，工具版本见`environment.json`。`source-inputs.json`含238项产品输入，聚合SHA256 `5d1690457ff9dfca2905309e495a28583173e47744984087ba181a85177af295`；`probe-inputs.json`记录执行脚本精确字节。聚合算法为排序后`sha256 + 两空格 + 路径 + 换行`的UTF-8再SHA256。

## 首失败保全与修正

所有捕获的失败原文保留在`raw/`和`rust/run01..run04/`，未以最终成功覆盖。初次相同typecheck失败的捕获重跑在run01，4处MediaView nullable缩窄修正后run02/03通过。

- Rust run01：symlink源码的include路径找不到稀疏checkout历史夹具；改为准确源码复制与Git中的小型合成夹具。
- Rust run02：新测试错误期望未引用op重启后仍stored；既有恢复会补偿未引用操作，改为真实正文引用后验证committed冷启，原补偿契约没有改。
- Rust run04全回归：旧“不支持version2”用例随着本任务支持2而过时，改用99；密文用例所需`.document.json`未物化，补齐既有Git合成夹具。run05全量通过。
- App父检查run01/02：新依赖以及基线tags新增editorSaveSnapshot未在旧AST环境提供；加载真实生产依赖后通过。附件run01旧expected不含可选undefined键，bridge改为未知时不发送日期字段后通过。
- 整链路run01本机监听被权限隔离拒绝，后续通过已授权的本机临时服务/浏览器执行；run02/03为ACK失败注入次数和实际“重试”按钮名称假设错误；run04/05刷新注入错误使用notes[0]，真实Store排序会变化，改按原note ID查找。run06通过，run07对最终源码/新编译CLI再次通过。并发浏览器曾报告Vite热更新端口被占用，最终两个检查串行执行且无此警告。失败时可得transport保留；早期未封存的在途DB不作为证据。
- UI run01把PM事务dispatch返回当React NodeView已同步刷新，断言时DOM仍是原节点。改为明确等待新ID标题渲染、扣住新read，再断言无旧日期；run02/03通过，产品ID绑定逻辑未为此改动。
- Panel run01在媒体ready后的React渲染前立即`isEnabled`断言，改为等待实际按钮就绪；run02原25组全通过，播放器逻辑不变。

## 仍未证明

本批无原生GUI、ADB、平台构建、安装、新设备录音、用户数据/音频复制或外网请求。所有音频字节为本检查生成的合成占位，HTML媒体与采集事件受控；不证明编码可播放、可听、麦克风有效收音或原生音轨通过。App保存闭包通过AST执行，React setters/Editor command host受控；App壳未挂载。真实Tauri命令传输、Mac/Android新包、原生权限/生命周期与设备冷启由root后续验证。

原版录屏低清、仅亮色有限帧；原版取时点、长录音/小时边界、展开/暂停/拖动/±15/菜单手势、深色及所有高清像素一致性继续unknown。没有对原片内容/文字/边缘做遮罩，也没有给出像素通过分数。本候选日期是明确的应用工程语义，不冒充原版尚未实证的时间规则。
