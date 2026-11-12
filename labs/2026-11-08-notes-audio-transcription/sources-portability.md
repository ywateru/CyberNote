# 录音转写的官方资料与跨平台可行性

检索日期：2026-11-08（Asia/Shanghai）。本文是主报告的公开资料补充。没有在 Android、Windows 设备上运行识别器，也没有进行准确率、耗电、时延、离线或长时录音测试。平台支持指官方文档/源码所述能力，不能视为本项目已完成集成。

## Apple：公开功能与公开 API

1. [Notes 用户指南，macOS Tahoe 26 固定版本](https://support.apple.com/guide/notes/record-and-transcribe-audio-apdb5106e334/4.12/mac/26)：支持在笔记里录音、查看/搜索/复制转写、点击转写定位播放。音频转写要求 M1 或更新的 Mac，设备语言为英语、西班牙语、葡萄牙语、意大利语、法语、德语、日语、韩语、简体或繁体中文。具体语言和地区仍需按目标系统版本核对。转写和 Apple Intelligence 摘要是两个功能，不能把摘要的要求套到基础转写上。
2. [WWDC25：Bring advanced speech-to-text to your app with SpeechAnalyzer，Session 277](https://developer.apple.com/videos/play/wwdc2025/277/)：Apple 的 Speech 团队与 Notes 团队明确说明，SpeechAnalyzer / SpeechTranscriber 支撑 Notes、Voice Memos、Journal 等功能。SpeechTranscriber 的新模型针对长音频、对话、远离麦克风的说话者和低时延实时转写设计，模型在设备上运行；语言模型资源由 AssetInventory 下载并在系统存储中管理，首次下载仍需要网络。分析会话以音频时间轴关联输入与结果，允许临时结果和最终结果；模型在应用进程之外运行。该说明是 Apple 对能力与体系的公开解释，不能单独证明某个已安装 Notes 二进制直接调用了哪些公开符号。
3. [SpeechAnalyzer](https://developer.apple.com/documentation/speech/speechanalyzer) 与 [SpeechTranscriber](https://developer.apple.com/documentation/speech/speechtranscriber)：官方文档元数据列出 iOS / iPadOS / Mac Catalyst / macOS / tvOS / visionOS 26.0 起可用，没有 Android 或 Windows 平台。
4. [Speech framework](https://developer.apple.com/documentation/speech)：公开框架用于实时或预录音频识别。旧 SFSpeechRecognizer 与新 SpeechAnalyzer 不是同一代 API。WWDC25 说明旧 API 主要针对短听写，过去某些设备依赖服务器；新 API 的 DictationTranscriber 可为不支持新模型的设备/语言提供另一种转写模块。具体支持应运行时查询，不应只按系统版本判断。

因此，Mac 端可以使用公开 Speech API 实现近似体验；但系统框架、系统服务和 Apple 管理的模型不是可以直接复制到 Android/Windows 的通用 SDK。本机内部 `Speech.Transcriber` 等符号的证据应以主报告 REA 与 dyld 检查为准，不能把内部符号和公开 `SpeechTranscriber` 的名称混为一谈。

## Android：原生系统 API 可用，但设备与引擎差异明显

官方参考：

- [SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer)
- [RecognizerIntent](https://developer.android.com/reference/android/speech/RecognizerIntent)
- [AOSP SpeechRecognizer.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/speech/SpeechRecognizer.java)
- [AOSP RecognizerIntent.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/speech/RecognizerIntent.java)

可用路径与限制：

- Android 12 / API 31 起，`isOnDeviceRecognitionAvailable()` 和 `createOnDeviceSpeechRecognizer()` 提供设备端识别入口。先检测可用性；没有设备端识别服务时创建会失败，不能把 OS 版本当成离线模型已安装的保证。
- API 33 起有识别支持查询、模型下载接口，以及 `RecognizerIntent.EXTRA_AUDIO_SOURCE` 输入已打开的音频描述符等能力。能否识别某种语言、提供分段结果和接受这些可选参数取决于识别服务实现，需要结合 `checkRecognitionSupport()` 等做能力探测。
- 普通 `createSpeechRecognizer()` 由系统所选识别服务处理。AOSP 源码明确警告：实现可能把音频发送远端，普通接口不适合持续识别，因为会消耗带宽与电量。
- `EXTRA_PREFER_OFFLINE` 只是偏好。官方源码明确说它可能对某些识别器没有作用，因此不能用这个参数证明隐私意义上的完全离线。
- `EXTRA_AUDIO_SOURCE` 可以结合 `EXTRA_SEGMENTED_SESSION` 让会话跟随音频流关闭而结束。API 34 有逐词时间戳/置信度请求参数；它们仍是服务能力请求，不能承诺所有厂商、语言与引擎都返回一致结果。

对本项目的含义：Android 原生插件可以作为一个可选识别后端，适合先做能力查询和短录音实验。若产品要求所有目标设备都具备稳定的离线长录音转写，应提供自带模型后端，而非完全依赖系统服务。不要让 WebView 的 MediaRecorder 与原生识别器各自抢占麦克风；优先采用单一采集源并分发 PCM，或先完成录音再提交文件。

## Windows：必须区分三套能力

| 能力 | 官方事实 | 对录音笔记的适用性 |
| --- | --- | --- |
| `Windows.Media.SpeechRecognition.SpeechRecognizer` | Windows 10 起的 WinRT API，支持默认/自定义语法。官方说明预置听写和网页搜索语法由远端服务识别；自定义语法可在设备上使用。 | 可做系统语音输入集成，但不能把短句听写/命令识别等同于离线长音频转写。 |
| Windows Voice typing / Win+H | 官方支持页明确使用 Azure Speech 的在线语音识别，需要互联网和文本输入框。 | 是系统用户输入功能，不是可直接给笔记文件批量转写的离线库。 |
| `Microsoft.Windows.AI.Speech` / `SpeechRecognitionModel` | 新的 Windows AI 本地文件/流式识别 API。当前文档仍标记 experimental，不支持生产，试用应用不应发布 Microsoft Store。 | 适合 labs 实验后端，暂不作为稳定发行版唯一依赖。 |

来源：

- [WinRT SpeechRecognizer](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechrecognition.speechrecognizer?view=winrt-26100)
- [Speech recognition：约束与远端语法说明](https://learn.microsoft.com/en-us/windows/apps/design/input/speech-recognition)
- [Use voice typing to talk instead of type on your PC](https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-fec94565-c4bd-329d-e59a-af033fa5689f)
- [Windows AI Speech Recognition](https://learn.microsoft.com/en-us/windows/ai/apis/speech-recognition)

Windows AI 页面在本次检索时列出的条件与边界：

- Windows 11 24H2（build 26100）或更新；Windows App SDK 2.2.2-experimental9（June 2026 Experimental）或更新的实验版。
- 可在 Copilot+ PC 的 NPU 上运行，也可以在其他兼容 PC 的 CPU 上运行；不是只支持 NPU。GPU 不受支持，硬件选择由系统自动决定。
- NPU 设备预装模型；CPU 设备首次通过 `EnsureReadyAsync()` 按需下载，下载由 Windows Update 执行，用户也可移除。应用应处理未就绪、下载与不支持等状态。
- CPU 实时性能随机器变化。官方推荐至少四个物理核心、3 GHz 基础频率、32 MB L3，这些是建议而非硬性最低规格。
- 当前页面还要求 MSIX 打包与 `systemAIModels` capability。对当前 Tauri 产品的打包方式应单独验证，不能假定调用 WinRT 接口即可工作。

## 自带跨平台离线引擎的候选

| 引擎 | 官方项目所述平台/能力 | 许可证与部署边界 |
| --- | --- | --- |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | README 列出 macOS、Android、Windows 等平台，有 C/C++ 推理核心、Android 示例，支持量化模型等。 | [代码为 MIT](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE)。需随产品处理声明，并单独核对选定模型、转换权重及附属依赖的许可证。模型体积、中文效果和端侧速度需实测。 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 面向跨平台流式/非流式语音识别等任务，可选择适合实时转写的模型。 | [代码为 Apache-2.0](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)。项目支持不等于所有模型具有相同授权；应逐模型检查许可证与模型卡。 |

候选只做源码/文档核查，本次没有拉取模型、编译后端或对样本进行识别。实际选择建议用同一组中文、英文、混合语言、静音、噪声、长录音样本比较质量、实时率、内存、耗电与词时间戳质量。

## 仓库当前实现与可复用边界

本次阅读的工作区已有大量未提交修改，因此下述路径是当前工作区状态，不代表某个干净 Git revision：

- `src/recording-session.ts:17` 定义浏览器录音环境：`getUserMedia({ audio: true })`、`MediaRecorder`、`AudioContext`，在支持的 MIME 类型中选择 Opus WebM / MP4 / WebM。Mac 的原生插件用于授权，实际采集仍走该浏览器环境。
- `src/recording-pcm.ts:2` 定义 24 kHz，完整分段解码后混为单声道 PCM16，再写 WAV。该数据可作为文件转写起点，但各引擎采样率/格式要求不同，不能固定假设 24 kHz 能直接输入所有模型。
- 在 `src`、`src-tauri`、`plugins`（排除生成/构建目录）搜索 `transcript`、`transcrib`、`speechrecogn`、`转写`、`转录`，没有发现现成转写后端或业务实现。此为限定目录与关键词的负向搜索，不是全仓库形式化证明。
- `docs/ui/recording-desktop.md:5` 明确此前录音任务排除了听写、转写与云同步；正文也明确不增加无实际能力的转写按钮。

建议保持共享的音频附件、录音状态、波形与播放体验，在 Tauri 原生边界增加识别适配器。共享数据应至少表达：语言、开始/结束时间、临时或最终文本、错误/取消、模型准备状态。由平台后端返回能力声明（设备端/联网、文件/流式、是否有词时间戳），UI 据此显示实际可用功能。Android/Windows 可以复用体验、会话协议与数据模型；Apple 私有框架和系统模型本身不属于可直接移植部分。
