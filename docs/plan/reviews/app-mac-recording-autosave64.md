---
id: app-mac-recording-autosave64-review
scope: independent recording pause checkpoints and safe close
status: passed-with-scope-limits
source: 367635a54d781752e8b03051b52ee767c40d7822
---

# Mac 录音自动保存64独立审查

结论：在下述独立验证的64边界内，没有剩余阻断发现。允许root继续整合与后续Mac18原生验收；这不代表真实Mac WKWebView、真实麦克风、双原生窗口或像素验收通过。本次仅新增独审脚本、结果和说明，没有改产品源。

## 准确来源与证据复用

独审树 `/private/tmp/apple-notes-mac-recording-autosave64-independent-01`，分支 `verify/mac-recording-autosave64`。最终冻结源 `367635a54d781752e8b03051b52ee767c40d7822`，对应作者 `4a2cb6ad`、`66cc6847`、`de6e86c3` 的整合结果。最终边界、App与回归执行均确认开始/结束HEAD一致。

证据入口为 `docs/verification/mac-recording-autosave64-independent/README.md`，索引为该目录的 `evidence-index.json`。`frontend-367635a5/source-binding.json` 记录源码比较、单文件哈希与复用理由：

- Store/Session的20个生产输入与 `backend-base58fe1110-attempt01` 的准确源逐字节相同，因此复用其真实SQLite/文件、四次live worker SIGKILL及14组通过结果。没有把受控JS host当成Rust持久化证据。
- 真实合成音频浏览器运行冻结于 `8b77a62c47e76fc5c2c52cd18986101fec9f0b7a`。比较69项src/package/lock/config输入后，最终367仅 `desktop-recording-session.ts` 的analyser异常catch增加3行：先记住错误并seal，再通知UI；最终367的独立边界测试新增对应故障覆盖。root已批准复用该准确8b77的正常媒体运行，无需重复声称在367跑过浏览器。
- 移动RecordingPanel函数体、参数，App移动RecordingPanel JSX、旧submitRecording与validatePickerTarget闭包均与58fe基线相同。共享RecordingSession仅导出callbacks类型和browserEnvironment；运行时实现相同。

## 独立结果

| 检查 | 准确源 | 结果与直接证据 |
| --- | --- | --- |
| 生产Session、PCM、Relay、Revisions、Owner受控边界 | 367635a5 | 11组通过；`frontend-367635a5/boundaries-attempt02/result.json` |
| 实际App闭包、真实PM、SaveQueue、AccessGate、Revisions/Replacement | 367635a5 | 7组通过；`frontend-367635a5/app-attempt01/result.json` |
| 挂载生产Window/Panel/Owner，真实MediaRecorder与AudioContext | 8b77a62c，按上节差异复用 | 4组通过；`frontend-8b77a62c/browser-attempt01/result.json` |
| 实际Store/Session、SQLite/文件及SIGKILL后重开 | 58fe1110，20输入相同 | 14组通过；`backend-base58fe1110-attempt01/result.json` |
| 既有移动Session / Preview | 367635a5 | 26 / 19组通过；`frontend-367635a5/regressions-recorded01/` 保存完整stdout/stderr |
| pnpm typecheck | 367635a5 | exit 0；同上commands与完整日志 |

前端边界证明暂停等待真实terminal data/onstop，继续在同一stream中新建recorder，错误/迟到事件保留完整原分段供重试；analyser故障先seal再通知，尾段仍可checkpoint。已验证解码失败同Blob重试不重复append、精确PCM little-endian/stereo混音/非法rate和sample拒绝、100MiB边界、旧ACK隔离、同revision相同transfer重试、checkpoint非terminal、Close屏障与唯一final销毁归属。

App使用实际生产闭包和实际PM/SaveQueue等模块，仅平台I/O、React状态和Editor onChange宿主受控。其保存host先真实修改保存文档，再由显式query检查引用，将journal标记committed；已删除旧fixture中“saveNote自动committed”的错误简化。覆盖A停放后的最新编辑、B编辑与焦点保持、query等待期间删除/外部版本失效拒绝ACK、query失败同op重试、替换正文保存失败无重复、旧卡删除不回退插入、原位替换保留选择/属性、重复上一ID拒绝。完整adapted fixture与逐项host变更清单已保存。

浏览器使用headless Chrome，oscillator→MediaStreamDestination→真实MediaRecorder→生产decode/WAV，挂载生产RecordingWindow、DesktopRecordingPanel及Owner。两次start/stop仅一次authorize/getStream，1.3秒暂停不进入PCM；checkpoint保存后保持窗口，保存中Close排队，旧ACK不能关窗，准确final ACK后唯一销毁；destroy失败后显式重试不重存。生成24,000Hz、mono、PCM16 WAV：第一版11,520帧/0.48秒/23,084字节，第二版23,040帧/0.96秒/46,124字节，final与第二版完全同字节。RMS约0.1408；第一版PCM是累计版精确前缀，`synth-media-byte-followup.json` 记录断言与SHA256。此处“可播放”指实际浏览器解码及非静音PCM检查，不是人耳听验。

Store独审确认：真实正文save ACK不会更新journal，query才将旧版committed；同op等长不同WAV字节被拒绝；旧committed物理文件保留供历史引用。四个live worker被SIGKILL后重开：新候选未ACK被清除而旧版保留；最新正文ACK未query可恢复committed；两版committed均保留；负对照旧版ACK但未query被替换后会清除，证明query屏障必要性。新Session不能接管旧op。崩溃注入在公开Store/Session边界，不覆盖单次文件写入内部断点。

## 尝试记录与边界

保留所有旧尝试和失败，不能将它们计作最终准确源通过：

- `frontend-f1044762/boundaries-attempt01` 为最初f104源10组通过，之后由最终11组覆盖。
- `frontend-f1044762/browser-attempt01` 因本地server EPERM未执行产品。
- `frontend-f1044762/browser-attempt02` 前3组通过、destroy重试超时，但运行中root将HEAD从f104改为8b77；属于混合源探索记录，不用于确定源的通过或失败结论。后续准确8b77运行通过4组。
- `frontend-8b77a62c/app-attempt01` 第5组停止是独审host只注入一次save失败、生产awaitAttachment立即重试成功，与测试期望不符；改为两次失败后在最终367通过全部7组。
- `frontend-367635a5/boundaries-attempt01` 是独审仍期待receive(final)在在途提交时返回true。66cc修复已刻意返回false来让唯一提交调用方负责destroy；纠正该期望并检查迟到ACK返回true后attempt02全11组通过。

旧 `check-recording-submit.mjs` generic picker fixture没有注入 `waitRecordingEditorCommit`，但58fe基线App已经引用此依赖，最终App相同；静态比较见source-binding。该缺失名称限制不能当作产品回归，也未声称旧generic picker全矩阵通过。本次没有再次运行其已知失败段。

真实原生窗口/IPC关闭路径、系统红色关闭与Escape的现场行为、真实麦克风/权限、Mac WebKit编码器、float/dock现场、owner退出现场、设备UI与像素一致性不在本轮独审实测范围。没有操作GUI、设备、用户Notes数据、TCC、签名或权限。独立没有重复pnpm build或native路由测试；这两项由作者与root的整合验收单独负责，不能把作者结果计为独立重跑。

100MiB含44-byte WAV header上限在24k mono16下约36分24秒；PCM、decode和base64存在内存副本。旧物理版本为Undo/历史保留，会累积磁盘及归档体积，既有128MiB归档解码总量限制可能早于单段容量触发。本审查没有引入静默清理策略。运行时若无法获得可解码终结容器，可保留raw media供重试，但不能保证该损坏容器或尾段最终可播放。
