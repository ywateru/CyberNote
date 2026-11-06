# Mac27准确构建

构建开始HEAD `8b855420ef7f97bc618ee6b1fdf83caf7156e468`；321 个产品/原生/配置/plugin输入前后完全相同。完整命令、原始输出和自然退出均保留；独立核包另验。

|命令|自然退出|外层秒|
|---|---|---|
|mac-build|0|90.247|
|copy-original|0|0.019|
|verify-original|1|0.045|
|copy-derived|0|0.015|
|sign-derived|0|0.051|
|verify-derived|0|0.026|
|inspect-derived|0|0.009|
|archive|0|0.858|
|copy-frontend|0|0.013|

ZIP SHA256 `7d86122f52c904ecc6a24f3407913de4c2e352b936b6937056094d4edf04fc7f`。原始Tauri bundle的严格签名失败保留(code1)，独立派生副本重新ad-hoc签名且strict verify0；原副本未修改。无公证、未执行实际窗口像素验收。

原Android未保存录音、旧AVD和真实麦克风未操作。
