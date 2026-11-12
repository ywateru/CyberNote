# Notes 4.13：实际接入的 Speech 路径

检查日期：2026-11-08。目标与上一轮相同：macOS 26.4 / `25E246`，Notes 4.13 / `3146.101.28`，主程序 SHA-256 `9e20c23a979367362c50edf8fb28bb1988be7e7384254cc3dce38a4a8373df02`。本报告只负责系统 Notes 的静态路径，独立应用的公开 API 运行实验见本目录主报告。

## 可以明确回答的部分

**本机找到的普通录音实时转写路径，是 NotesShared → 内部 `Speech.Transcriber` + `Speech.SpeechAnalyzer` 接口，不是直接构造 SDK 公开的 `SpeechTranscriber`。** 它使用 `TaskHint.liveTranscription`、临时结果、时间范围和多分段结果，属于流式识别；“实时”描述输入/结果的时序，本身不表示在线服务。

公开 `SpeechTranscriber` 和 Notes 使用的内部 `Transcriber` 在该版 Speech.framework 中都进入 `TranscriberCommon` 核心。这支持它们属于同一代 SpeechAnalyzer 技术体系；**不证明两个入口选取完全相同模型、所有参数或结果格式**。

结合 Apple 对 SpeechAnalyzer 设备端运行的官方说明，最合理的技术归类是“Apple 设备端 SpeechAnalyzer 技术栈的系统内部接入”，不能把它归为“因为实时所以在线”。本次没有对 Notes 自身录音、抓包、断网或跟踪推理进程，因此对 Notes 某次实际识别“没有任何网络传输”的判断仍未完成实验验证。

这里的“不是直接构造公开类”限定于已追踪的构造和调用点。没有解析全部间接调用、所有 Notes 模块和所有系统条件，不能据此宣称 Notes 进程绝不调用公开类或永远没有其他识别分支。

## 比上一轮更强的证据

上一轮主要看到类名、导入与导出。本轮进一步解析了 Apple arm64e auth stubs 的跳转目标：

1. 从 `dyld_info -disassemble NotesShared` 找到实际 `BL`。
2. 对四条指令形态的 auth stub，解出其加载指针的 cache VA。
3. 读取各 dyld subcache 的 `mappingWithSlide` 表，定位实际文件和偏移。
4. 读取对应 `dyld_cache_slide_info5`，使用其中的 `value_add`（本机 `0x180000000`），**遍历该页 rebase chain，验证指针槽确实是链成员**。
5. 按 SDK `mach-o/fixup-chains.h` 的 34-bit `runtimeOffset` 解出静态无 slide 目标；对非 auth 值也处理 high8。
6. 将目标地址与当前 Speech.framework 的**精确导出地址**匹配，并用 `swift-demangle` 核对签名。

结果是 **121 个直接 BL 到 Speech 导出的调用点、89 个 Speech 全局/枚举引用**，全部通过 slide-v5 chain membership 检查。它们是静态调用观察，不是运行轨迹，也不是完整调用图。完整 JSON 见 [notes-verified-speech-calls.json](evidence/notes-verified-speech-calls.json)。

## 普通实时录音构造的具体接口

`LiveTranscriptionCoordinator(attachmentModel:)` 的实现从 `0x1D9212528` 进入内部初始化代码，在 `0x1D9219408` 获取 `SiriTranscriptionMethod` 元数据并分配实例，存入协调器对象。对应汇编见 [NotesShared 重点范围](evidence/notes-shared-disassembly-focused.txt)。这条已检查的普通构造路径没有在该分配点选择另一种转写方法。

`SiriSpeechRecognitionManager.setUpAudioTask` 的 async 方法入口可由其 Swift method descriptor 追到 `0x1D9209E5C`；方法名、描述符和 thunk 均已在上一轮导出记录出现。相对指针的原始字节与两步地址计算见 [notes-setup-method-descriptor.json](evidence/notes-setup-method-descriptor.json)。该方法的继续执行范围包含以下已解析的静态调用/全局引用：

| NotesShared 调用/加载地址 | 精确解析结果 |
| --- | --- |
| `0x1D920A600` | `Speech.TaskHint.liveTranscription` 枚举 case |
| `0x1D920A750` | `Speech.Transcriber.ReportingOption.multisegmentResults` |
| `0x1D920A774` | `Speech.Transcriber.ReportingOption.volatileResults` |
| `0x1D920A860` | `Speech.TranscriptionResultAttributeOption.timeRange` |
| `0x1D920A964` / `A988` / `A9A8` | `contextualizedTranscription` / `punctuation` / `emoji` |
| `0x1D920AA2C` | `Speech.Transcriber.init(locale:taskHint:modelOptions:transcriptionOptions:reportingOptions:attributeOptions:)` |
| `0x1D920AA5C` | 获取 `Speech.SpeechAnalyzer` 元数据 |
| `0x1D920AD10` | `Speech.ClientInfo.init(identifier:)` |
| `0x1D920ADF4` | `Speech.SpeechAnalyzer.__allocating_init(client:inputSequence:audioFormat:modules:options:restrictedLogging:analysisContext:volatileRangeChangedHandler:)` |
| `0x1D920B764` | `Speech.AnalyzerInput.init(buffer: AVAudioPCMBuffer)` |
| `0x1D920C93C` | `Speech.Transcriber.multisegmentResults` getter |

这比“存在一个 Siri 类名”更具体：它确认了内部 Transcriber 模块、SpeechAnalyzer、音频 buffer 输入和临时结果的实际代码调用。方法中还使用语音模块的 `bestAvailableAudioFormat`；不能假设输入文件的 24 kHz 就是内部识别格式。

`SiriTranscriptionMethod` 的另一个已追踪准备范围使用相同的 `TaskHint.liveTranscription`（`0x1D9223940`），在 `0x1D9223D50` 构造内部 `Transcriber`，随后引用接收 `inputAudioFile: URL` 的内部 `SpeechAnalyzer` async 初始化接口（`0x1D9223E38`）。说明内部体系也有预录文件路径；不是只有麦克风实时输入。

本机 SDK 26.5 的公开 Swift interface 声明 `SpeechAnalyzer`、`SpeechTranscriber`，但没有声明可通过普通 `import Speech` 使用的 `Transcriber`、`ClientInfo` 或上述完整内部构造签名。见 [公开 SDK 摘录](evidence/notes-public-sdk-interface.txt)。二进制导出可见不等于第三方公开 API。

## 公开类与内部类确实共享核心，但不是同一个入口

Speech.framework 自身的汇编提供了两个独立构造事实，见 [Speech.framework 重点范围](evidence/notes-speech-disassembly-focused.txt)：

- 公开 `SpeechTranscriber.init(...)` 在 `0x1C26CD5FC` 调用 `TranscriberCommon.init(locale:modelOptions:preferredModelTaskNames:assetType:singleUtterance:concatenateUtterances:transcriptionOptions:reportingOptions:attributeOptions:redactLogs:)`。
- 内部 `Transcriber.init(locale:taskHint:...)` 在 `0x1C26D261C` 调用 `TranscriberCommon.init(locale:taskHint:modelOptions:transcriptionOptions:reportingOptions:attributeOptions:)`。

因此准确说法是**两个模块入口共用内部 TranscriberCommon 实现族**，不宜说“SpeechTranscriber 就是调用同一个 Transcriber 对象的简单 wrapper”。Notes 还设置普通公开构造器没有暴露的 taskHint / client / internal reporting 参数。共享核心不能推导成相同权重、相同调度策略或逐字相同输出。

## 关于 NGASR、模型与在线性

`downloadASRModel(NGASR:progress:)` 和 `asrModelNeedsDownload(NGASR:)` 是真实存在的模型资源接口。其代码还检查 `supportsCallTranscription`、`supportsGeneralASR`，构造 `SFEntitledAssetConfig`，调用 `fetchAssetWithConfig:clientIdentifier:progress:completion:` 和 installed-language 查询。

这些证据支持“系统管理语音模型、先检查/准备资源”；**模型下载需要网络不等于推理需要网络**。`NGASR` 这个 Bool 名称也不能当作“是否联网”的开关。当前追踪明确的普通 live 识别 taskHint 是 `liveTranscription`，没有从名字猜测它是通话、Siri 云端或旧 SFSpeechRecognizer 默认听写。

本轮没有恢复该 Bool 在全部调用者中的取值、对应的精确 asset/model ID，也没有恢复 `TranscriberCommon` 的全部模型选择与服务实现。`modelOptions` 为可选默认值也不能单独证明离线。最终报告应把“内部实时接口已静态确认”“官方设备端技术说明”“自己的程序设备端调用成功”“Notes 自身未做断网/抓包”分开写。

## 可复现方式与文件边界

在同一系统版本的 Apple Silicon Mac 上，从仓库根目录运行（输出文件必须不存在）：

```sh
python3 labs/2026-11-08-notes-speech-api-probe/resolve-notes-calls.py \
  --out /tmp/notes-speech-calls-recheck.json
```

脚本不加载 Notes 或 Speech 到目标进程，不操作 UI、麦克风或个人数据库。它会重新运行 `dyld_info` 静态命令、读取 cache、校验 slide chain 并生成 JSON。当前系统外的格式或地址变化应重新检查身份，不能复用这里的地址。

本轮已从系统重新采集并重跑该脚本，第二次生成的 JSON 与保留版本完全相同，见 [notes-static-validation.json](evidence/notes-static-validation.json)。

初始完整反汇编输出体积约47 MB（NotesShared）和28 MB（Speech）；只保留指定地址范围的摘录，完整输出 SHA-256、精确命令见 [notes-static-manifest.json](evidence/notes-static-manifest.json)，摘录规则和校验值见 [notes-projections-manifest.json](evidence/notes-projections-manifest.json)。`--captured` 仅供另行保存了完整原始输出的目录使用，本仓库保留的是裁剪证据。

本轮 REA `inspect_macho` 再次绑定相同主程序身份，原始 Evidence `ev_912626bede73167d3e08ed8ba534a762f2506802b8b387ba165ed8b77fee848a`，汇总投影 `ev_238a117e65b102bcbab81e9592784846a3459f7d34e357dcb72086b440f2a159`，见 [notes-rea-session.json](evidence/notes-rea-session.json)。REA provider 仍没有可用的深度反编译引擎；上面的框架反汇编、cache 解码是独立的 Apple CLI / Python 静态补充，不冒称 REA 反编译源码。已导出证据并关闭本轮 REA 会话。

Apple dyld 数据结构来源：[dyld_cache_format.h](https://github.com/apple-oss-distributions/dyld/blob/main/include/mach-o/dyld_cache_format.h)，以及本机 SDK `usr/include/mach-o/fixup-chains.h` 的 `dyld_chained_ptr_arm64e_shared_cache_rebase` / `auth_rebase`。JSON 保留了每个槽位的原始64位值、实际subcache文件偏移、cache UUID、slide-info version、value_add 与精确目标，不只保留推断后符号。
