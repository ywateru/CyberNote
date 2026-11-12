# SpeechTranscriber 的系统版本、硬件与运行条件

核查日期：2026-11-08。范围：第三方应用可使用的公开 `SpeechTranscriber + SpeechAnalyzer`，以及不满足条件时的选择。Notes 4.13 内部 SPI 的调用路径仍以 [notes-path.md](notes-path.md) 为准，不能将公开 API 的版本表直接套到所有 Notes 历史版本。

## 结论

**公开接口从 26.0 系列系统开始提供；能安装对应系统，并不保证设备能运行 SpeechTranscriber 模型。** Apple 官方文档要求检查设备支持，Apple DTS 也明确建议使用运行时 `isAvailable`，而不是依赖一份完整机型名单。

对当前项目，macOS 新转写后端可优先面向 **Apple Silicon M1 或更新的 Mac、macOS 26+**，但仍必须检测硬件、语言和资源状态。这是根据 Notes 产品公布的支持范围制定的工程目标，不是声称 Apple 已公布同样范围的公开 API 保证。我们直接实测成功的是 **M5 / 32 GiB / macOS 26.4**。

## 系统版本

下表来自 Apple DocC 的 `metadata.platforms`，并用本机 SDK 的声明交叉检查。版本表示接口引入时间，不是每台设备都能加载模型的保证。

| 平台 | SpeechTranscriber + SpeechAnalyzer | DictationTranscriber 降级模块 | 硬件判断 |
| --- | --- | --- | --- |
| macOS | 26.0 起 | 26.0 起 | 必须检测；本实验只实测 M5 |
| iOS / iPhone | 26.0 起 | 26.0 起 | 必须检测；不能将 iOS 26 支持机型等同于模型支持机型 |
| iPadOS / iPad | 26.0 起 | 26.0 起 | 必须检测；本次未取得公开 API 的完整机型表 |
| Mac Catalyst | 26.0 起 | 26.0 起 | 必须检测宿主设备能力 |
| tvOS | 26.0 起 | 不提供 | 接口存在不保证每款 Apple TV 的模型支持 |
| visionOS | 26.0 起 | 26.0 起 | 必须检测；本次没有 Vision 硬件实测 |
| watchOS | 不提供 | 不提供 | SDK 标记 unavailable |
| Android / Windows | 无对应 Apple 公开 SDK | 无对应 Apple 公开 SDK | 不能直接移植这套系统接口或由此获得模型分发能力 |

因此 **macOS 15、iOS/iPadOS 18 等旧系统不能直接调用这些新类**，即使设备芯片足够新也一样。Notes 在较早系统已经提供转写，不表示其当时使用的内部接口已经向第三方开放。

证据：[SpeechTranscriber DocC](evidence/apple-speechtranscriber.json)、[SpeechAnalyzer DocC](evidence/apple-speechanalyzer.json)、[DictationTranscriber DocC](evidence/availability/dictationtranscriber.json)、[本机 SDK 声明摘录](evidence/availability/sdk-availability.json)。DocC 的 `availableLanguages` 是文档的本地化语言，不是识别模型支持语言列表。

## 硬件：哪些可以确定，哪些仍需检测

Apple DTS 工程师 Greg 在 2025 年 10 月关于 iPhone/iPad 支持机型的[答复](https://developer.apple.com/forums/thread/802863)中说明：

> We typically do not publish such lists. Instead, we recommend that you use the isAvailable check at runtime, and design a fallback experience if not available.

这是一条官方支持建议，不能据此编造最低芯片、内存、ANE 算力或者完整设备名单。[摘录与采集方式](evidence/availability/apple-dts-hardware-verified.json)已保存；早先直接抓取论坛的文件遇到人机验证，没有取得正文，不作为这条答复的证据。

| 对象 | 可核实的条件或结果 | 证据边界 |
| --- | --- | --- |
| 公开 SpeechTranscriber | `isAvailable` 反映当前设备硬件和能力；`supportedLocales` 在设备不支持时为空 | API 文档的正式检测方式，不是固定芯片名单 |
| Mac 上的 Notes 音频转写 | Apple macOS 26 版指南明确要求 M1 或更新的 Mac，并有语言条件 | Notes 产品支持声明，不是第三方 API 的完整兼容承诺 |
| iPhone 上的 Notes 音频转写 | Apple iOS 26 版指南明确要求 iPhone 12 或更新机型，并有语言条件 | 同上；不能仅据此推导所有 SE 型号或同代芯片的其他产品 |
| iPad / Apple TV / Vision 的公开 API | 系统版本元数据明确；本次没有找到逐款完整硬件支持表 | 不自行写成“所有 iPad”或“全部 A14+ 设备” |
| 本实验 Mac | Mac17,4、Apple M5、32 GiB、macOS 26.4；中文文件、实时 PCM、独立沙箱应用均成功 | 一台设备实测；32 GiB 不是最低内存要求，不能推导其他机器的速度 |
| Intel Mac | 本次没有 Intel 实机验证，也未取得公开 API 对全部 Intel 的兼容承诺 | 能安装 macOS 26 不能作为支持证明；应准备降级 |
| 模拟器 | 论坛有用户报告早期 iOS 26.1 模拟器不可用 | 用户报告不是所有后续模拟器版本的官方契约；应以目标真机验收 |

Notes 产品来源：[Mac 指南（固定 macOS 26）](https://support.apple.com/guide/notes/record-and-transcribe-audio-apdb5106e334/4.12/mac/26)、[iPhone 指南（固定 iOS 26）](https://support.apple.com/en-gb/guide/iphone/iphbe11247b5/26/ios/26)。对应本地摘录：[Mac](evidence/availability/notes-macos26.json)、[iPhone](evidence/availability/notes-iphone26.json)。

**基础转写不应套用 Apple Intelligence 的硬件门槛。** 例如 Notes 的 iPhone 产品要求是 iPhone 12 起，而摘要有另外的 Apple Intelligence 条件。识别、摘要是两个能力，项目也应分别检测。

## 语言和模型资源也是可用条件

Notes 上述两份产品指南列出英语、西班牙语、葡萄牙语、意大利语、法语、德语、日语、韩语、简体中文、繁体中文，并要求设置相应设备语言。这是 Notes 的产品条件；自有应用应根据请求的 locale 查询 API，不应直接把系统 UI 语言当成唯一识别语言。

公开 API 应按以下顺序判断：

1. 系统版本符合 `#available`，且当前平台提供相应类。
2. `SpeechTranscriber.isAvailable == true`：硬件与能力支持。
3. `await SpeechTranscriber.supportedLocale(equivalentTo:)` 有匹配：当前设备支持请求语言。不要仅比较 `zh-CN` 与 `zh_CN` 的原始字符串。
4. `await AssetInventory.status(forModules:)` 检查模块资源；需要时请求安装或下载。
5. 实际准备、推理仍需处理错误、取消和资源不足，不能把前面的检查当成成功保证。

`supportedLocales` 包含可下载但尚未安装的语言；`installedLocales` 也不能替代指定模块的资源状态。本实验曾出现中文在 installedLocales 中、模块却仍为 supported 的情况，完成资源准备后才成为 installed。首次资源下载可能需要网络；这不改变转写模型在设备端运行的性质。

这些检测已在 [SpeechProbe.swift](SpeechProbe.swift) 实现。现有探针没有指定文件时仅检查，不下载模型：

```sh
sh labs/2026-11-08-notes-speech-api-probe/build.sh
labs/2026-11-08-notes-speech-api-probe/.build/SpeechProbe --locale zh-CN
```

它输出 OS、`available`、支持/已安装的 locale 和模块状态。当前构建脚本生成 arm64、最低 macOS 26.0 的程序，因此不能拿这个二进制在 Intel 或旧系统上无法启动的现象，作为 API 本身硬件限制的独立证据。通用应用应把版本检测放在调用新接口之前；探针本身就是要求 macOS 26 的实验宿主。

## 不满足条件时的降级

| 情况 | 可选方案 | 限制 |
| --- | --- | --- |
| 系统 26+，但 SpeechTranscriber 硬件或语言不支持 | 检查 DictationTranscriber 自身的支持语言与资源，再决定是否使用 | 官方定位是兼容较旧硬件；仍要求系统 26+；tvOS/watchOS 不提供 |
| macOS <26 或 iOS/iPadOS <26 | 使用旧 SFSpeechRecognizer，或独立跨平台识别引擎 | 旧接口的设备端模型支持需单独检查，不等于新模型能力 |
| Android / Windows | 使用相应平台识别接口，或可合法分发的独立模型与推理库 | Apple 的 Speech API 不能直接运行于这些系统 |

DictationTranscriber 使用与系统听写 / SFSpeechRecognizer 设备端模式相同的模型，不支持那些 SFSpeechRecognizer 只能联网识别的语言。因此它是较旧**硬件**的备选，并非把新 API 带回旧系统，也不是自动云端回退。

旧接口的 `supportsOnDeviceRecognition` 属性自 iOS/iPadOS/Mac Catalyst 13.0、macOS 10.15、visionOS 1.0 起提供。要求本地处理时，应先检查该属性，再使用请求的 `requiresOnDeviceRecognition`；不具备本地能力时不能静默把私人录音转交网络服务。

## 官方来源与验证范围

- [SpeechTranscriber](https://developer.apple.com/documentation/speech/speechtranscriber)：系统元数据、设备支持检测和 DictationTranscriber 建议。
- [isAvailable](https://developer.apple.com/documentation/speech/speechtranscriber/isavailable) / [supportedLocales](https://developer.apple.com/documentation/speech/speechtranscriber/supportedlocales)：硬件能力与语言的检测契约；本地 DocC 在 evidence/availability 中。
- [Apple DTS 硬件答复](https://developer.apple.com/forums/thread/802863)：建议运行时检查，不提供完整机型名单。
- [WWDC25 Session 277](https://developer.apple.com/videos/play/wwdc2025/277/)：新模型为设备端，具有硬件条件；介绍 DictationTranscriber 降级路径。
- [DictationTranscriber](https://developer.apple.com/documentation/speech/dictationtranscriber) / [旧接口本地识别检测](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition)。

本轮核查了公开文档、DTS 答复与本机 SDK，整理既有 M5 实测，没有新增 iPhone/iPad/Intel/TV/Vision 实机测试，也没有把早期模拟器用户反馈提升为官方设备限制。没有修改已经绑定 SHA-256 的探针源码或重跑无关的识别用例。
