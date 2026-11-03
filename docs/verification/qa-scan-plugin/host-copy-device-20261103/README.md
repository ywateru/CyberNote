# 独立宿主复制与首次Android运行

见`docs/plan/reviews/app-004-scan-plugin-02.md`。源e6cc378；没有插件生产代码改动。

- `apk-identity.json`/`installed-offline.json`：文件与安装内完整APKhash、首装前提、断网设定。
- `device-before.json`/`offline-install.json`：此前harness包不存在；网络改变/首次安装顺序与实际输出。
- `ocr-first-start.txt`及`ocr-first-offline-1793692256377/`/同名tar：真正首次断网运行，status failed，checks为空，正常创建会话被拒绝，未到ML Kit。
- `perspective-start.json`及`perspective-pdf-1793692399510/`/同名tar：新生命周期实际执行，正常创建会话同样失败；预期图/透视源图保留，未到PDF。
- `path-alias-observation.json`：外部路径只读诊断；不等于实际Java canonical差异实证。
- `network-restored.json`：airplane0/wifi1/mobile_data1与测试前逐项相等；harness force-stop，主应用数据未清。
- `host-copy-result.json`、`host-identity.json`、`host-committed-image.png`：真实Rust宿主扩展+生产分块复制通过；MockRuntime仅代窗口，仍不是主应用集成。

首次OCR失败标记/会话未清除。交给实现者修复后需独立记录新干净harness状态和首次断网时点，不覆盖这些失败证据。
