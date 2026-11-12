# Labs：实验与调研

这里记录针对具体问题的实验、逆向分析和技术选型。每项调研使用 `YYYY-MM-DD-topic/` 目录，保留结论、可复查的证据、复现方式和未解决的问题。

实验结论不自动成为产品需求、已实现功能或生产架构。需要落地时，再将选定方案转入 `docs/` 的设计和实施记录。

| 日期 | 主题 | 状态 |
| --- | --- | --- |
| 2026-11-08 | [系统备忘录录音、转写实现与跨平台可行性](2026-11-08-notes-audio-transcription/README.md) | REA 静态检查、系统框架汇编与官方资料交叉验证；未做麦克风、断网或 Android/Windows 实机实验 |
| 2026-11-08 | [Notes 实际转写接口与自有应用调用实验](2026-11-08-notes-speech-api-probe/README.md) | 深追内部 Transcriber / SpeechAnalyzer SPI；公开 API 已在独立应用、实时 PCM 与 App Sandbox 中运行验证 |
| 2026-11-08 | [SpeechTranscriber 系统版本与硬件条件](2026-11-08-notes-speech-api-probe/availability.md) | 官方 API 元数据、SDK 与 DTS 答复交叉核查；区分 Notes 产品支持范围和运行时能力 |

每项调研建议包含：

- 问题、目标版本和检查边界。
- 直接观察、推断、公开资料和未知项的区别。
- 原始证据或有明确筛选范围的摘录、命令和校验值。
- 对当前项目的影响、候选方案及后续验证标准。
